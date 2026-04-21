import type { CraftCategory } from "./enums.js";

/**
 * Priority levels for a spec document.
 * @see RULE-SDD-1
 */
export type SpecPriority = "low" | "medium" | "high" | "critical";

/**
 * String literal union of all SDD and vector-command error codes.
 * @see §4.6.8
 */
export type SddErrorCode =
  | "SPEC_PARSE_ERROR"
  | "SPEC_VALIDATION_ERROR"
  | "UNKNOWN_CATEGORY"
  | "CALLSIGN_CONFLICT"
  | "NO_CERTIFIED_PILOT"
  | "PILOT_NOT_CERTIFIED"
  | "PILOT_ROLE_CONFLICT"
  | "BRANCH_CREATION_FAILED"
  | "VECTOR_COMMAND_FAILED"
  | "INSUFFICIENT_SCOPE";

/**
 * Machine-executable verification gate attached to a spec vector.
 * @see RULE-VCMD-1, RULE-VCMD-3, RULE-VCMD-5, RULE-VCMD-6
 */
export interface SpecVectorCommand {
  /**
   * Shell command executed verbatim via `sh -c` in the craft's worktree.
   * @see RULE-VCMD-3
   */
  run: string;
  /**
   * Timeout in milliseconds. Default: 30 000. Max: 300 000.
   * @see RULE-VCMD-6
   */
  timeout?: number;
  /**
   * `required` (default) blocks the vector report on non-zero exit.
   * `advisory` records the failure but does not block.
   * @see RULE-VCMD-5
   */
  severity?: "required" | "advisory";
}

/**
 * A milestone in a spec document's flight plan.
 * At least one of `criteria` or `command` must be present.
 * @see RULE-SDD-2, RULE-SDD-4, RULE-VCMD-1, RULE-VCMD-2
 */
export interface SpecVector {
  /** Short, descriptive milestone name. @see RULE-SDD-2 */
  name: string;
  /**
   * One or more acceptance criteria in natural language.
   * Required unless `command` is present; when both are present, `criteria`
   * documents the human intent behind the command.
   * @see RULE-SDD-2, RULE-VCMD-2
   */
  criteria?: string[];
  /**
   * Optional machine-executable verification gate.
   * @see RULE-VCMD-1, RULE-VCMD-3 through RULE-VCMD-7
   */
  command?: SpecVectorCommand;
}

/**
 * Optional pilot assignment hints in a spec document.
 * @see RULE-SDD-6, RULE-SDD-7, RULE-SDD-8, RULE-SDD-9, RULE-SDD-10
 */
export interface SpecPilotHints {
  /** Explicit captain pilot ID. If absent, auto-selected. @see RULE-SDD-6 */
  captain?: string;
  /** Explicit first officer pilot IDs. @see RULE-SDD-7 */
  firstOfficers?: string[];
  /** Explicit jumpseat pilot IDs. */
  jumpseaters?: string[];
  /** Additional certifications the auto-selected captain must hold. @see RULE-SDD-8 */
  requireCertifications?: string[];
  /** Pilot IDs excluded from auto-selection. @see RULE-SDD-9 */
  exclude?: string[];
}

/**
 * A structured document submitted to ATC to automatically create a craft via
 * the Spec-Driven Development protocol.
 * @see RULE-SDD-1 through RULE-SDD-17
 */
export interface SpecDocument {
  /** Short name for the work. Used in callsign generation and search. @see RULE-SDD-1 */
  title: string;
  /** Full description of the change and its scope. Becomes the craft's cargo. @see RULE-SDD-1 */
  cargo: string;
  /** Craft category. Must match a project-configured category. @see RULE-SDD-1, RULE-SDD-3 */
  category: CraftCategory;
  /** Ordered list of flight-plan milestones. At least one required. @see RULE-SDD-1, RULE-SDD-4 */
  vectors: SpecVector[];
  /** Default: medium. */
  priority?: SpecPriority;
  /**
   * Request immediate craft launch after creation.
   * Subject to layered safety guards.
   * @see RULE-SDD-11, RULE-SDD-12, RULE-SDD-13, RULE-SDD-14
   */
  autoLaunch?: boolean;
  /** Explicit callsign. Must be unique across all crafts in the project. @see RULE-SDD-5 */
  callsignOverride?: string | null;
  /** Optional pilot assignment hints. @see RULE-SDD-6, RULE-SDD-7 */
  pilots?: SpecPilotHints;
  /** Markdown notes stored verbatim in the craft's black box at creation. @see RULE-SDD-16 */
  notes?: string | null;
  /** Arbitrary key-value pairs stored in the black box. @see RULE-SDD-16 */
  metadata?: Record<string, string>;
}
