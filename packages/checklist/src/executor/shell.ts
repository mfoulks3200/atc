import { exec } from "node:child_process";

const MAX_OUTPUT_LINES = 500;

/**
 * Result of executing a shell command.
 */
export interface ShellExecResult {
  readonly passed: boolean;
  readonly output: string;
  readonly durationMs: number;
}

/**
 * Options for shell command execution.
 */
export interface ShellExecOptions {
  /** Working directory for the command. */
  readonly cwd?: string;
  /** Explicit environment variables. When set, replaces the inherited env. */
  readonly env?: Record<string, string>;
  /** Timeout in milliseconds. */
  readonly timeout?: number;
}

/**
 * Executes a shell command and returns pass/fail based on exit code.
 *
 * Exit code 0 = pass, anything else = fail.
 * Captures combined stdout+stderr, capped at 500 lines.
 *
 * @param command - Shell command string to execute.
 * @param options - Optional execution context (cwd, env, timeout).
 * @returns Execution result with pass/fail, output, and duration.
 * @see RULE-CHKL-1
 */
export function executeShell(
  command: string,
  options?: ShellExecOptions,
): Promise<ShellExecResult> {
  const start = performance.now();

  return new Promise((resolve) => {
    exec(
      command,
      {
        shell: "/bin/sh",
        cwd: options?.cwd,
        env: options?.env,
        timeout: options?.timeout,
      },
      (error, stdout, stderr) => {
        const durationMs = Math.round(performance.now() - start);
        const combined = (stdout + stderr).trim();
        const lines = combined.split("\n");
        const output = lines.slice(-MAX_OUTPUT_LINES).join("\n");

        resolve({
          passed: error === null,
          output,
          durationMs,
        });
      },
    );
  });
}
