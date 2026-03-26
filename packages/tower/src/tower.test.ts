import { describe, it, expect, beforeEach } from "vitest";
import { CraftStatus, VectorStatus, ControlMode, BlackBoxEntryType } from "@atc/types";
import type { Craft } from "@atc/types";
import { Tower, createTower } from "./tower.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal craft. Override any field as needed. */
function makeCraft(overrides: Partial<Craft> = {}): Craft {
  return {
    callsign: "CRAFT-1",
    branch: "feat/craft-1",
    cargo: "Add widget endpoint",
    category: "Backend Engineering",
    captain: { identifier: "pilot-a", certifications: ["Backend Engineering"] },
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [
      {
        name: "Design",
        acceptanceCriteria: "Schema defined",
        status: VectorStatus.Passed,
      },
      {
        name: "Implement",
        acceptanceCriteria: "Endpoint works",
        status: VectorStatus.Passed,
      },
    ],
    blackBox: [],
    controls: { mode: ControlMode.Exclusive, holder: "pilot-a" },
    status: CraftStatus.ClearedToLand,
    ...overrides,
  };
}

/** Build a craft where all vectors have passed -- ready for clearance. */
function makeReadyCraft(callsign = "READY-1"): Craft {
  return makeCraft({
    callsign,
    branch: `feat/${callsign.toLowerCase()}`,
    status: CraftStatus.LandingChecklist,
    flightPlan: [
      {
        name: "Design",
        acceptanceCriteria: "Done",
        status: VectorStatus.Passed,
      },
      {
        name: "Implement",
        acceptanceCriteria: "Done",
        status: VectorStatus.Passed,
      },
    ],
  });
}

/** Build a craft where a vector has NOT passed. */
function makeUnreadyCraft(callsign = "UNREADY-1"): Craft {
  return makeCraft({
    callsign,
    branch: `feat/${callsign.toLowerCase()}`,
    status: CraftStatus.InFlight,
    flightPlan: [
      {
        name: "Design",
        acceptanceCriteria: "Done",
        status: VectorStatus.Passed,
      },
      {
        name: "Implement",
        acceptanceCriteria: "Done",
        status: VectorStatus.Pending,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// createTower
// ---------------------------------------------------------------------------

describe("createTower", () => {
  it("returns a Tower instance", () => {
    const tower = createTower();
    expect(tower).toBeInstanceOf(Tower);
  });

  it("starts with an empty queue", () => {
    const tower = createTower();
    expect(tower.queueSize).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tower queue operations
// ---------------------------------------------------------------------------

describe("Tower queue", () => {
  let tower: Tower;

  beforeEach(() => {
    tower = createTower();
  });

  describe("enqueue", () => {
    it("adds a craft to the queue", () => {
      tower.enqueue(makeCraft({ callsign: "Q-1" }));
      expect(tower.queueSize).toBe(1);
    });

    it("adds multiple crafts to the queue", () => {
      tower.enqueue(makeCraft({ callsign: "Q-1" }));
      tower.enqueue(makeCraft({ callsign: "Q-2" }));
      tower.enqueue(makeCraft({ callsign: "Q-3" }));
      expect(tower.queueSize).toBe(3);
    });

    it("does not allow duplicate callsigns in the queue", () => {
      tower.enqueue(makeCraft({ callsign: "DUP-1" }));
      expect(() => tower.enqueue(makeCraft({ callsign: "DUP-1" }))).toThrow();
    });
  });

  describe("peek", () => {
    it("returns undefined when queue is empty", () => {
      expect(tower.peek()).toBeUndefined();
    });

    it("returns the first craft enqueued (FCFS, RULE-TMRG-4)", () => {
      tower.enqueue(makeCraft({ callsign: "FIRST" }));
      tower.enqueue(makeCraft({ callsign: "SECOND" }));
      const entry = tower.peek();
      expect(entry).toBeDefined();
      expect(entry!.craft.callsign).toBe("FIRST");
    });

    it("does not remove the craft from the queue", () => {
      tower.enqueue(makeCraft({ callsign: "PEEK-1" }));
      tower.peek();
      expect(tower.queueSize).toBe(1);
    });

    it("includes a requestedAt timestamp", () => {
      tower.enqueue(makeCraft({ callsign: "TIME-1" }));
      const entry = tower.peek();
      expect(entry!.requestedAt).toBeInstanceOf(Date);
    });
  });

  describe("dequeue", () => {
    it("returns undefined when callsign not found", () => {
      expect(tower.dequeue("GHOST")).toBeUndefined();
    });

    it("removes and returns the craft by callsign", () => {
      tower.enqueue(makeCraft({ callsign: "DEQ-1" }));
      const craft = tower.dequeue("DEQ-1");
      expect(craft).toBeDefined();
      expect(craft!.callsign).toBe("DEQ-1");
      expect(tower.queueSize).toBe(0);
    });

    it("can remove a craft from the middle of the queue", () => {
      tower.enqueue(makeCraft({ callsign: "A" }));
      tower.enqueue(makeCraft({ callsign: "B" }));
      tower.enqueue(makeCraft({ callsign: "C" }));
      tower.dequeue("B");
      expect(tower.queueSize).toBe(2);
      expect(tower.peek()!.craft.callsign).toBe("A");
    });

    it("returns undefined for an already-dequeued craft", () => {
      tower.enqueue(makeCraft({ callsign: "ONCE" }));
      tower.dequeue("ONCE");
      expect(tower.dequeue("ONCE")).toBeUndefined();
    });
  });

  describe("queueSize", () => {
    it("reflects enqueue and dequeue operations", () => {
      expect(tower.queueSize).toBe(0);
      tower.enqueue(makeCraft({ callsign: "S-1" }));
      expect(tower.queueSize).toBe(1);
      tower.enqueue(makeCraft({ callsign: "S-2" }));
      expect(tower.queueSize).toBe(2);
      tower.dequeue("S-1");
      expect(tower.queueSize).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Tower.requestClearance
// ---------------------------------------------------------------------------

describe("Tower.requestClearance", () => {
  let tower: Tower;

  beforeEach(() => {
    tower = createTower();
  });

  it("grants clearance when all vectors are passed (RULE-TOWER-2)", () => {
    const craft = makeReadyCraft("CLEAR-1");
    const result = tower.requestClearance(craft);
    expect(result.granted).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("denies clearance when any vector is not passed (RULE-TOWER-2, RULE-TMRG-1)", () => {
    const craft = makeUnreadyCraft("DENY-1");
    const result = tower.requestClearance(craft);
    expect(result.granted).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain("vector");
  });

  it("denies clearance when a vector has Failed status", () => {
    const craft = makeCraft({
      callsign: "FAIL-VEC",
      flightPlan: [
        {
          name: "Design",
          acceptanceCriteria: "Done",
          status: VectorStatus.Passed,
        },
        {
          name: "Implement",
          acceptanceCriteria: "Done",
          status: VectorStatus.Failed,
        },
      ],
    });
    const result = tower.requestClearance(craft);
    expect(result.granted).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("grants clearance for a craft with an empty flight plan (no vectors to fail)", () => {
    const craft = makeCraft({
      callsign: "EMPTY-FP",
      flightPlan: [],
      status: CraftStatus.LandingChecklist,
    });
    const result = tower.requestClearance(craft);
    expect(result.granted).toBe(true);
  });

  it("enqueues the craft when clearance is granted (RULE-TMRG-4)", () => {
    const craft = makeReadyCraft("AUTO-Q");
    tower.requestClearance(craft);
    expect(tower.queueSize).toBe(1);
    expect(tower.peek()!.craft.callsign).toBe("AUTO-Q");
  });

  it("does not enqueue the craft when clearance is denied", () => {
    const craft = makeUnreadyCraft("NO-Q");
    tower.requestClearance(craft);
    expect(tower.queueSize).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tower.declareEmergency
// ---------------------------------------------------------------------------

describe("Tower.declareEmergency", () => {
  let tower: Tower;

  beforeEach(() => {
    tower = createTower();
  });

  it("returns an EmergencyReport with callsign, cargo, flightPlan, blackBox (RULE-EMER-4)", () => {
    const craft = makeCraft({
      callsign: "SOS-1",
      cargo: "Critical fix",
      status: CraftStatus.GoAround,
    });
    const report = tower.declareEmergency(craft, "pilot-a", "Unresolvable conflict");
    expect(report.callsign).toBe("SOS-1");
    expect(report.cargo).toBe("Critical fix");
    expect(report.flightPlan).toEqual(craft.flightPlan);
    expect(report.blackBox).toBeDefined();
  });

  it("only allows the captain to declare emergency (RULE-EMER-1)", () => {
    const craft = makeCraft({
      callsign: "SOS-2",
      captain: { identifier: "captain-x", certifications: ["Backend Engineering"] },
    });
    expect(() => tower.declareEmergency(craft, "not-the-captain", "Reasons")).toThrow();
  });

  it("does not throw when captainId matches the craft captain (RULE-EMER-1)", () => {
    const craft = makeCraft({
      callsign: "SOS-3",
      captain: { identifier: "captain-y", certifications: ["Backend Engineering"] },
    });
    expect(() => tower.declareEmergency(craft, "captain-y", "Reasons")).not.toThrow();
  });

  it("includes an EmergencyDeclaration entry in the report black box (RULE-EMER-2)", () => {
    const craft = makeCraft({
      callsign: "SOS-4",
      status: CraftStatus.GoAround,
      blackBox: [],
    });
    const report = tower.declareEmergency(craft, "pilot-a", "Tests won't pass");
    const emergencyEntries = report.blackBox.filter(
      (e) => e.type === BlackBoxEntryType.EmergencyDeclaration,
    );
    expect(emergencyEntries).toHaveLength(1);
    expect(emergencyEntries[0].content).toContain("Tests won't pass");
    expect(emergencyEntries[0].author).toBe("pilot-a");
  });

  it("removes the craft from the queue if it was enqueued", () => {
    const craft = makeReadyCraft("QUEUED-SOS");
    tower.requestClearance(craft);
    expect(tower.queueSize).toBe(1);
    tower.declareEmergency(craft, "pilot-a", "Changed our mind");
    expect(tower.queueSize).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FCFS ordering (RULE-TMRG-4)
// ---------------------------------------------------------------------------

describe("FCFS ordering (RULE-TMRG-4)", () => {
  it("peek returns crafts in the order they were enqueued", () => {
    const tower = createTower();
    tower.enqueue(makeCraft({ callsign: "FIRST" }));
    tower.enqueue(makeCraft({ callsign: "SECOND" }));
    tower.enqueue(makeCraft({ callsign: "THIRD" }));

    expect(tower.peek()!.craft.callsign).toBe("FIRST");
    tower.dequeue("FIRST");
    expect(tower.peek()!.craft.callsign).toBe("SECOND");
    tower.dequeue("SECOND");
    expect(tower.peek()!.craft.callsign).toBe("THIRD");
  });

  it("requestedAt timestamps are non-decreasing across queue entries", () => {
    const tower = createTower();
    tower.enqueue(makeCraft({ callsign: "T-1" }));
    tower.enqueue(makeCraft({ callsign: "T-2" }));

    // We can't guarantee strict ordering in a synchronous test,
    // but we can verify non-decreasing.
    const first = tower.peek()!.requestedAt;
    tower.dequeue("T-1");
    const second = tower.peek()!.requestedAt;
    expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());
  });
});
