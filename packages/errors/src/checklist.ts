import type { ChecklistErrorCode, ChecklistRunResult } from "@airtrafficcontrol/types";
import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-CHKL-* invariant is violated.
 * Covers checklist constraints: template validation,
 * binding resolution, item execution, and transition gating.
 *
 * @see RULE-CHKL-1 through RULE-CHKL-14
 */
export class ChecklistError extends AtcError {
  override readonly name: string = "ChecklistError";

  /** Structured error code for programmatic handling. */
  readonly code?: ChecklistErrorCode;

  constructor(message: string, ruleId: string, code?: ChecklistErrorCode) {
    super(message, ruleId);
    this.code = code;
  }
}

/**
 * A spec vector references a checklist template that does not exist.
 * @see RULE-SDD-18
 */
export class UnknownChecklistTemplateError extends ChecklistError {
  override readonly name: string = "UnknownChecklistTemplateError";

  /** Template IDs that could not be resolved. */
  readonly unknownTemplateIds: readonly string[];

  constructor(message: string, unknownTemplateIds: string[]) {
    super(message, "RULE-SDD-18", "UNKNOWN_CHECKLIST_TEMPLATE");
    this.unknownTemplateIds = unknownTemplateIds;
  }
}

/**
 * A required checklist item failed for a vector-scoped `before:vector-complete` binding.
 * The vector report cannot be filed until failures are addressed.
 * @see RULE-CHKL-12
 */
export class VectorChecklistFailedError extends ChecklistError {
  override readonly name: string = "VectorChecklistFailedError";

  /** Per-template results showing which items failed. */
  readonly templateResults: readonly ChecklistRunResult[];

  constructor(message: string, templateResults: ChecklistRunResult[]) {
    super(message, "RULE-CHKL-12", "VECTOR_CHECKLIST_FAILED");
    this.templateResults = templateResults;
  }
}

/**
 * A required item in a `before:tower-clearance` checklist failed.
 * The tower denies clearance and sends the craft on a go-around.
 * @see RULE-CHKL-14
 */
export class ClearanceChecklistFailedError extends ChecklistError {
  override readonly name: string = "ClearanceChecklistFailedError";

  /** Per-template results showing which items failed. */
  readonly templateResults: readonly ChecklistRunResult[];

  constructor(message: string, templateResults: ChecklistRunResult[]) {
    super(message, "RULE-CHKL-14", "CLEARANCE_CHECKLIST_FAILED");
    this.templateResults = templateResults;
  }
}

/**
 * A Jumpseat pilot attempted to evaluate an agent-assessed checklist item.
 * Only pilots holding controls (Captain or First Officer) may self-assess.
 * @see RULE-CHKL-9
 */
export class InsufficientControlsError extends ChecklistError {
  override readonly name: string = "InsufficientControlsError";

  constructor(message: string) {
    super(message, "RULE-CHKL-9", "INSUFFICIENT_CONTROLS");
  }
}
