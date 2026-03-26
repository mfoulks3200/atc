import { describe, it, expect } from "vitest";
import { SeatType } from "./enums.js";
import { PERMISSIONS, type PilotAction } from "./permissions.js";

const ALL_ACTIONS: PilotAction[] = [
  "modifyCode",
  "holdControls",
  "writeBlackBox",
  "fileVectorReport",
  "declareEmergency",
  "requestLandingClearance",
];

describe("PERMISSIONS", () => {
  it("has an entry for every SeatType", () => {
    expect(Object.keys(PERMISSIONS)).toHaveLength(Object.values(SeatType).length);
    for (const seat of Object.values(SeatType)) {
      expect(PERMISSIONS[seat]).toBeDefined();
    }
  });

  it("each entry covers all actions", () => {
    for (const seat of Object.values(SeatType)) {
      for (const action of ALL_ACTIONS) {
        expect(typeof PERMISSIONS[seat][action]).toBe("boolean");
      }
    }
  });

  it("Captain can do everything", () => {
    for (const action of ALL_ACTIONS) {
      expect(PERMISSIONS[SeatType.Captain][action]).toBe(true);
    }
  });

  it("First Officer can do everything except declareEmergency", () => {
    expect(PERMISSIONS[SeatType.FirstOfficer].modifyCode).toBe(true);
    expect(PERMISSIONS[SeatType.FirstOfficer].holdControls).toBe(true);
    expect(PERMISSIONS[SeatType.FirstOfficer].writeBlackBox).toBe(true);
    expect(PERMISSIONS[SeatType.FirstOfficer].fileVectorReport).toBe(true);
    expect(PERMISSIONS[SeatType.FirstOfficer].declareEmergency).toBe(false);
    expect(PERMISSIONS[SeatType.FirstOfficer].requestLandingClearance).toBe(true);
  });

  it("Jumpseat can only write to black box", () => {
    expect(PERMISSIONS[SeatType.Jumpseat].modifyCode).toBe(false);
    expect(PERMISSIONS[SeatType.Jumpseat].holdControls).toBe(false);
    expect(PERMISSIONS[SeatType.Jumpseat].writeBlackBox).toBe(true);
    expect(PERMISSIONS[SeatType.Jumpseat].fileVectorReport).toBe(false);
    expect(PERMISSIONS[SeatType.Jumpseat].declareEmergency).toBe(false);
    expect(PERMISSIONS[SeatType.Jumpseat].requestLandingClearance).toBe(false);
  });
});
