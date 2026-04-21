/**
 * Vector command executor for the ATC daemon.
 *
 * Runs the optional `command.run` shell string attached to a SpecVector,
 * enforcing the controlled environment (RULE-VCMD-4), timeout bounds
 * (RULE-VCMD-6), and output caps (RULE-VCMD-7).
 *
 * @see RULE-VCMD-3 Command executed via `sh -c` in craft's worktree.
 * @see RULE-VCMD-4 Environment restricted to allowlisted variables only.
 * @see RULE-VCMD-6 Timeout: default 30 000 ms, maximum 300 000 ms.
 * @see RULE-VCMD-7 stdout capped at 64 KB, stderr at 16 KB.
 */

import { exec } from "node:child_process";
import type { VectorCommandResult } from "../types.js";

/** Default command timeout in milliseconds (30 seconds). @see RULE-VCMD-6 */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Maximum allowed timeout in milliseconds (5 minutes). @see RULE-VCMD-6 */
const MAX_TIMEOUT_MS = 300_000;

/** Maximum stdout retained in the VectorCommandResult (64 KB). @see RULE-VCMD-7 */
const STDOUT_CAP_BYTES = 64 * 1024;

/** Maximum stderr retained in the VectorCommandResult (16 KB). @see RULE-VCMD-7 */
const STDERR_CAP_BYTES = 16 * 1024;

/**
 * Context injected into the command environment.
 * @see RULE-VCMD-4
 */
export interface VectorCommandContext {
  /** The craft callsign (ATC_CRAFT_ID and ATC_CALLSIGN env vars). */
  callsign: string;
  /** The vector name (ATC_VECTOR_NAME env var). */
  vectorName: string;
  /**
   * Optional GIT_DIR override (path to the bare repo for the project).
   * When provided, GIT_DIR is set in the command environment.
   */
  gitDir?: string;
}

/**
 * Builds the restricted environment for vector command execution.
 *
 * Only the allowlisted variables are passed through:
 * - `PATH` — from the current process environment
 * - `GIT_DIR` — set to `context.gitDir` when provided
 * - `ATC_CRAFT_ID` — set to `context.callsign`
 * - `ATC_CALLSIGN` — set to `context.callsign`
 * - `ATC_VECTOR_NAME` — set to `context.vectorName`
 *
 * @see RULE-VCMD-4
 */
export function buildCommandEnv(context: VectorCommandContext): Record<string, string> {
  const env: Record<string, string> = {
    ATC_CRAFT_ID: context.callsign,
    ATC_CALLSIGN: context.callsign,
    ATC_VECTOR_NAME: context.vectorName,
  };

  if (process.env.PATH) {
    env["PATH"] = process.env.PATH;
  }

  if (context.gitDir) {
    env["GIT_DIR"] = context.gitDir;
  }

  return env;
}

/** Truncate a string to at most `maxBytes` UTF-8 bytes. */
function truncate(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= maxBytes) return s;
  return buf.subarray(0, maxBytes).toString("utf8");
}

/**
 * Executes a vector command in the craft's worktree directory.
 *
 * The command is invoked via `sh -c "<run>"` with a restricted environment
 * (PATH, GIT_DIR, ATC_CRAFT_ID, ATC_CALLSIGN, ATC_VECTOR_NAME only).
 * Timeout is clamped to [1, MAX_TIMEOUT_MS]. stdout and stderr are
 * truncated to their respective caps before returning.
 *
 * @param run - The shell command string to execute.
 * @param worktreePath - Working directory (craft's worktree).
 * @param context - ATC context injected into the environment.
 * @param timeoutMs - Timeout override in milliseconds. Defaults to 30 000;
 *   values exceeding 300 000 are clamped down.
 * @returns A resolved `VectorCommandResult` regardless of exit code.
 *
 * @see RULE-VCMD-3, RULE-VCMD-4, RULE-VCMD-6, RULE-VCMD-7
 */
export function runVectorCommand(
  run: string,
  worktreePath: string,
  context: VectorCommandContext,
  timeoutMs?: number,
): Promise<VectorCommandResult> {
  const clampedTimeout = Math.min(
    Math.max(timeoutMs ?? DEFAULT_TIMEOUT_MS, 1),
    MAX_TIMEOUT_MS,
  );

  const env = buildCommandEnv(context);

  return new Promise((resolve) => {
    const ranAt = new Date().toISOString();
    const start = Date.now();

    const child = exec(
      run,
      { cwd: worktreePath, timeout: clampedTimeout, env },
      (err, rawStdout, rawStderr) => {
        const durationMs = Date.now() - start;
        const stdout = truncate(rawStdout ?? "", STDOUT_CAP_BYTES);
        const stderr = truncate(rawStderr ?? "", STDERR_CAP_BYTES);

        if (err) {
          const timedOut = err.killed === true || err.signal === "SIGTERM";
          resolve({
            status: timedOut ? "timed_out" : "failed",
            exitCode: err.code ?? undefined,
            stdout,
            stderr,
            ranAt,
            durationMs,
            timedOut,
          });
          return;
        }

        resolve({
          status: "passed",
          exitCode: 0,
          stdout,
          stderr,
          ranAt,
          durationMs,
          timedOut: false,
        });
      },
    );

    child.on("error", () => undefined);
  });
}
