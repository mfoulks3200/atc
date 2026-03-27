/**
 * PID file management for @atc/daemon.
 *
 * Utilities for writing, reading, and removing a PID file on the filesystem,
 * plus a liveness check for an arbitrary process ID.
 */

import { readFile, rm, writeFile } from "node:fs/promises";

/**
 * Writes the current process PID to the given file path.
 *
 * @param pidPath - Absolute path where the PID file should be written.
 */
export async function writePidFile(pidPath: string): Promise<void> {
  await writeFile(pidPath, String(process.pid), "utf-8");
}

/**
 * Reads and parses the PID stored in the given file.
 * Returns `null` if the file does not exist.
 *
 * @param pidPath - Absolute path to the PID file.
 * @returns The parsed integer PID, or `null` when the file is absent.
 */
export async function readPidFile(pidPath: string): Promise<number | null> {
  try {
    const contents = await readFile(pidPath, "utf-8");
    return parseInt(contents.trim(), 10);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Removes the PID file at the given path.
 * Does not throw if the file is already gone.
 *
 * @param pidPath - Absolute path to the PID file.
 */
export async function removePidFile(pidPath: string): Promise<void> {
  await rm(pidPath, { force: true });
}

/**
 * Checks whether a process with the given PID is currently alive.
 *
 * Sends signal `0` to the process — a no-op that still performs the kernel
 * permission check. If no error is thrown, the process exists.
 *
 * @param pid - The process ID to check.
 * @returns `true` if the process is alive, `false` otherwise.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
