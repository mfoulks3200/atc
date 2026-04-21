import { describe, it, expect } from "vitest";
import {
  CraftStatus,
  SeatType,
  ControlMode,
  VectorStatus,
  BlackBoxEntryType,
  CraftCategoryEnum,
} from "./enums.js";

describe("CraftStatus", () => {
  it("has exactly 8 states", () => {
    const values = Object.values(CraftStatus);
    expect(values).toHaveLength(8);
  });

  it("contains all lifecycle states", () => {
    expect(CraftStatus.Taxiing).toBe("Taxiing");
    expect(CraftStatus.InFlight).toBe("InFlight");
    expect(CraftStatus.LandingChecklist).toBe("LandingChecklist");
    expect(CraftStatus.GoAround).toBe("GoAround");
    expect(CraftStatus.ClearedToLand).toBe("ClearedToLand");
    expect(CraftStatus.Landed).toBe("Landed");
    expect(CraftStatus.Emergency).toBe("Emergency");
    expect(CraftStatus.ReturnToOrigin).toBe("ReturnToOrigin");
  });
});

describe("SeatType", () => {
  it("has exactly 3 seat types", () => {
    expect(Object.values(SeatType)).toHaveLength(3);
  });

  it("contains all seat types", () => {
    expect(SeatType.Captain).toBe("Captain");
    expect(SeatType.FirstOfficer).toBe("FirstOfficer");
    expect(SeatType.Jumpseat).toBe("Jumpseat");
  });
});

describe("ControlMode", () => {
  it("has exactly 2 modes", () => {
    expect(Object.values(ControlMode)).toHaveLength(2);
  });

  it("contains all modes", () => {
    expect(ControlMode.Exclusive).toBe("Exclusive");
    expect(ControlMode.Shared).toBe("Shared");
  });
});

describe("VectorStatus", () => {
  it("has exactly 3 statuses", () => {
    expect(Object.values(VectorStatus)).toHaveLength(3);
  });

  it("contains all statuses", () => {
    expect(VectorStatus.Pending).toBe("Pending");
    expect(VectorStatus.Passed).toBe("Passed");
    expect(VectorStatus.Failed).toBe("Failed");
  });
});

describe("CraftCategoryEnum", () => {
  it("has exactly 4 built-in categories", () => {
    expect(Object.values(CraftCategoryEnum)).toHaveLength(4);
  });

  it("contains all built-in categories (RULE-CRAFT-4)", () => {
    expect(CraftCategoryEnum.BackendEngineering).toBe("Backend Engineering");
    expect(CraftCategoryEnum.FrontendEngineering).toBe("Frontend Engineering");
    expect(CraftCategoryEnum.Infrastructure).toBe("Infrastructure");
    expect(CraftCategoryEnum.Documentation).toBe("Documentation");
  });
});

describe("BlackBoxEntryType", () => {
  it("has exactly 23 entry types", () => {
    expect(Object.values(BlackBoxEntryType)).toHaveLength(23);
  });

  it("contains all entry types", () => {
    expect(BlackBoxEntryType.Decision).toBe("Decision");
    expect(BlackBoxEntryType.VectorPassed).toBe("VectorPassed");
    expect(BlackBoxEntryType.GoAround).toBe("GoAround");
    expect(BlackBoxEntryType.Conflict).toBe("Conflict");
    expect(BlackBoxEntryType.Observation).toBe("Observation");
    expect(BlackBoxEntryType.EmergencyDeclaration).toBe("EmergencyDeclaration");
    expect(BlackBoxEntryType.TFRIssued).toBe("TFRIssued");
    expect(BlackBoxEntryType.TFRLifted).toBe("TFRLifted");
  });

  it("includes ChecklistRun entry type (RULE-CHKL-5)", () => {
    expect(BlackBoxEntryType.ChecklistRun).toBe("ChecklistRun");
  });

  it("includes lifecycle event entry types", () => {
    expect(BlackBoxEntryType.CraftCreated).toBe("CraftCreated");
    expect(BlackBoxEntryType.Launched).toBe("Launched");
    expect(BlackBoxEntryType.VectorFailed).toBe("VectorFailed");
    expect(BlackBoxEntryType.ChecklistItem).toBe("ChecklistItem");
    expect(BlackBoxEntryType.ClearanceRequested).toBe("ClearanceRequested");
    expect(BlackBoxEntryType.TowerEnqueued).toBe("TowerEnqueued");
    expect(BlackBoxEntryType.TowerDequeued).toBe("TowerDequeued");
    expect(BlackBoxEntryType.StateTransition).toBe("StateTransition");
  });
});
