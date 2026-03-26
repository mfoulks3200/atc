import { describe, it, expect } from "vitest";
import { SeatType } from "@atc/types";
import type { PilotAction } from "@atc/types";
import { canHoldControls, canPerformAction } from "./permissions.js";

// --- canHoldControls ---

describe("canHoldControls", () => {
  it("returns true for Captain", () => {
    expect(canHoldControls(SeatType.Captain)).toBe(true);
  });

  it("returns true for FirstOfficer", () => {
    expect(canHoldControls(SeatType.FirstOfficer)).toBe(true);
  });

  it("returns false for Jumpseat", () => {
    expect(canHoldControls(SeatType.Jumpseat)).toBe(false);
  });
});

// --- canPerformAction ---

describe("canPerformAction", () => {
  describe("Captain permissions", () => {
    it.each<[PilotAction, boolean]>([
      ["modifyCode", true],
      ["holdControls", true],
      ["writeBlackBox", true],
      ["fileVectorReport", true],
      ["declareEmergency", true],
      ["requestLandingClearance", true],
    ])("Captain can %s: %s", (action, expected) => {
      expect(canPerformAction(SeatType.Captain, action)).toBe(expected);
    });
  });

  describe("FirstOfficer permissions", () => {
    it.each<[PilotAction, boolean]>([
      ["modifyCode", true],
      ["holdControls", true],
      ["writeBlackBox", true],
      ["fileVectorReport", true],
      ["declareEmergency", false],
      ["requestLandingClearance", true],
    ])("FirstOfficer can %s: %s", (action, expected) => {
      expect(canPerformAction(SeatType.FirstOfficer, action)).toBe(expected);
    });
  });

  describe("Jumpseat permissions", () => {
    it.each<[PilotAction, boolean]>([
      ["modifyCode", false],
      ["holdControls", false],
      ["writeBlackBox", true],
      ["fileVectorReport", false],
      ["declareEmergency", false],
      ["requestLandingClearance", false],
    ])("Jumpseat can %s: %s", (action, expected) => {
      expect(canPerformAction(SeatType.Jumpseat, action)).toBe(expected);
    });
  });

  describe("cross-checks with canHoldControls", () => {
    it("canPerformAction(seat, 'holdControls') agrees with canHoldControls(seat)", () => {
      for (const seat of [SeatType.Captain, SeatType.FirstOfficer, SeatType.Jumpseat]) {
        expect(canPerformAction(seat, "holdControls")).toBe(canHoldControls(seat));
      }
    });
  });
});
