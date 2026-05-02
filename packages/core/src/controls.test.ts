import { describe, it, expect } from "vitest";
import { ControlMode, SeatType } from "@airtrafficcontrol/types";
import type { SharedControlArea } from "@airtrafficcontrol/types";
import { ControlsError } from "@airtrafficcontrol/errors";
import {
  createInitialControls,
  claimExclusiveControls,
  shareControls,
  isHoldingControls,
  validateControlsReleasedForAdversarialReview,
} from "./controls.js";

describe("createInitialControls", () => {
  it("creates Exclusive mode with the captain as holder (RULE-CTRL-1)", () => {
    const controls = createInitialControls("captain-1");

    expect(controls.mode).toBe(ControlMode.Exclusive);
    expect(controls.holder).toBe("captain-1");
    expect(controls.sharedAreas).toBeUndefined();
  });
});

describe("claimExclusiveControls", () => {
  it("transfers controls to a new pilot with Captain seat", () => {
    const initial = createInitialControls("captain-1");
    const updated = claimExclusiveControls(initial, "fo-1", SeatType.FirstOfficer);

    expect(updated.mode).toBe(ControlMode.Exclusive);
    expect(updated.holder).toBe("fo-1");
  });

  it("allows the captain to reclaim controls", () => {
    const initial = createInitialControls("captain-1");
    const transferred = claimExclusiveControls(initial, "fo-1", SeatType.FirstOfficer);
    const reclaimed = claimExclusiveControls(transferred, "captain-1", SeatType.Captain);

    expect(reclaimed.holder).toBe("captain-1");
  });

  it("throws ControlsError when a jumpseat pilot claims controls (RULE-CTRL-2)", () => {
    const initial = createInitialControls("captain-1");

    expect(() => claimExclusiveControls(initial, "observer-1", SeatType.Jumpseat)).toThrow(
      "RULE-CTRL-2",
    );
  });

  it("does not mutate the original ControlState", () => {
    const initial = createInitialControls("captain-1");
    const updated = claimExclusiveControls(initial, "fo-1", SeatType.FirstOfficer);

    expect(initial.holder).toBe("captain-1");
    expect(updated.holder).toBe("fo-1");
    expect(updated).not.toBe(initial);
  });
});

describe("shareControls", () => {
  it("creates Shared mode with the given areas (RULE-CTRL-5)", () => {
    const areas: SharedControlArea[] = [
      { pilotIdentifier: "captain-1", area: "src/api/" },
      { pilotIdentifier: "fo-1", area: "src/ui/" },
    ];
    const controls = shareControls(areas);

    expect(controls.mode).toBe(ControlMode.Shared);
    expect(controls.holder).toBeUndefined();
    expect(controls.sharedAreas).toEqual(areas);
  });

  it("throws ControlsError when areas array is empty", () => {
    expect(() => shareControls([])).toThrow("RULE-CTRL-5");
  });

  it("throws ControlsError when duplicate pilots appear in areas", () => {
    const areas: SharedControlArea[] = [
      { pilotIdentifier: "captain-1", area: "src/api/" },
      { pilotIdentifier: "captain-1", area: "src/models/" },
    ];

    expect(() => shareControls(areas)).toThrow();
  });

  it("accepts shared controls when all pilots are Captain or FirstOfficer (RULE-CTRL-2)", () => {
    const areas: SharedControlArea[] = [
      { pilotIdentifier: "captain-1", area: "src/api/" },
      { pilotIdentifier: "fo-1", area: "src/ui/" },
    ];
    const seats = new Map([
      ["captain-1", SeatType.Captain],
      ["fo-1", SeatType.FirstOfficer],
    ]);
    const controls = shareControls(areas, seats);

    expect(controls.mode).toBe(ControlMode.Shared);
    expect(controls.sharedAreas).toEqual(areas);
  });

  it("throws ControlsError when a Jumpseat pilot is in shared areas (RULE-CTRL-2)", () => {
    const areas: SharedControlArea[] = [
      { pilotIdentifier: "captain-1", area: "src/api/" },
      { pilotIdentifier: "observer-1", area: "src/ui/" },
    ];
    const seats = new Map([
      ["captain-1", SeatType.Captain],
      ["observer-1", SeatType.Jumpseat],
    ]);

    expect(() => shareControls(areas, seats)).toThrow("RULE-CTRL-2");
  });

  it("skips seat validation when seatAssignments is not provided", () => {
    const areas: SharedControlArea[] = [{ pilotIdentifier: "anyone-1", area: "src/api/" }];

    // Should not throw even though we don't know seat types
    const controls = shareControls(areas);
    expect(controls.mode).toBe(ControlMode.Shared);
  });
});

describe("validateControlsReleasedForAdversarialReview", () => {
  it("passes when builder no longer holds exclusive controls (RULE-CTRL-3a)", () => {
    const controls = createInitialControls("captain-1");
    // FO has claimed controls from the builder — builder released
    const transferred = claimExclusiveControls(controls, "fo-1", SeatType.FirstOfficer);

    expect(() =>
      validateControlsReleasedForAdversarialReview(transferred, "captain-1"),
    ).not.toThrow();
  });

  it("throws ControlsError when builder still holds exclusive controls (RULE-CTRL-3a)", () => {
    const controls = createInitialControls("builder-1");

    expect(() =>
      validateControlsReleasedForAdversarialReview(controls, "builder-1"),
    ).toThrow(ControlsError);
  });

  it("includes RULE-CTRL-3a in the thrown error ruleId", () => {
    const controls = createInitialControls("builder-1");

    try {
      validateControlsReleasedForAdversarialReview(controls, "builder-1");
    } catch (err) {
      expect(err).toBeInstanceOf(ControlsError);
      expect((err as ControlsError).ruleId).toBe("RULE-CTRL-3a");
    }
  });

  it("passes when controls are in Shared mode (builder implicitly released exclusive hold)", () => {
    const areas: SharedControlArea[] = [
      { pilotIdentifier: "fo-1", area: "src/api/" },
    ];
    const controls = shareControls(areas);

    expect(() =>
      validateControlsReleasedForAdversarialReview(controls, "builder-1"),
    ).not.toThrow();
  });
});

describe("isHoldingControls", () => {
  it("returns true for the exclusive holder (RULE-CTRL-3)", () => {
    const controls = createInitialControls("captain-1");

    expect(isHoldingControls(controls, "captain-1")).toBe(true);
  });

  it("returns false for a non-holder in exclusive mode", () => {
    const controls = createInitialControls("captain-1");

    expect(isHoldingControls(controls, "fo-1")).toBe(false);
  });

  it("returns true for a pilot in their shared area", () => {
    const areas: SharedControlArea[] = [
      { pilotIdentifier: "captain-1", area: "src/api/" },
      { pilotIdentifier: "fo-1", area: "src/ui/" },
    ];
    const controls = shareControls(areas);

    expect(isHoldingControls(controls, "captain-1")).toBe(true);
    expect(isHoldingControls(controls, "fo-1")).toBe(true);
  });

  it("returns false for a pilot not in any shared area", () => {
    const areas: SharedControlArea[] = [
      { pilotIdentifier: "captain-1", area: "src/api/" },
      { pilotIdentifier: "fo-1", area: "src/ui/" },
    ];
    const controls = shareControls(areas);

    expect(isHoldingControls(controls, "observer-1")).toBe(false);
  });
});
