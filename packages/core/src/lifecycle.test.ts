import { describe, it, expect } from "vitest";
import { CraftStatus, ControlMode, VectorStatus, BlackBoxEntryType } from "@atc/types";
import type { Craft, Pilot } from "@atc/types";
import { transitionCraft, canTransition, isTerminalState } from "./lifecycle.js";

const captain: Pilot = {
  identifier: "captain-1",
  certifications: ["Backend Engineering"],
};

function makeCraft(overrides?: Partial<Craft>): Craft {
  return {
    callsign: "CRAFT-001",
    branch: "feat/craft-001",
    cargo: "Test cargo",
    category: "Backend Engineering",
    captain,
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [
      {
        name: "V1",
        acceptanceCriteria: "Criteria",
        status: VectorStatus.Passed,
      },
    ],
    blackBox: [],
    controls: { mode: ControlMode.Exclusive, holder: "captain-1" },
    status: CraftStatus.Taxiing,
    ...overrides,
  };
}

describe("canTransition", () => {
  it("returns true for valid transitions", () => {
    expect(canTransition(CraftStatus.Taxiing, CraftStatus.InFlight)).toBe(true);
    expect(canTransition(CraftStatus.InFlight, CraftStatus.LandingChecklist)).toBe(true);
    expect(canTransition(CraftStatus.InFlight, CraftStatus.InFlight)).toBe(true);
    expect(canTransition(CraftStatus.LandingChecklist, CraftStatus.ClearedToLand)).toBe(true);
    expect(canTransition(CraftStatus.LandingChecklist, CraftStatus.GoAround)).toBe(true);
    expect(canTransition(CraftStatus.GoAround, CraftStatus.LandingChecklist)).toBe(true);
    expect(canTransition(CraftStatus.GoAround, CraftStatus.Emergency)).toBe(true);
    expect(canTransition(CraftStatus.ClearedToLand, CraftStatus.Landed)).toBe(true);
    expect(canTransition(CraftStatus.Emergency, CraftStatus.ReturnToOrigin)).toBe(true);
  });

  it("returns false for invalid transitions (RULE-LIFE-2)", () => {
    expect(canTransition(CraftStatus.Taxiing, CraftStatus.Landed)).toBe(false);
    expect(canTransition(CraftStatus.InFlight, CraftStatus.ClearedToLand)).toBe(false);
    expect(canTransition(CraftStatus.Landed, CraftStatus.Taxiing)).toBe(false);
    expect(canTransition(CraftStatus.ReturnToOrigin, CraftStatus.Taxiing)).toBe(false);
  });
});

describe("isTerminalState", () => {
  it("returns true for terminal states (RULE-LIFE-8)", () => {
    expect(isTerminalState(CraftStatus.Landed)).toBe(true);
    expect(isTerminalState(CraftStatus.ReturnToOrigin)).toBe(true);
  });

  it("returns false for non-terminal states", () => {
    expect(isTerminalState(CraftStatus.Taxiing)).toBe(false);
    expect(isTerminalState(CraftStatus.InFlight)).toBe(false);
    expect(isTerminalState(CraftStatus.LandingChecklist)).toBe(false);
    expect(isTerminalState(CraftStatus.GoAround)).toBe(false);
    expect(isTerminalState(CraftStatus.ClearedToLand)).toBe(false);
    expect(isTerminalState(CraftStatus.Emergency)).toBe(false);
  });
});

describe("transitionCraft", () => {
  it("transitions from Taxiing to InFlight (RULE-LIFE-3)", () => {
    const craft = makeCraft({ status: CraftStatus.Taxiing });
    const updated = transitionCraft(craft, CraftStatus.InFlight);

    expect(updated.status).toBe(CraftStatus.InFlight);
  });

  it("transitions from InFlight to LandingChecklist when all vectors passed (RULE-LIFE-4)", () => {
    const craft = makeCraft({
      status: CraftStatus.InFlight,
      flightPlan: [
        {
          name: "V1",
          acceptanceCriteria: "C",
          status: VectorStatus.Passed,
        },
      ],
    });
    const updated = transitionCraft(craft, CraftStatus.LandingChecklist);

    expect(updated.status).toBe(CraftStatus.LandingChecklist);
  });

  it("transitions from Emergency to ReturnToOrigin when EmergencyDeclaration exists (RULE-LIFE-7)", () => {
    const craft = makeCraft({
      status: CraftStatus.Emergency,
      blackBox: [
        {
          timestamp: new Date(),
          author: "captain-1",
          type: BlackBoxEntryType.EmergencyDeclaration,
          content: "Cannot resolve merge conflicts",
        },
      ],
    });
    const updated = transitionCraft(craft, CraftStatus.ReturnToOrigin);

    expect(updated.status).toBe(CraftStatus.ReturnToOrigin);
  });

  it("does not mutate the original craft", () => {
    const craft = makeCraft({ status: CraftStatus.Taxiing });
    const updated = transitionCraft(craft, CraftStatus.InFlight);

    expect(craft.status).toBe(CraftStatus.Taxiing);
    expect(updated.status).toBe(CraftStatus.InFlight);
    expect(updated).not.toBe(craft);
  });

  it("throws LifecycleError for invalid transitions (RULE-LIFE-2)", () => {
    const craft = makeCraft({ status: CraftStatus.Taxiing });

    expect(() => transitionCraft(craft, CraftStatus.Landed)).toThrow();
  });

  it("throws LifecycleError when transitioning from a terminal state (RULE-LIFE-8)", () => {
    const craft = makeCraft({ status: CraftStatus.Landed });

    expect(() => transitionCraft(craft, CraftStatus.Taxiing)).toThrow();
  });

  it("throws LifecycleError for InFlight -> LandingChecklist when vectors are not all passed (RULE-LIFE-4)", () => {
    const craft = makeCraft({
      status: CraftStatus.InFlight,
      flightPlan: [
        {
          name: "V1",
          acceptanceCriteria: "C",
          status: VectorStatus.Pending,
        },
      ],
    });

    expect(() => transitionCraft(craft, CraftStatus.LandingChecklist)).toThrow("RULE-LIFE-4");
  });

  it("throws LifecycleError for Emergency -> ReturnToOrigin without EmergencyDeclaration (RULE-LIFE-7)", () => {
    const craft = makeCraft({
      status: CraftStatus.Emergency,
      blackBox: [],
    });

    expect(() => transitionCraft(craft, CraftStatus.ReturnToOrigin)).toThrow("RULE-LIFE-7");
  });
});
