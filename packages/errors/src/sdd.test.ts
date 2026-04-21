import { describe, it, expect } from "vitest";
import {
  SpecError,
  SpecParseError,
  SpecValidationError,
  UnknownCategoryError,
  CallsignConflictError,
  NoCertifiedPilotError,
  PilotNotCertifiedError,
  PilotRoleConflictError,
  BranchCreationFailedError,
} from "./sdd.js";
import { AtcError } from "./base.js";

describe("SpecError", () => {
  it("extends AtcError", () => {
    const err = new SpecError("msg", "RULE-SDD-1", "SPEC_PARSE_ERROR");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message, ruleId, and code", () => {
    const err = new SpecError("parse failed", "RULE-SDD-1", "SPEC_PARSE_ERROR");
    expect(err.message).toBe("parse failed");
    expect(err.ruleId).toBe("RULE-SDD-1");
    expect(err.code).toBe("SPEC_PARSE_ERROR");
  });

  it("has name set to SpecError", () => {
    const err = new SpecError("msg", "RULE-SDD-1", "SPEC_PARSE_ERROR");
    expect(err.name).toBe("SpecError");
  });
});

describe("SpecParseError", () => {
  it("extends SpecError", () => {
    expect(new SpecParseError("bad yaml")).toBeInstanceOf(SpecError);
  });

  it("has SPEC_PARSE_ERROR code and RULE-SDD-1", () => {
    const err = new SpecParseError("bad yaml");
    expect(err.code).toBe("SPEC_PARSE_ERROR");
    expect(err.ruleId).toBe("RULE-SDD-1");
  });

  it("has name set to SpecParseError", () => {
    expect(new SpecParseError("msg").name).toBe("SpecParseError");
  });
});

describe("SpecValidationError", () => {
  it("extends SpecError", () => {
    expect(new SpecValidationError("missing title", "title")).toBeInstanceOf(SpecError);
  });

  it("has SPEC_VALIDATION_ERROR code", () => {
    expect(new SpecValidationError("missing", "title").code).toBe("SPEC_VALIDATION_ERROR");
  });

  it("stores the field that failed", () => {
    const err = new SpecValidationError("vectors must be non-empty", "vectors");
    expect(err.field).toBe("vectors");
  });

  it("defaults ruleId to RULE-SDD-1", () => {
    expect(new SpecValidationError("msg", "title").ruleId).toBe("RULE-SDD-1");
  });

  it("accepts a custom ruleId", () => {
    const err = new SpecValidationError("no criteria", "vectors[0].criteria", "RULE-SDD-2");
    expect(err.ruleId).toBe("RULE-SDD-2");
  });

  it("has name set to SpecValidationError", () => {
    expect(new SpecValidationError("msg", "f").name).toBe("SpecValidationError");
  });
});

describe("UnknownCategoryError", () => {
  it("extends SpecError", () => {
    expect(new UnknownCategoryError("unknown")).toBeInstanceOf(SpecError);
  });

  it("has UNKNOWN_CATEGORY code and RULE-SDD-3", () => {
    const err = new UnknownCategoryError("unknown category: Quantum");
    expect(err.code).toBe("UNKNOWN_CATEGORY");
    expect(err.ruleId).toBe("RULE-SDD-3");
  });

  it("has name set to UnknownCategoryError", () => {
    expect(new UnknownCategoryError("msg").name).toBe("UnknownCategoryError");
  });
});

describe("CallsignConflictError", () => {
  it("extends SpecError", () => {
    expect(new CallsignConflictError("conflict")).toBeInstanceOf(SpecError);
  });

  it("has CALLSIGN_CONFLICT code and RULE-SDD-5", () => {
    const err = new CallsignConflictError("callsign already exists");
    expect(err.code).toBe("CALLSIGN_CONFLICT");
    expect(err.ruleId).toBe("RULE-SDD-5");
  });

  it("has name set to CallsignConflictError", () => {
    expect(new CallsignConflictError("msg").name).toBe("CallsignConflictError");
  });
});

describe("NoCertifiedPilotError", () => {
  it("extends SpecError", () => {
    expect(new NoCertifiedPilotError("no pilots")).toBeInstanceOf(SpecError);
  });

  it("has NO_CERTIFIED_PILOT code and RULE-SDD-9", () => {
    const err = new NoCertifiedPilotError("no certified pilots available");
    expect(err.code).toBe("NO_CERTIFIED_PILOT");
    expect(err.ruleId).toBe("RULE-SDD-9");
  });

  it("has name set to NoCertifiedPilotError", () => {
    expect(new NoCertifiedPilotError("msg").name).toBe("NoCertifiedPilotError");
  });
});

describe("PilotNotCertifiedError", () => {
  it("extends SpecError", () => {
    expect(new PilotNotCertifiedError("not certified")).toBeInstanceOf(SpecError);
  });

  it("has PILOT_NOT_CERTIFIED code", () => {
    expect(new PilotNotCertifiedError("msg").code).toBe("PILOT_NOT_CERTIFIED");
  });

  it("defaults ruleId to RULE-SDD-6 (captain)", () => {
    expect(new PilotNotCertifiedError("msg").ruleId).toBe("RULE-SDD-6");
  });

  it("accepts RULE-SDD-7 for first officer violations", () => {
    const err = new PilotNotCertifiedError("FO not certified", "RULE-SDD-7");
    expect(err.ruleId).toBe("RULE-SDD-7");
  });

  it("has name set to PilotNotCertifiedError", () => {
    expect(new PilotNotCertifiedError("msg").name).toBe("PilotNotCertifiedError");
  });
});

describe("PilotRoleConflictError", () => {
  it("extends SpecError", () => {
    expect(new PilotRoleConflictError("conflict")).toBeInstanceOf(SpecError);
  });

  it("has PILOT_ROLE_CONFLICT code and RULE-SDD-10", () => {
    const err = new PilotRoleConflictError("pilot-1 is both captain and first officer");
    expect(err.code).toBe("PILOT_ROLE_CONFLICT");
    expect(err.ruleId).toBe("RULE-SDD-10");
  });

  it("has name set to PilotRoleConflictError", () => {
    expect(new PilotRoleConflictError("msg").name).toBe("PilotRoleConflictError");
  });
});

describe("BranchCreationFailedError", () => {
  it("extends SpecError", () => {
    expect(new BranchCreationFailedError("failed")).toBeInstanceOf(SpecError);
  });

  it("has BRANCH_CREATION_FAILED code", () => {
    expect(new BranchCreationFailedError("git error").code).toBe("BRANCH_CREATION_FAILED");
  });

  it("has name set to BranchCreationFailedError", () => {
    expect(new BranchCreationFailedError("msg").name).toBe("BranchCreationFailedError");
  });
});

describe("instanceof hierarchy", () => {
  it("all SDD errors are AtcError instances", () => {
    const errors = [
      new SpecParseError("msg"),
      new SpecValidationError("msg", "f"),
      new UnknownCategoryError("msg"),
      new CallsignConflictError("msg"),
      new NoCertifiedPilotError("msg"),
      new PilotNotCertifiedError("msg"),
      new PilotRoleConflictError("msg"),
      new BranchCreationFailedError("msg"),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(AtcError);
      expect(err).toBeInstanceOf(SpecError);
    }
  });
});
