import { describe, it, expect } from "vitest";
import { ControlMode, SeatType } from "@atc/types";
import type { SharedControlArea } from "@atc/types";
import {
  createInitialControls,
  claimExclusiveControls,
  shareControls,
  isHoldingControls,
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
