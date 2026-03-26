/**
 * Result of a single checklist item validation.
 *
 * @see RULE-LCHK-2 — each item contributes a pass/fail to the aggregate result.
 */
export interface ChecklistItemResult {
  /** Name of the checklist item that produced this result. */
  readonly name: string;
  /** Whether the validation passed. */
  readonly passed: boolean;
  /** Optional human-readable message (e.g., error details on failure). */
  readonly message?: string;
}

/**
 * A single checklist item — a named async validation step.
 *
 * @see RULE-LCHK-4 — projects define their own checklist items.
 */
export interface ChecklistItem {
  /** Display name for this checklist item (e.g., "Tests", "Lint"). */
  readonly name: string;
  /** Async function that runs the validation and returns a result. */
  readonly validate: () => Promise<ChecklistItemResult>;
}

/**
 * Aggregate result of running the full landing checklist.
 *
 * @see RULE-LCHK-2 — `passed` is true only if every item passed.
 * @see RULE-LCHK-3 — if `passed` is false, a go-around is required.
 */
export interface ChecklistResult {
  /** True only if ALL items passed. */
  readonly passed: boolean;
  /** Results for every item, in execution order. */
  readonly items: readonly ChecklistItemResult[];
  /** Subset of `items` where `passed` is false. Empty when checklist passes. */
  readonly failedItems: readonly ChecklistItemResult[];
}
