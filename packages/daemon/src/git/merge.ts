/**
 * Git merge utilities for the ATC daemon's tower merge protocol.
 *
 * Provides the operations that the tower needs to execute steps 4–6 of the
 * merge sequence (RULE-TMRG-2, RULE-TMRG-3): determine the project's main
 * branch, verify a craft branch is up to date with main, and execute a
 * merge of the craft branch into main inside the bare repository.
 *
 * All operations work directly against a bare repo with `git --git-dir`;
 * no working tree is required. Merges use a temporary worktree checked out
 * to main so we can run `git merge --no-ff` without disturbing any
 * craft worktree owned by an agent.
 *
 * @see RULE-TOWER-3
 * @see RULE-TMRG-2
 * @see RULE-TMRG-3
 */

import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

/**
 * The outcome of a {@link mergeBranchIntoMain} attempt.
 *
 * @see RULE-TMRG-2
 * @see RULE-TMRG-3
 */
export type GitMergeOutcome =
  | { kind: "merged"; mainBranch: string; mergeCommit: string }
  | { kind: "stale"; mainBranch: string; reason: string }
  | { kind: "conflict"; mainBranch: string; reason: string };

/**
 * Resolves the default branch name for a bare repository.
 *
 * Reads `HEAD` of the bare repo (`git symbolic-ref --short HEAD`) and
 * returns the short branch name. Throws if HEAD is detached or unreadable.
 *
 * @param bareDir - Absolute path to the bare git repository.
 * @returns The default branch name (e.g. `"main"`).
 *
 * @see RULE-TOWER-3
 */
export async function getDefaultBranch(bareDir: string): Promise<string> {
  const { stdout } = await execFile("git", [
    "--git-dir",
    bareDir,
    "symbolic-ref",
    "--short",
    "HEAD",
  ]);
  return stdout.trim();
}

/**
 * Returns true if `branch` contains every commit on `mainBranch`.
 *
 * Uses `git merge-base --is-ancestor <main> <branch>`, which exits 0 when
 * `<main>` is an ancestor of `<branch>` and 1 otherwise. Any other exit
 * status is treated as an error.
 *
 * @param bareDir - Absolute path to the bare git repository.
 * @param mainBranch - Name of the project's main branch.
 * @param branch - Name of the craft branch.
 * @returns `true` if `branch` is up to date with `mainBranch`.
 *
 * @see RULE-TOWER-3
 * @see RULE-TMRG-2
 */
export async function isBranchUpToDate(
  bareDir: string,
  mainBranch: string,
  branch: string,
): Promise<boolean> {
  try {
    await execFile("git", [
      "--git-dir",
      bareDir,
      "merge-base",
      "--is-ancestor",
      mainBranch,
      branch,
    ]);
    return true;
  } catch (err) {
    const status = (err as { code?: number }).code;
    if (status === 1) {
      return false;
    }
    throw err;
  }
}

/**
 * Executes the merge of a craft branch into the project's main branch.
 *
 * Materializes a temporary worktree of `mainBranch`, attempts a
 * `git merge --no-ff` of `branch` into it, and returns a structured
 * outcome. On conflict the merge is aborted and the worktree is cleaned up.
 * On success the merge commit hash is returned. The temporary worktree is
 * always removed before this function returns.
 *
 * Up-to-date verification is performed first: if `mainBranch` is not an
 * ancestor of `branch`, the function returns `{kind: "stale"}` without
 * touching the worktree.
 *
 * @param bareDir - Absolute path to the bare git repository.
 * @param mainBranch - Name of the project's main branch.
 * @param branch - Name of the craft branch to merge into main.
 * @param message - Commit message for the merge commit.
 * @returns A {@link GitMergeOutcome} describing the result.
 *
 * @see RULE-TMRG-2
 * @see RULE-TMRG-3
 */
export async function mergeBranchIntoMain(
  bareDir: string,
  mainBranch: string,
  branch: string,
  message: string,
): Promise<GitMergeOutcome> {
  if (!(await isBranchUpToDate(bareDir, mainBranch, branch))) {
    return {
      kind: "stale",
      mainBranch,
      reason: `Branch "${branch}" is not up to date with "${mainBranch}"`,
    };
  }

  const tmpRoot = await mkdtemp(join(tmpdir(), "atc-merge-"));
  const worktreePath = join(tmpRoot, "main-wt");

  try {
    await execFile("git", ["--git-dir", bareDir, "worktree", "add", worktreePath, mainBranch]);

    // Merge the craft branch into the checked-out main worktree.
    try {
      await execFile("git", ["merge", "--no-ff", "-m", message, branch], { cwd: worktreePath });
    } catch (err) {
      // Conflict or other merge failure — abort and report.
      try {
        await execFile("git", ["merge", "--abort"], { cwd: worktreePath });
      } catch {
        // ignore; we'll still tear down the worktree below
      }
      const stderr = (err as { stderr?: string }).stderr ?? "";
      return {
        kind: "conflict",
        mainBranch,
        reason: stderr.trim() || `Merge of "${branch}" into "${mainBranch}" failed`,
      };
    }

    const { stdout: sha } = await execFile("git", ["rev-parse", "HEAD"], { cwd: worktreePath });
    return { kind: "merged", mainBranch, mergeCommit: sha.trim() };
  } finally {
    try {
      await execFile("git", ["--git-dir", bareDir, "worktree", "remove", "--force", worktreePath]);
    } catch {
      // best-effort cleanup
    }
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
