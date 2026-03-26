import { describe, it, expect } from "vitest";
import { CraftStatus } from "./enums.js";
import { TRANSITIONS, TERMINAL_STATES, type CraftTransition } from "./lifecycle.js";

describe("TERMINAL_STATES", () => {
  it("contains exactly Landed and ReturnToOrigin", () => {
    expect(TERMINAL_STATES).toEqual(
      new Set([CraftStatus.Landed, CraftStatus.ReturnToOrigin])
    );
  });
});

describe("TRANSITIONS", () => {
  it("has exactly 9 transitions", () => {
    expect(TRANSITIONS).toHaveLength(9);
  });

  it("every transition has from, to, trigger, and preconditions", () => {
    for (const t of TRANSITIONS) {
      expect(t.from).toBeDefined();
      expect(t.to).toBeDefined();
      expect(t.trigger).toBeDefined();
      expect(t.preconditions).toBeDefined();
      expect(Array.isArray(t.preconditions)).toBe(true);
    }
  });

  it("no transitions originate from terminal states", () => {
    for (const t of TRANSITIONS) {
      expect(TERMINAL_STATES.has(t.from)).toBe(false);
    }
  });

  it("includes Taxiing -> InFlight", () => {
    const t = TRANSITIONS.find(
      (t) => t.from === CraftStatus.Taxiing && t.to === CraftStatus.InFlight
    );
    expect(t).toBeDefined();
  });

  it("includes InFlight -> InFlight (vector passage)", () => {
    const t = TRANSITIONS.find(
      (t) => t.from === CraftStatus.InFlight && t.to === CraftStatus.InFlight
    );
    expect(t).toBeDefined();
  });

  it("includes InFlight -> LandingChecklist", () => {
    const t = TRANSITIONS.find(
      (t) => t.from === CraftStatus.InFlight && t.to === CraftStatus.LandingChecklist
    );
    expect(t).toBeDefined();
  });

  it("includes GoAround -> Emergency", () => {
    const t = TRANSITIONS.find(
      (t) => t.from === CraftStatus.GoAround && t.to === CraftStatus.Emergency
    );
    expect(t).toBeDefined();
  });

  it("includes Emergency -> ReturnToOrigin", () => {
    const t = TRANSITIONS.find(
      (t) => t.from === CraftStatus.Emergency && t.to === CraftStatus.ReturnToOrigin
    );
    expect(t).toBeDefined();
  });
});
