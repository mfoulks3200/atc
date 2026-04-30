import { describe, it, expect } from "vitest";
import { LifecycleEvent } from "@airtrafficcontrol/types";
import type { ChecklistRunResult } from "@airtrafficcontrol/types";
import {
  ChecklistError,
  UnknownChecklistTemplateError,
  VectorChecklistFailedError,
  ClearanceChecklistFailedError,
  InsufficientControlsError,
} from "./checklist.js";
import { AtcError } from "./base.js";

const makeRunResult = (passed: boolean): ChecklistRunResult => ({
  checklistName: "Test Checklist",
  event: LifecycleEvent.BeforeLandingCheck,
  craftCallsign: "ATC-1",
  attempt: 1,
  timestamp: "2024-01-01T00:00:00.000Z",
  passed,
  items: [],
});

describe("ChecklistError", () => {
  it("extends AtcError", () => {
    const err = new ChecklistError("checklist item failed", "RULE-LCHK-3");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new ChecklistError("not holding controls", "RULE-LCHK-1");
    expect(err.message).toBe("not holding controls");
    expect(err.ruleId).toBe("RULE-LCHK-1");
  });

  it("has name set to ChecklistError", () => {
    const err = new ChecklistError("msg", "RULE-LCHK-1");
    expect(err.name).toBe("ChecklistError");
  });

  it("stores optional code when provided", () => {
    const err = new ChecklistError("msg", "RULE-CHKL-4", "VECTOR_CHECKLIST_FAILED");
    expect(err.code).toBe("VECTOR_CHECKLIST_FAILED");
  });

  it("code is undefined when not provided", () => {
    const err = new ChecklistError("msg", "RULE-CHKL-4");
    expect(err.code).toBeUndefined();
  });
});

describe("UnknownChecklistTemplateError", () => {
  it("extends ChecklistError and AtcError", () => {
    const err = new UnknownChecklistTemplateError("unknown templates", ["tmpl-1"]);
    expect(err).toBeInstanceOf(ChecklistError);
    expect(err).toBeInstanceOf(AtcError);
  });

  it("has name UnknownChecklistTemplateError", () => {
    const err = new UnknownChecklistTemplateError("msg", ["tmpl-1"]);
    expect(err.name).toBe("UnknownChecklistTemplateError");
  });

  it("stores unknownTemplateIds", () => {
    const err = new UnknownChecklistTemplateError("msg", ["tmpl-1", "tmpl-2"]);
    expect(err.unknownTemplateIds).toEqual(["tmpl-1", "tmpl-2"]);
  });

  it("stores the error message", () => {
    const err = new UnknownChecklistTemplateError("templates tmpl-1 not found", ["tmpl-1"]);
    expect(err.message).toBe("templates tmpl-1 not found");
  });

  it("sets code to UNKNOWN_CHECKLIST_TEMPLATE", () => {
    const err = new UnknownChecklistTemplateError("msg", ["tmpl-1"]);
    expect(err.code).toBe("UNKNOWN_CHECKLIST_TEMPLATE");
  });

  it("sets ruleId to RULE-SDD-18", () => {
    const err = new UnknownChecklistTemplateError("msg", ["tmpl-1"]);
    expect(err.ruleId).toBe("RULE-SDD-18");
  });
});

describe("VectorChecklistFailedError", () => {
  it("extends ChecklistError", () => {
    const err = new VectorChecklistFailedError("failed", [makeRunResult(false)]);
    expect(err).toBeInstanceOf(ChecklistError);
  });

  it("has name VectorChecklistFailedError", () => {
    const err = new VectorChecklistFailedError("msg", []);
    expect(err.name).toBe("VectorChecklistFailedError");
  });

  it("stores templateResults", () => {
    const results = [makeRunResult(false)];
    const err = new VectorChecklistFailedError("vector checklist failed", results);
    expect(err.templateResults).toEqual(results);
  });

  it("stores the error message", () => {
    const err = new VectorChecklistFailedError("required items failed", []);
    expect(err.message).toBe("required items failed");
  });

  it("sets code to VECTOR_CHECKLIST_FAILED", () => {
    const err = new VectorChecklistFailedError("msg", []);
    expect(err.code).toBe("VECTOR_CHECKLIST_FAILED");
  });

  it("sets ruleId to RULE-CHKL-12", () => {
    const err = new VectorChecklistFailedError("msg", []);
    expect(err.ruleId).toBe("RULE-CHKL-12");
  });
});

describe("ClearanceChecklistFailedError", () => {
  it("extends ChecklistError", () => {
    const err = new ClearanceChecklistFailedError("failed", [makeRunResult(false)]);
    expect(err).toBeInstanceOf(ChecklistError);
  });

  it("has name ClearanceChecklistFailedError", () => {
    const err = new ClearanceChecklistFailedError("msg", []);
    expect(err.name).toBe("ClearanceChecklistFailedError");
  });

  it("stores templateResults", () => {
    const results = [makeRunResult(false)];
    const err = new ClearanceChecklistFailedError("clearance denied", results);
    expect(err.templateResults).toEqual(results);
  });

  it("stores the error message", () => {
    const err = new ClearanceChecklistFailedError("tower denied clearance", []);
    expect(err.message).toBe("tower denied clearance");
  });

  it("sets code to CLEARANCE_CHECKLIST_FAILED", () => {
    const err = new ClearanceChecklistFailedError("msg", []);
    expect(err.code).toBe("CLEARANCE_CHECKLIST_FAILED");
  });

  it("sets ruleId to RULE-CHKL-14", () => {
    const err = new ClearanceChecklistFailedError("msg", []);
    expect(err.ruleId).toBe("RULE-CHKL-14");
  });
});

describe("InsufficientControlsError", () => {
  it("extends ChecklistError", () => {
    const err = new InsufficientControlsError("jumpseat cannot assess");
    expect(err).toBeInstanceOf(ChecklistError);
  });

  it("has name InsufficientControlsError", () => {
    const err = new InsufficientControlsError("msg");
    expect(err.name).toBe("InsufficientControlsError");
  });

  it("stores the error message", () => {
    const err = new InsufficientControlsError("jumpseat pilot cannot assess");
    expect(err.message).toBe("jumpseat pilot cannot assess");
  });

  it("sets code to INSUFFICIENT_CONTROLS", () => {
    const err = new InsufficientControlsError("msg");
    expect(err.code).toBe("INSUFFICIENT_CONTROLS");
  });

  it("sets ruleId to RULE-CHKL-9", () => {
    const err = new InsufficientControlsError("msg");
    expect(err.ruleId).toBe("RULE-CHKL-9");
  });
});
