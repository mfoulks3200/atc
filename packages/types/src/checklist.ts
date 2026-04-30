import type { CraftCategory } from "./enums.js";
import type { LifecycleEvent } from "./events.js";

/**
 * Severity level for a checklist item.
 * @see RULE-CHKL-4
 */
export enum ChecklistItemSeverity {
  /** Failure blocks before-event transitions. */
  Required = "required",
  /** Failure is logged but does not block. */
  Advisory = "advisory",
}

/**
 * Executor that runs a shell command. Pass/fail on exit code (0 = pass).
 * @see RULE-CHKL-1
 */
export interface ShellExecutor {
  readonly type: "shell";
  readonly command: string;
}

/**
 * Executor that invokes an MCP tool by name with parameters.
 * @see RULE-CHKL-1
 */
export interface McpToolExecutor {
  readonly type: "mcp-tool";
  readonly tool: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Union of all executor types. @see RULE-CHKL-1 */
export type ChecklistExecutor = ShellExecutor | McpToolExecutor;

/**
 * String literal union of all checklist error codes.
 * @see §4.6.x
 */
export type ChecklistErrorCode =
  | "UNKNOWN_CHECKLIST_TEMPLATE"
  | "VECTOR_CHECKLIST_FAILED"
  | "CLEARANCE_CHECKLIST_FAILED"
  | "INSUFFICIENT_CONTROLS";

/**
 * A single checklist item definition within a template.
 * @see RULE-CHKL-1
 */
export interface ChecklistItemDef {
  /** Machine key, unique within template. */
  readonly name: string;
  /** Human-readable display name shown in UIs and notifications. */
  readonly title: string;
  /** Always surfaced to the agent for context. For agent-assessed items, guides evaluation. */
  readonly description?: string;
  /** Surfaced only on failure. Distinct from description which is always shown. @see RULE-CHKL-1 */
  readonly failureMessage?: string;
  /** Required items block before-event transitions; advisory items log warnings. */
  readonly severity: ChecklistItemSeverity;
  /**
   * How to run the check. When absent, the item is agent-assessed — the pilot
   * holding controls evaluates it and reports pass/fail with justification.
   * @see RULE-CHKL-9
   */
  readonly executor?: ChecklistExecutor;
}

/**
 * A reusable checklist template.
 * @see RULE-CHKL-1, RULE-CHKL-2
 */
export interface ChecklistTemplate {
  /** UUID. Immutable after creation. */
  readonly id: string;
  /** Human-readable template name. */
  readonly name: string;
  /** Purpose of this checklist. */
  readonly description?: string;
  /** Ordered list of items. Executed sequentially. @see RULE-CHKL-7 */
  readonly items: readonly ChecklistItemDef[];
}

/**
 * Links a template to a lifecycle event for a craft category.
 * @see RULE-CHKL-2, RULE-CHKL-10
 */
export interface ChecklistBinding {
  /** References a ChecklistTemplate.id. */
  readonly templateId: string;
  /** The lifecycle event that triggers this checklist. */
  readonly event: LifecycleEvent;
  /** Craft category this applies to. "*" matches all categories. */
  readonly craftCategory: CraftCategory | "*";
  /**
   * Scopes this binding to a specific vector name. Only meaningful for
   * `before:vector-complete` and `after:vector-complete` events; ignored for
   * all other events. When absent, the binding runs for every vector.
   * @see RULE-CHKL-10
   */
  readonly vectorName?: string;
}

/**
 * Per-craft modifications to inherited template bindings.
 * @see RULE-CHKL-3
 */
export interface CraftChecklistOverride {
  /** The craft this override applies to. */
  readonly craftCallsign: string;
  /** The template binding being overridden. */
  readonly templateId: string;
  /** The event being overridden. */
  readonly event: LifecycleEvent;
  /** Items appended after template items. */
  readonly addItems?: readonly ChecklistItemDef[];
  /** Item names to skip from the template. */
  readonly removeItems?: readonly string[];
  /** If true, the template is not run for this craft. */
  readonly disableTemplate?: boolean;
}

/**
 * Result of a single checklist item execution.
 * @see RULE-CHKL-5
 */
export interface ChecklistItemResult {
  /** Machine key. */
  readonly name: string;
  /** Human-readable display name. */
  readonly title: string;
  /** Whether this item passed. */
  readonly passed: boolean;
  /** Severity at time of execution. */
  readonly severity: ChecklistItemSeverity;
  /**
   * For executor items: failure description from item definition or captured output.
   * For agent-assessed items: the agent's justification (MUST be non-empty per RULE-CHKL-9).
   */
  readonly message?: string;
  /** Captured stdout/stderr (capped at 500 lines). Null for agent-assessed items. */
  readonly output?: string;
  /** Execution time in milliseconds. */
  readonly durationMs: number;
  /**
   * True when the item had no executor and was evaluated by the pilot.
   * @see RULE-CHKL-9
   */
  readonly agentAssessed: boolean;
}

/**
 * Aggregate result of running a checklist. Recorded in the black box.
 * @see RULE-CHKL-5
 */
export interface ChecklistRunResult {
  /** Template name that was executed. */
  readonly checklistName: string;
  /** The event that triggered the run. */
  readonly event: LifecycleEvent;
  /** The craft this ran against. */
  readonly craftCallsign: string;
  /** Attempt number (1-indexed). */
  readonly attempt: number;
  /** When the run completed. */
  readonly timestamp: string;
  /** True if no required items failed. */
  readonly passed: boolean;
  /** Per-item results. */
  readonly items: readonly ChecklistItemResult[];
}

/**
 * Groups results when multiple templates are bound to the same event.
 * Each bound template produces its own ChecklistRunResult.
 * @see RULE-CHKL-11
 */
export interface MultiChecklistRunResult {
  /** The event that triggered all runs. */
  readonly event: LifecycleEvent;
  /** The craft these ran against. */
  readonly craftCallsign: string;
  /** Per-template results in binding registration order. */
  readonly templateResults: readonly ChecklistRunResult[];
  /** True if all templates passed (no required failures in any template). */
  readonly allPassed: boolean;
}
