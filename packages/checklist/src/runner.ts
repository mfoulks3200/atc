import { ChecklistError } from "@atc/errors";
import type { ChecklistItem, ChecklistItemResult, ChecklistResult } from "./types.js";

/**
 * Creates a checklist item from a name and an async validation function.
 *
 * @param name - Display name for the checklist item.
 * @param validate - Async function that performs the validation.
 * @returns A frozen {@link ChecklistItem}.
 * @see RULE-LCHK-4
 */
export function createChecklistItem(
  name: string,
  validate: () => Promise<ChecklistItemResult>,
): ChecklistItem {
  return Object.freeze({ name, validate });
}

/**
 * Runs every item in the checklist and aggregates the results.
 *
 * All items are executed sequentially regardless of individual pass/fail —
 * the full picture is always reported.
 *
 * @param items - The checklist items to run. Must not be empty.
 * @returns Aggregate result with per-item detail.
 * @throws {ChecklistError} If `items` is empty.
 * @see RULE-LCHK-1 — executed by the pilot holding controls.
 * @see RULE-LCHK-2 — `passed` is true only if ALL items passed.
 * @see RULE-LCHK-3 — a false result means a go-around is required.
 */
export async function runChecklist(items: readonly ChecklistItem[]): Promise<ChecklistResult> {
  if (items.length === 0) {
    throw new ChecklistError("Checklist must contain at least one item", "RULE-LCHK-2");
  }

  const results: ChecklistItemResult[] = [];

  for (const item of items) {
    const result = await item.validate();
    results.push(result);
  }

  const failedItems = results.filter((r) => !r.passed);

  return Object.freeze({
    passed: failedItems.length === 0,
    items: Object.freeze(results),
    failedItems: Object.freeze(failedItems),
  });
}
