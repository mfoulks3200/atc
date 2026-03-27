/**
 * Checklist runner for @atc/daemon.
 *
 * Executes a sequence of shell commands representing the landing checklist.
 * Each item is run sequentially; the first failure stops execution per
 * RULE-LCHK-3 (any failure triggers a go-around).
 *
 * @see RULE-LCHK-1 Checklist executed by pilot holding controls.
 * @see RULE-LCHK-2 All items must pass for landing clearance request.
 * @see RULE-LCHK-3 Any failure triggers a go-around.
 * @see RULE-LCHK-4 Checklist is project-configurable.
 */

import { exec } from "node:child_process";
import type { ChecklistItemConfig } from "../types.js";

/** Default command timeout in milliseconds (120 seconds). */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * The result of running a single checklist item.
 */
export interface ChecklistItemResult {
  /** Display name of the checklist item. */
  name: string;
  /** Whether the command exited with code 0. */
  passed: boolean;
  /** Captured standard output from the command. */
  stdout: string;
  /** Captured standard error from the command. */
  stderr: string;
  /** Error message if the command failed or timed out; absent on success. */
  error?: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

/**
 * The aggregated result of running all checklist items up to and including
 * the first failure (or all items if none fail).
 *
 * @see RULE-LCHK-2
 * @see RULE-LCHK-3
 */
export interface ChecklistResult {
  /** `true` only when every item passed. */
  passed: boolean;
  /** Results for each item that was executed. */
  items: ChecklistItemResult[];
}

/**
 * Runs a single checklist item's shell command and captures the result.
 *
 * @param item - The checklist item configuration.
 * @param cwd - Working directory in which to execute the command.
 * @returns A resolved `ChecklistItemResult` regardless of exit code.
 */
function runItem(item: ChecklistItemConfig, cwd: string): Promise<ChecklistItemResult> {
  return new Promise((resolve) => {
    const timeoutMs = item.timeout ?? DEFAULT_TIMEOUT_MS;
    const start = Date.now();

    const child = exec(item.command, { cwd, timeout: timeoutMs }, (err, stdout, stderr) => {
      const durationMs = Date.now() - start;

      if (err) {
        // `err.killed` is set when the process was killed due to timeout.
        const timedOut = err.killed === true || err.signal === "SIGTERM";
        resolve({
          name: item.name,
          passed: false,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          error: timedOut ? `timed out after ${timeoutMs}ms` : (err.message ?? "non-zero exit"),
          durationMs,
        });
        return;
      }

      resolve({
        name: item.name,
        passed: true,
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        durationMs,
      });
    });

    // Suppress unhandled-error events; the callback above handles everything.
    child.on("error", () => undefined);
  });
}

/**
 * Runs each checklist item sequentially in the given working directory.
 *
 * Stops on the first failure and includes that failing item in the results
 * (per RULE-LCHK-3). Items after the first failure are not executed.
 *
 * @param items - Ordered list of checklist items to execute.
 * @param cwd - Working directory passed to each shell command.
 * @returns A `ChecklistResult` with `passed: true` only if all items passed.
 *
 * @see RULE-LCHK-3
 */
export async function runChecklist(
  items: ChecklistItemConfig[],
  cwd: string,
): Promise<ChecklistResult> {
  const results: ChecklistItemResult[] = [];

  for (const item of items) {
    const result = await runItem(item, cwd);
    results.push(result);

    if (!result.passed) {
      return { passed: false, items: results };
    }
  }

  return { passed: true, items: results };
}
