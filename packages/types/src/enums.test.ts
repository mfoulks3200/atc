import { describe, it, expect } from "vitest";
import { CraftStatus, SeatType, ControlMode, VectorStatus, BlackBoxEntryType } from "./enums.js";

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

describe("BlackBoxEntryType", () => {
  it("has exactly 6 entry types", () => {
    expect(Object.values(BlackBoxEntryType)).toHaveLength(6);
  });

  it("contains all entry types", () => {
    expect(BlackBoxEntryType.Decision).toBe("Decision");
    expect(BlackBoxEntryType.VectorPassed).toBe("VectorPassed");
    expect(BlackBoxEntryType.GoAround).toBe("GoAround");
    expect(BlackBoxEntryType.Conflict).toBe("Conflict");
    expect(BlackBoxEntryType.Observation).toBe("Observation");
    expect(BlackBoxEntryType.EmergencyDeclaration).toBe("EmergencyDeclaration");
  });
});
