import type { SddErrorCode } from "@airtrafficcontrol/types";
import { AtcError } from "./base.js";

/**
 * Base class for all SDD protocol rule violations.
 * Carries both the RULE-SDD-* identifier and a structured error code.
 *
 * @see §4.6.8
 */
export class SpecError extends AtcError {
  override readonly name: string = "SpecError";

  /** The structured SDD error code. @see §4.6.8 */
  readonly code: SddErrorCode;

  constructor(message: string, ruleId: string, code: SddErrorCode) {
    super(message, ruleId);
    this.code = code;
  }
}

/**
 * Spec document is malformed YAML/JSON and could not be parsed.
 * @see §4.6.1
 */
export class SpecParseError extends SpecError {
  override readonly name: string = "SpecParseError";

  constructor(message: string) {
    super(message, "RULE-SDD-1", "SPEC_PARSE_ERROR");
  }
}

/**
 * A required field is missing or invalid in the spec document.
 * @see RULE-SDD-1, RULE-SDD-2, RULE-SDD-4
 */
export class SpecValidationError extends SpecError {
  override readonly name: string = "SpecValidationError";

  /** The field or reason that caused the validation failure. */
  readonly field: string;

  /**
   * @param message - Human-readable description of the validation failure.
   * @param field - The specific field or constraint that failed.
   * @param ruleId - The RULE-SDD-* that was violated. Defaults to RULE-SDD-1.
   */
  constructor(message: string, field: string, ruleId: string = "RULE-SDD-1") {
    super(message, ruleId, "SPEC_VALIDATION_ERROR");
    this.field = field;
  }
}

/**
 * The spec's category does not match any project-configured craft category.
 * @see RULE-SDD-3
 */
export class UnknownCategoryError extends SpecError {
  override readonly name: string = "UnknownCategoryError";

  constructor(message: string) {
    super(message, "RULE-SDD-3", "UNKNOWN_CATEGORY");
  }
}

/**
 * The callsign override is already in use by another craft in the project.
 * @see RULE-SDD-5
 */
export class CallsignConflictError extends SpecError {
  override readonly name: string = "CallsignConflictError";

  constructor(message: string) {
    super(message, "RULE-SDD-5", "CALLSIGN_CONFLICT");
  }
}

/**
 * No certified pilot is available after all filters are applied.
 *
 * The error message MUST enumerate the required category, any additional
 * requireCertifications, and the certifications held by each available pilot.
 *
 * @see RULE-SDD-9
 */
export class NoCertifiedPilotError extends SpecError {
  override readonly name: string = "NoCertifiedPilotError";

  constructor(message: string) {
    super(message, "RULE-SDD-9", "NO_CERTIFIED_PILOT");
  }
}

/**
 * An explicitly named pilot lacks the required certification for the spec's category.
 * @see RULE-SDD-6, RULE-SDD-7
 */
export class PilotNotCertifiedError extends SpecError {
  override readonly name: string = "PilotNotCertifiedError";

  /**
   * @param message - Human-readable description.
   * @param ruleId - RULE-SDD-6 for captain violations, RULE-SDD-7 for first officers.
   */
  constructor(message: string, ruleId: string = "RULE-SDD-6") {
    super(message, ruleId, "PILOT_NOT_CERTIFIED");
  }
}

/**
 * The same pilot was assigned as both captain and first officer.
 * @see RULE-SDD-10
 */
export class PilotRoleConflictError extends SpecError {
  override readonly name: string = "PilotRoleConflictError";

  constructor(message: string) {
    super(message, "RULE-SDD-10", "PILOT_ROLE_CONFLICT");
  }
}

/**
 * The git branch could not be created. No craft record is written.
 * @see §4.6.1
 */
export class BranchCreationFailedError extends SpecError {
  override readonly name: string = "BranchCreationFailedError";

  constructor(message: string) {
    super(message, "RULE-SDD-1", "BRANCH_CREATION_FAILED");
  }
}
