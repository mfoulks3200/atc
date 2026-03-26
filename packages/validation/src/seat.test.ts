import { describe, it, expect } from "vitest";
import type { Pilot } from "@atc/types";
import { SeatType } from "@atc/types";
import { isValidSeatAssignment, validateSeatAssignment, validateCraftCrew } from "./seat.js";

// --- Test fixtures ---

const certifiedPilot: Pilot = {
  identifier: "ace",
  certifications: ["Backend Engineering", "Frontend Engineering"],
};

const uncertifiedPilot: Pilot = {
  identifier: "rookie",
  certifications: [],
};

const infraPilot: Pilot = {
  identifier: "ops",
  certifications: ["Infrastructure"],
};

const CATEGORY = "Backend Engineering";

// --- isValidSeatAssignment ---

describe("isValidSeatAssignment", () => {
  describe("Captain seat", () => {
    it("returns true when pilot is certified for the category", () => {
      expect(isValidSeatAssignment(certifiedPilot, SeatType.Captain, CATEGORY)).toBe(true);
    });

    it("returns false when pilot is not certified for the category", () => {
      expect(isValidSeatAssignment(uncertifiedPilot, SeatType.Captain, CATEGORY)).toBe(false);
    });

    it("returns false when pilot is certified for a different category", () => {
      expect(isValidSeatAssignment(infraPilot, SeatType.Captain, CATEGORY)).toBe(false);
    });
  });

  describe("FirstOfficer seat", () => {
    it("returns true when pilot is certified for the category", () => {
      expect(isValidSeatAssignment(certifiedPilot, SeatType.FirstOfficer, CATEGORY)).toBe(true);
    });

    it("returns false when pilot is not certified for the category", () => {
      expect(isValidSeatAssignment(uncertifiedPilot, SeatType.FirstOfficer, CATEGORY)).toBe(false);
    });
  });

  describe("Jumpseat", () => {
    it("returns true even when pilot is not certified", () => {
      expect(isValidSeatAssignment(uncertifiedPilot, SeatType.Jumpseat, CATEGORY)).toBe(true);
    });

    it("returns true when pilot is certified (certification not required)", () => {
      expect(isValidSeatAssignment(certifiedPilot, SeatType.Jumpseat, CATEGORY)).toBe(true);
    });

    it("returns true for pilot with empty certifications", () => {
      expect(isValidSeatAssignment(uncertifiedPilot, SeatType.Jumpseat, CATEGORY)).toBe(true);
    });
  });
});

// --- validateSeatAssignment ---

describe("validateSeatAssignment", () => {
  it("does not throw when assignment is valid", () => {
    expect(() => validateSeatAssignment(certifiedPilot, SeatType.Captain, CATEGORY)).not.toThrow();
  });

  it("does not throw for valid jumpseat assignment", () => {
    expect(() =>
      validateSeatAssignment(uncertifiedPilot, SeatType.Jumpseat, CATEGORY),
    ).not.toThrow();
  });

  it("throws SeatAssignmentError when uncertified pilot takes Captain seat", () => {
    expect(() => validateSeatAssignment(uncertifiedPilot, SeatType.Captain, CATEGORY)).toThrow();
  });

  it("throws SeatAssignmentError when uncertified pilot takes FirstOfficer seat", () => {
    expect(() =>
      validateSeatAssignment(uncertifiedPilot, SeatType.FirstOfficer, CATEGORY),
    ).toThrow();
  });

  it("thrown error has ruleId referencing RULE-SEAT-2", () => {
    try {
      validateSeatAssignment(uncertifiedPilot, SeatType.Captain, CATEGORY);
      expect.unreachable("should have thrown");
    } catch (error: unknown) {
      expect(error).toHaveProperty("ruleId", "RULE-SEAT-2");
    }
  });

  it("thrown error message includes pilot identifier and category", () => {
    try {
      validateSeatAssignment(uncertifiedPilot, SeatType.FirstOfficer, CATEGORY);
      expect.unreachable("should have thrown");
    } catch (error: unknown) {
      const message = (error as Error).message;
      expect(message).toContain("rookie");
      expect(message).toContain(CATEGORY);
    }
  });
});

// --- validateCraftCrew ---

describe("validateCraftCrew", () => {
  it("does not throw for a valid crew (certified captain, certified FOs)", () => {
    expect(() => validateCraftCrew(certifiedPilot, [certifiedPilot], CATEGORY)).not.toThrow();
  });

  it("does not throw for captain with no first officers", () => {
    expect(() => validateCraftCrew(certifiedPilot, [], CATEGORY)).not.toThrow();
  });

  it("throws when captain is not certified for category (RULE-SEAT-2)", () => {
    expect(() => validateCraftCrew(uncertifiedPilot, [], CATEGORY)).toThrow();
  });

  it("throws when any first officer is not certified (RULE-SEAT-2)", () => {
    expect(() =>
      validateCraftCrew(certifiedPilot, [certifiedPilot, uncertifiedPilot], CATEGORY),
    ).toThrow();
  });

  it("thrown error for uncertified FO includes the FO's identifier", () => {
    try {
      validateCraftCrew(certifiedPilot, [uncertifiedPilot], CATEGORY);
      expect.unreachable("should have thrown");
    } catch (error: unknown) {
      const message = (error as Error).message;
      expect(message).toContain("rookie");
    }
  });

  it("validates all first officers, not just the first one", () => {
    const secondUncertified: Pilot = {
      identifier: "also-rookie",
      certifications: [],
    };
    expect(() =>
      validateCraftCrew(certifiedPilot, [certifiedPilot, secondUncertified], CATEGORY),
    ).toThrow();
  });
});
