import { describe, it, expect } from "vitest";
import type { Pilot, SpecDocument } from "@airtrafficcontrol/types";
import {
  CallsignConflictError,
  PilotNotCertifiedError,
  PilotRoleConflictError,
  SpecValidationError,
  UnknownCategoryError,
} from "@airtrafficcontrol/errors";
import {
  validateSpecCallsign,
  validateSpecCategory,
  validateSpecDocument,
  validateSpecPilots,
  validateSpecVectors,
} from "./spec.js";

// --- Fixtures ---

const CATEGORY = "Backend Engineering";

const CERTIFIED: Pilot = { identifier: "ace", certifications: [CATEGORY], selectionCount: 0 };
const UNCERTIFIED: Pilot = { identifier: "rookie", certifications: [], selectionCount: 0 };
const OTHER_CERTIFIED: Pilot = {
  identifier: "other-ace",
  certifications: [CATEGORY],
  selectionCount: 0,
};

const VALID_SPEC: SpecDocument = {
  title: "My Feature",
  cargo: "Add a new feature to the system.",
  category: CATEGORY,
  vectors: [{ name: "Implementation", criteria: ["All tests pass"] }],
};

// --- validateSpecDocument ---

describe("validateSpecDocument", () => {
  it("does not throw for a valid spec", () => {
    expect(() => validateSpecDocument(VALID_SPEC)).not.toThrow();
  });

  it("throws SpecValidationError when title is empty string", () => {
    expect(() => validateSpecDocument({ ...VALID_SPEC, title: "" })).toThrow(SpecValidationError);
  });

  it("throws SpecValidationError when title is whitespace only", () => {
    expect(() => validateSpecDocument({ ...VALID_SPEC, title: "   " })).toThrow(SpecValidationError);
  });

  it("thrown error for missing title references 'title' field", () => {
    try {
      validateSpecDocument({ ...VALID_SPEC, title: "" });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as SpecValidationError).field).toBe("title");
    }
  });

  it("throws SpecValidationError when cargo is empty string", () => {
    expect(() => validateSpecDocument({ ...VALID_SPEC, cargo: "" })).toThrow(SpecValidationError);
  });

  it("throws SpecValidationError when cargo is whitespace only", () => {
    expect(() => validateSpecDocument({ ...VALID_SPEC, cargo: "  " })).toThrow(SpecValidationError);
  });

  it("thrown error for missing cargo references 'cargo' field", () => {
    try {
      validateSpecDocument({ ...VALID_SPEC, cargo: "" });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as SpecValidationError).field).toBe("cargo");
    }
  });

  it("throws SpecValidationError when category is empty string", () => {
    expect(() =>
      validateSpecDocument({ ...VALID_SPEC, category: "" as typeof CATEGORY }),
    ).toThrow(SpecValidationError);
  });

  it("thrown error for missing category references 'category' field", () => {
    try {
      validateSpecDocument({ ...VALID_SPEC, category: "" as typeof CATEGORY });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as SpecValidationError).field).toBe("category");
    }
  });

  it("delegates vector validation and throws when vectors is empty", () => {
    expect(() => validateSpecDocument({ ...VALID_SPEC, vectors: [] })).toThrow(SpecValidationError);
  });

  it("thrown error for empty vectors has ruleId RULE-SDD-1", () => {
    try {
      validateSpecDocument({ ...VALID_SPEC, vectors: [] });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as SpecValidationError).ruleId).toBe("RULE-SDD-1");
    }
  });

  it("thrown errors for title/cargo/category have ruleId RULE-SDD-1", () => {
    try {
      validateSpecDocument({ ...VALID_SPEC, title: "" });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as SpecValidationError).ruleId).toBe("RULE-SDD-1");
    }
  });
});

// --- validateSpecVectors ---

describe("validateSpecVectors", () => {
  it("does not throw for a valid single vector", () => {
    expect(() =>
      validateSpecVectors([{ name: "Step 1", criteria: ["Criterion A"] }]),
    ).not.toThrow();
  });

  it("does not throw for multiple valid vectors", () => {
    expect(() =>
      validateSpecVectors([
        { name: "Step 1", criteria: ["Criterion A"] },
        { name: "Step 2", criteria: ["Criterion B", "Criterion C"] },
      ]),
    ).not.toThrow();
  });

  it("throws SpecValidationError when array is empty (RULE-SDD-1)", () => {
    expect(() => validateSpecVectors([])).toThrow(SpecValidationError);
  });

  it("thrown error for empty array has ruleId RULE-SDD-1", () => {
    try {
      validateSpecVectors([]);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as SpecValidationError).ruleId).toBe("RULE-SDD-1");
    }
  });

  it("throws SpecValidationError when a vector has no name (RULE-SDD-2)", () => {
    expect(() => validateSpecVectors([{ name: "", criteria: ["ok"] }])).toThrow(SpecValidationError);
  });

  it("throws SpecValidationError when a vector name is whitespace only", () => {
    expect(() =>
      validateSpecVectors([{ name: "   ", criteria: ["ok"] }]),
    ).toThrow(SpecValidationError);
  });

  it("thrown error for missing name has ruleId RULE-SDD-2", () => {
    try {
      validateSpecVectors([{ name: "", criteria: ["ok"] }]);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as SpecValidationError).ruleId).toBe("RULE-SDD-2");
    }
  });

  it("throws SpecValidationError when a vector has no criteria (RULE-SDD-2)", () => {
    expect(() => validateSpecVectors([{ name: "Step", criteria: [] }])).toThrow(SpecValidationError);
  });

  it("throws SpecValidationError when all criteria are empty strings (RULE-SDD-2)", () => {
    expect(() =>
      validateSpecVectors([{ name: "Step", criteria: ["", "   "] }]),
    ).toThrow(SpecValidationError);
  });

  it("thrown error for empty criteria references vectors[].criteria field", () => {
    try {
      validateSpecVectors([{ name: "Step", criteria: [] }]);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as SpecValidationError).field).toBe("vectors[].criteria");
    }
  });

  it("thrown error for empty criteria includes the vector name", () => {
    try {
      validateSpecVectors([{ name: "My Vector", criteria: [] }]);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as Error).message).toContain("My Vector");
    }
  });

  it("does not throw when criteria has at least one non-empty string among empties", () => {
    expect(() =>
      validateSpecVectors([{ name: "Step", criteria: ["", "real criterion", ""] }]),
    ).not.toThrow();
  });

  it("validates all vectors, not just the first", () => {
    expect(() =>
      validateSpecVectors([
        { name: "Good", criteria: ["ok"] },
        { name: "Bad", criteria: [] },
      ]),
    ).toThrow(SpecValidationError);
  });
});

// --- validateSpecCategory ---

describe("validateSpecCategory", () => {
  const PROJECT_CATEGORIES = ["Backend Engineering", "Frontend Engineering", "Infrastructure"];

  it("does not throw when category matches a project category", () => {
    expect(() => validateSpecCategory("Backend Engineering", PROJECT_CATEGORIES)).not.toThrow();
  });

  it("throws UnknownCategoryError when category is not in project categories", () => {
    expect(() => validateSpecCategory("Data Science", PROJECT_CATEGORIES)).toThrow(
      UnknownCategoryError,
    );
  });

  it("thrown error includes the unrecognized category name", () => {
    try {
      validateSpecCategory("Data Science", PROJECT_CATEGORIES);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as Error).message).toContain("Data Science");
    }
  });

  it("thrown error has ruleId RULE-SDD-3", () => {
    try {
      validateSpecCategory("Data Science", PROJECT_CATEGORIES);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as UnknownCategoryError).ruleId).toBe("RULE-SDD-3");
    }
  });

  it("throws when projectCategories is empty", () => {
    expect(() => validateSpecCategory("Backend Engineering", [])).toThrow(UnknownCategoryError);
  });

  it("matching is case-sensitive", () => {
    expect(() => validateSpecCategory("backend engineering", PROJECT_CATEGORIES)).toThrow(
      UnknownCategoryError,
    );
  });
});

// --- validateSpecCallsign ---

describe("validateSpecCallsign", () => {
  const EXISTING = ["PHOENIX-1", "FALCON-3", "HAWK-7"];

  it("does not throw when callsign is not in use", () => {
    expect(() => validateSpecCallsign("EAGLE-1", EXISTING)).not.toThrow();
  });

  it("throws CallsignConflictError when callsign is already in use", () => {
    expect(() => validateSpecCallsign("PHOENIX-1", EXISTING)).toThrow(CallsignConflictError);
  });

  it("thrown error includes the conflicting callsign", () => {
    try {
      validateSpecCallsign("FALCON-3", EXISTING);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as Error).message).toContain("FALCON-3");
    }
  });

  it("thrown error has ruleId RULE-SDD-5", () => {
    try {
      validateSpecCallsign("PHOENIX-1", EXISTING);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as CallsignConflictError).ruleId).toBe("RULE-SDD-5");
    }
  });

  it("does not throw when existing callsigns list is empty", () => {
    expect(() => validateSpecCallsign("EAGLE-1", [])).not.toThrow();
  });

  it("matching is case-sensitive", () => {
    expect(() => validateSpecCallsign("phoenix-1", EXISTING)).not.toThrow();
  });
});

// --- validateSpecPilots ---

describe("validateSpecPilots", () => {
  const PILOTS = [CERTIFIED, UNCERTIFIED, OTHER_CERTIFIED];

  describe("no explicit hints", () => {
    it("does not throw when hints object is empty", () => {
      expect(() => validateSpecPilots({}, PILOTS, CATEGORY)).not.toThrow();
    });

    it("does not throw when captain and firstOfficers are both undefined", () => {
      expect(() =>
        validateSpecPilots({ requireCertifications: ["extra"] }, PILOTS, CATEGORY),
      ).not.toThrow();
    });
  });

  describe("explicit captain (RULE-SDD-6)", () => {
    it("does not throw when explicit captain is certified", () => {
      expect(() =>
        validateSpecPilots({ captain: "ace" }, PILOTS, CATEGORY),
      ).not.toThrow();
    });

    it("throws PilotNotCertifiedError when captain is not certified", () => {
      expect(() =>
        validateSpecPilots({ captain: "rookie" }, PILOTS, CATEGORY),
      ).toThrow(PilotNotCertifiedError);
    });

    it("throws PilotNotCertifiedError when captain ID is not in the pilots pool", () => {
      expect(() =>
        validateSpecPilots({ captain: "ghost-pilot" }, PILOTS, CATEGORY),
      ).toThrow(PilotNotCertifiedError);
    });

    it("thrown error for uncertified captain has ruleId RULE-SDD-6", () => {
      try {
        validateSpecPilots({ captain: "rookie" }, PILOTS, CATEGORY);
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect((err as PilotNotCertifiedError).ruleId).toBe("RULE-SDD-6");
      }
    });

    it("thrown error for uncertified captain includes pilot identifier", () => {
      try {
        validateSpecPilots({ captain: "rookie" }, PILOTS, CATEGORY);
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect((err as Error).message).toContain("rookie");
      }
    });

    it("thrown error for uncertified captain includes category name", () => {
      try {
        validateSpecPilots({ captain: "rookie" }, PILOTS, CATEGORY);
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect((err as Error).message).toContain(CATEGORY);
      }
    });
  });

  describe("explicit first officers (RULE-SDD-7)", () => {
    it("does not throw when all explicit FOs are certified", () => {
      expect(() =>
        validateSpecPilots({ firstOfficers: ["ace", "other-ace"] }, PILOTS, CATEGORY),
      ).not.toThrow();
    });

    it("throws PilotNotCertifiedError when an FO is not certified", () => {
      expect(() =>
        validateSpecPilots({ firstOfficers: ["rookie"] }, PILOTS, CATEGORY),
      ).toThrow(PilotNotCertifiedError);
    });

    it("throws PilotNotCertifiedError when an FO ID is not in the pilots pool", () => {
      expect(() =>
        validateSpecPilots({ firstOfficers: ["ghost-fo"] }, PILOTS, CATEGORY),
      ).toThrow(PilotNotCertifiedError);
    });

    it("thrown error for uncertified FO has ruleId RULE-SDD-7", () => {
      try {
        validateSpecPilots({ firstOfficers: ["rookie"] }, PILOTS, CATEGORY);
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect((err as PilotNotCertifiedError).ruleId).toBe("RULE-SDD-7");
      }
    });

    it("thrown error for uncertified FO includes the FO's identifier", () => {
      try {
        validateSpecPilots({ firstOfficers: ["rookie"] }, PILOTS, CATEGORY);
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect((err as Error).message).toContain("rookie");
      }
    });

    it("validates all FOs, not just the first one", () => {
      expect(() =>
        validateSpecPilots({ firstOfficers: ["ace", "rookie"] }, PILOTS, CATEGORY),
      ).toThrow(PilotNotCertifiedError);
    });

    it("does not throw for an empty firstOfficers array", () => {
      expect(() =>
        validateSpecPilots({ firstOfficers: [] }, PILOTS, CATEGORY),
      ).not.toThrow();
    });
  });

  describe("role conflict (RULE-SDD-10)", () => {
    it("throws PilotRoleConflictError when same pilot is captain and in firstOfficers", () => {
      expect(() =>
        validateSpecPilots({ captain: "ace", firstOfficers: ["ace", "other-ace"] }, PILOTS, CATEGORY),
      ).toThrow(PilotRoleConflictError);
    });

    it("role conflict is detected before certification check", () => {
      // rookie is uncertified, but role conflict should be the error thrown
      expect(() =>
        validateSpecPilots(
          { captain: "rookie", firstOfficers: ["rookie"] },
          PILOTS,
          CATEGORY,
        ),
      ).toThrow(PilotRoleConflictError);
    });

    it("thrown error has ruleId RULE-SDD-10", () => {
      try {
        validateSpecPilots({ captain: "ace", firstOfficers: ["ace"] }, PILOTS, CATEGORY);
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect((err as PilotRoleConflictError).ruleId).toBe("RULE-SDD-10");
      }
    });

    it("thrown error includes the conflicting pilot identifier", () => {
      try {
        validateSpecPilots({ captain: "ace", firstOfficers: ["ace"] }, PILOTS, CATEGORY);
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect((err as Error).message).toContain("ace");
      }
    });

    it("does not throw when different certified pilots fill captain and FO roles", () => {
      expect(() =>
        validateSpecPilots(
          { captain: "ace", firstOfficers: ["other-ace"] },
          PILOTS,
          CATEGORY,
        ),
      ).not.toThrow();
    });
  });
});
