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
 * A single checklist item definition within a template.
 * @see RULE-CHKL-1
 */
export interface ChecklistItemDef {
  /** Unique within template. Display name for the item. */
  readonly name: string;
  /** Returned to agents on failure for remediation context. */
  readonly description?: string;
  /** Required items block before-event transitions; advisory items log warnings. */
  readonly severity: ChecklistItemSeverity;
  /** How to run the check. */
  readonly executor: ChecklistExecutor;
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
 * @see RULE-CHKL-2
 */
export interface ChecklistBinding {
  /** References a ChecklistTemplate.id. */
  readonly templateId: string;
  /** The lifecycle event that triggers this checklist. */
  readonly event: LifecycleEvent;
  /** Craft category this applies to. "*" matches all categories. */
  readonly craftCategory: string;
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
  /** Item name. */
  readonly name: string;
  /** Whether this item passed. */
  readonly passed: boolean;
  /** Severity at time of execution. */
  readonly severity: ChecklistItemSeverity;
  /** Failure description (from item definition). */
  readonly message?: string;
  /** Captured stdout/stderr (capped at 500 lines). */
  readonly output?: string;
  /** Execution time in milliseconds. */
  readonly durationMs: number;
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
