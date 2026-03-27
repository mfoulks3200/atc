/**
 * Git worktree management for the ATC daemon.
 *
 * Provides utilities to create and remove git worktrees from a bare repository.
 * Each craft gets its own worktree — an isolated working directory checked out
 * to a dedicated branch — so concurrent agents never stomp on each other's files.
 *
 * @see RULE-CRAFT-1 for the craft-to-branch correspondence.
 * @see RULE-CTRL-1 for isolation requirements between concurrent crafts.
 */

import { execFile as execFileCb } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// createWorktree
// ---------------------------------------------------------------------------

/**
 * Creates a new git worktree for the given branch at `worktreePath`.
 *
 * Runs `git worktree add -b <branchName> <worktreePath>` from `bareDir`.
 * A new branch named `branchName` is created and checked out in the worktree.
 *
 * @param bareDir - Absolute path to the bare repository acting as the hub.
 * @param worktreePath - Absolute path where the new worktree will be created.
 * @param branchName - Name of the new branch to create and check out.
 * @returns Resolves when the worktree has been created.
 *
 * @see RULE-CRAFT-1
 * @see RULE-CTRL-1
 */
export async function createWorktree(
  bareDir: string,
  worktreePath: string,
  branchName: string,
): Promise<void> {
  await execFile("git", ["worktree", "add", "-b", branchName, worktreePath], { cwd: bareDir });
}

// ---------------------------------------------------------------------------
// removeWorktree
// ---------------------------------------------------------------------------

/**
 * Removes an existing git worktree from the bare repository.
 *
 * Runs `git worktree remove --force <worktreePath>` from `bareDir` to
 * deregister the worktree, then performs an `rm -rf` on the path as a safety
 * cleanup in case git left any residual files behind.
 *
 * @param bareDir - Absolute path to the bare repository.
 * @param worktreePath - Absolute path of the worktree to remove.
 * @returns Resolves when the worktree has been removed and cleaned up.
 *
 * @see RULE-CRAFT-1
 */
export async function removeWorktree(bareDir: string, worktreePath: string): Promise<void> {
  await execFile("git", ["worktree", "remove", "--force", worktreePath], { cwd: bareDir });
  await rm(worktreePath, { recursive: true, force: true });
}
