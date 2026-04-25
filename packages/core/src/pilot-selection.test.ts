import { describe, it, expect } from "vitest";
import { computeWorkloadScore, selectCaptain, selectFirstOfficers } from "./pilot-selection.js";
import type { SelectionParams } from "./pilot-selection.js";
import { NoCertifiedPilotError } from "@airtrafficcontrol/errors";
import type { Pilot, Craft } from "@airtrafficcontrol/types";
import { CraftStatus, CraftCategoryEnum, ControlMode } from "@airtrafficcontrol/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePilot(
  id: string,
  certifications: string[] = [CraftCategoryEnum.BackendEngineering],
  selectionCount = 0,
): Pilot {
  return { identifier: id, certifications, selectionCount };
}

function makeCraft(captain: Pilot, status: CraftStatus, firstOfficers: Pilot[] = []): Craft {
  return {
    callsign: `craft-${captain.identifier}`,
    createdAt: new Date(),
    branch: `branch-${captain.identifier}`,
    cargo: "test cargo",
    category: CraftCategoryEnum.BackendEngineering,
    captain,
    firstOfficers,
    jumpseaters: [],
    flightPlan: [],
    blackBox: [],
    controls: { mode: ControlMode.Exclusive, holder: captain.identifier },
    holdingPattern: false,
    status,
  };
}

const ACTIVE_STATUSES = [CraftStatus.Taxiing, CraftStatus.InFlight, CraftStatus.ClearedToLand];

const INACTIVE_STATUSES = [
  CraftStatus.Landed,
  CraftStatus.LandingChecklist,
  CraftStatus.GoAround,
  CraftStatus.Emergency,
  CraftStatus.ReturnToOrigin,
];

// ---------------------------------------------------------------------------
// computeWorkloadScore
// ---------------------------------------------------------------------------

describe("computeWorkloadScore", () => {
  it("returns 0 for a pilot with no active crafts", () => {
    const pilot = makePilot("alice");
    expect(computeWorkloadScore(pilot, [], 0.5)).toBe(0);
  });

  it("counts active captaincy at weight 1.0", () => {
    const pilot = makePilot("alice");
    const craft = makeCraft(pilot, CraftStatus.InFlight);
    expect(computeWorkloadScore(pilot, [craft], 0.5)).toBe(1.0);
  });

  it("counts active FO assignment at the given foWeight", () => {
    const captain = makePilot("charlie");
    const fo = makePilot("alice");
    const craft = makeCraft(captain, CraftStatus.InFlight, [fo]);
    expect(computeWorkloadScore(fo, [craft], 0.5)).toBe(0.5);
  });

  it("respects custom foWeight", () => {
    const captain = makePilot("charlie");
    const fo = makePilot("alice");
    const craft = makeCraft(captain, CraftStatus.Taxiing, [fo]);
    expect(computeWorkloadScore(fo, [craft], 0.75)).toBe(0.75);
  });

  it("only counts Taxiing, InFlight, LandingClearanceRequested as active", () => {
    const pilot = makePilot("alice");
    for (const status of ACTIVE_STATUSES) {
      const craft = makeCraft(pilot, status);
      expect(computeWorkloadScore(pilot, [craft], 0.5)).toBeGreaterThan(0);
    }
  });

  it("does not count inactive craft statuses", () => {
    const pilot = makePilot("alice");
    for (const status of INACTIVE_STATUSES) {
      const craft = makeCraft(pilot, status);
      expect(computeWorkloadScore(pilot, [craft], 0.5)).toBe(0);
    }
  });

  it("sums multiple active captaincies", () => {
    const pilot = makePilot("alice");
    const c1 = makeCraft(pilot, CraftStatus.Taxiing);
    const c2 = makeCraft(pilot, CraftStatus.InFlight);
    expect(computeWorkloadScore(pilot, [c1, c2], 0.5)).toBe(2.0);
  });

  it("sums captaincy and FO contributions together", () => {
    const captain = makePilot("charlie");
    const pilot = makePilot("alice");
    const asCaptain = makeCraft(pilot, CraftStatus.InFlight);
    const asFo = makeCraft(captain, CraftStatus.Taxiing, [pilot]);
    expect(computeWorkloadScore(pilot, [asCaptain, asFo], 0.5)).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// selectCaptain
// ---------------------------------------------------------------------------

describe("selectCaptain", () => {
  const category = CraftCategoryEnum.BackendEngineering;

  it("selects a pilot certified for the craft category", () => {
    const pilot = makePilot("alice", [CraftCategoryEnum.BackendEngineering]);
    const params: SelectionParams = { category, pilots: [pilot], activeCrafts: [], foWeight: 0.5 };
    const selected = selectCaptain(params);
    expect(selected.identifier).toBe("alice");
  });

  it("throws NoCertifiedPilotError when no pilot holds the category cert", () => {
    const pilot = makePilot("alice", [CraftCategoryEnum.FrontendEngineering]);
    const params: SelectionParams = { category, pilots: [pilot], activeCrafts: [], foWeight: 0.5 };
    expect(() => selectCaptain(params)).toThrow(NoCertifiedPilotError);
  });

  it("NoCertifiedPilotError message enumerates the required category", () => {
    const pilot = makePilot("alice", [CraftCategoryEnum.FrontendEngineering]);
    const params: SelectionParams = { category, pilots: [pilot], activeCrafts: [], foWeight: 0.5 };
    try {
      selectCaptain(params);
    } catch (err) {
      expect((err as NoCertifiedPilotError).message).toContain(category);
    }
  });

  it("NoCertifiedPilotError message lists each pilot's certifications", () => {
    const pilot = makePilot("alice", [CraftCategoryEnum.FrontendEngineering]);
    const params: SelectionParams = { category, pilots: [pilot], activeCrafts: [], foWeight: 0.5 };
    try {
      selectCaptain(params);
    } catch (err) {
      const msg = (err as NoCertifiedPilotError).message;
      expect(msg).toContain("alice");
      expect(msg).toContain(CraftCategoryEnum.FrontendEngineering);
    }
  });

  it("excludes pilots in the exclude list", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering]);
    const bob = makePilot("bob", [CraftCategoryEnum.BackendEngineering]);
    const params: SelectionParams = {
      category,
      pilots: [alice, bob],
      activeCrafts: [],
      foWeight: 0.5,
      exclude: ["alice"],
    };
    const selected = selectCaptain(params);
    expect(selected.identifier).toBe("bob");
  });

  it("throws NoCertifiedPilotError when all certified pilots are excluded", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering]);
    const params: SelectionParams = {
      category,
      pilots: [alice],
      activeCrafts: [],
      foWeight: 0.5,
      exclude: ["alice"],
    };
    expect(() => selectCaptain(params)).toThrow(NoCertifiedPilotError);
  });

  it("applies requireCertifications filter", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering]);
    const bob = makePilot("bob", [CraftCategoryEnum.BackendEngineering, "security-clearance"]);
    const params: SelectionParams = {
      category,
      pilots: [alice, bob],
      activeCrafts: [],
      foWeight: 0.5,
      requireCertifications: ["security-clearance"],
    };
    const selected = selectCaptain(params);
    expect(selected.identifier).toBe("bob");
  });

  it("throws NoCertifiedPilotError when requireCertifications eliminates all candidates", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering]);
    const params: SelectionParams = {
      category,
      pilots: [alice],
      activeCrafts: [],
      foWeight: 0.5,
      requireCertifications: ["security-clearance"],
    };
    expect(() => selectCaptain(params)).toThrow(NoCertifiedPilotError);
  });

  it("selects the pilot with the lowest workload score", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering]);
    const bob = makePilot("bob", [CraftCategoryEnum.BackendEngineering]);
    const bobCraft = makeCraft(bob, CraftStatus.InFlight);
    const params: SelectionParams = {
      category,
      pilots: [alice, bob],
      activeCrafts: [bobCraft],
      foWeight: 0.5,
    };
    const selected = selectCaptain(params);
    expect(selected.identifier).toBe("alice");
  });

  it("breaks workload ties by selectionCount ascending", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering], 5);
    const bob = makePilot("bob", [CraftCategoryEnum.BackendEngineering], 2);
    const params: SelectionParams = {
      category,
      pilots: [alice, bob],
      activeCrafts: [],
      foWeight: 0.5,
    };
    const selected = selectCaptain(params);
    expect(selected.identifier).toBe("bob");
  });

  it("increments the selected pilot's selectionCount", () => {
    const pilot = makePilot("alice", [CraftCategoryEnum.BackendEngineering], 3);
    const params: SelectionParams = { category, pilots: [pilot], activeCrafts: [], foWeight: 0.5 };
    const selected = selectCaptain(params);
    expect(selected.selectionCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// selectFirstOfficers
// ---------------------------------------------------------------------------

describe("selectFirstOfficers", () => {
  const category = CraftCategoryEnum.BackendEngineering;

  it("returns empty array when minCrew is 0 or not specified", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering]);
    const captain = makePilot("captain", [CraftCategoryEnum.BackendEngineering]);
    const params: SelectionParams = {
      category,
      pilots: [alice, captain],
      activeCrafts: [],
      foWeight: 0.5,
    };
    const fos = selectFirstOfficers(captain, params);
    expect(fos).toHaveLength(0);
  });

  it("selects the required number of first officers", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering]);
    const bob = makePilot("bob", [CraftCategoryEnum.BackendEngineering]);
    const captain = makePilot("captain", [CraftCategoryEnum.BackendEngineering]);
    const params: SelectionParams = {
      category,
      pilots: [alice, bob, captain],
      activeCrafts: [],
      foWeight: 0.5,
      minFirstOfficers: 2,
    };
    const fos = selectFirstOfficers(captain, params);
    expect(fos).toHaveLength(2);
  });

  it("excludes the chosen captain from FO candidates (RULE-SDD-10)", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering]);
    const captain = makePilot("captain", [CraftCategoryEnum.BackendEngineering]);
    const params: SelectionParams = {
      category,
      pilots: [alice, captain],
      activeCrafts: [],
      foWeight: 0.5,
      minFirstOfficers: 1,
    };
    const fos = selectFirstOfficers(captain, params);
    expect(fos.map((p) => p.identifier)).not.toContain("captain");
  });

  it("throws NoCertifiedPilotError when not enough certified FO candidates exist", () => {
    const captain = makePilot("captain", [CraftCategoryEnum.BackendEngineering]);
    const params: SelectionParams = {
      category,
      pilots: [captain],
      activeCrafts: [],
      foWeight: 0.5,
      minFirstOfficers: 1,
    };
    expect(() => selectFirstOfficers(captain, params)).toThrow(NoCertifiedPilotError);
  });

  it("does not assign the same pilot as both captain and FO — RULE-SDD-10", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering]);
    const bob = makePilot("bob", [CraftCategoryEnum.BackendEngineering]);
    const captain = alice;
    const params: SelectionParams = {
      category,
      pilots: [alice, bob],
      activeCrafts: [],
      foWeight: 0.5,
      minFirstOfficers: 1,
    };
    const fos = selectFirstOfficers(captain, params);
    for (const fo of fos) {
      expect(fo.identifier).not.toBe(captain.identifier);
    }
  });

  it("increments selectionCount for each selected FO", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering], 0);
    const captain = makePilot("captain", [CraftCategoryEnum.BackendEngineering]);
    const params: SelectionParams = {
      category,
      pilots: [alice, captain],
      activeCrafts: [],
      foWeight: 0.5,
      minFirstOfficers: 1,
    };
    const fos = selectFirstOfficers(captain, params);
    expect(fos[0].selectionCount).toBe(1);
  });

  it("selects FOs by workload score ascending then selectionCount tie-break", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering], 10);
    const bob = makePilot("bob", [CraftCategoryEnum.BackendEngineering], 2);
    const captain = makePilot("captain", [CraftCategoryEnum.BackendEngineering]);
    const params: SelectionParams = {
      category,
      pilots: [alice, bob, captain],
      activeCrafts: [],
      foWeight: 0.5,
      minFirstOfficers: 1,
    };
    const fos = selectFirstOfficers(captain, params);
    expect(fos[0].identifier).toBe("bob");
  });

  it("respects exclude list for FO candidates", () => {
    const alice = makePilot("alice", [CraftCategoryEnum.BackendEngineering]);
    const bob = makePilot("bob", [CraftCategoryEnum.BackendEngineering]);
    const captain = makePilot("captain", [CraftCategoryEnum.BackendEngineering]);
    const params: SelectionParams = {
      category,
      pilots: [alice, bob, captain],
      activeCrafts: [],
      foWeight: 0.5,
      minFirstOfficers: 1,
      exclude: ["alice"],
    };
    const fos = selectFirstOfficers(captain, params);
    expect(fos.map((p) => p.identifier)).not.toContain("alice");
  });
});
