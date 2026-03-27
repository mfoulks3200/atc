/**
 * Bare git repository management for the ATC daemon.
 *
 * Provides utilities to initialize, clone, and fetch bare git repositories
 * used as the backing store for worktree-based craft isolation.
 *
 * A bare repo contains only git object storage (no working tree), making it
 * the ideal hub from which multiple worktrees branch out — one per craft.
 *
 * @see RULE-CRAFT-1 for craft-to-branch correspondence.
 */

import { execFile as execFileCb } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// initBareRepo
// ---------------------------------------------------------------------------

/**
 * Initializes a new bare git repository at `bareDir`.
 *
 * Creates all parent directories as needed, then runs `git init --bare`.
 * Suitable for bootstrapping a local bare repo when no remote is available.
 *
 * @param bareDir - Absolute path where the bare repository will be created.
 * @returns Resolves when initialization is complete.
 *
 * @see RULE-CRAFT-1
 */
export async function initBareRepo(bareDir: string): Promise<void> {
  await mkdir(bareDir, { recursive: true });
  await execFile("git", ["init", "--bare", bareDir]);
}

// ---------------------------------------------------------------------------
// cloneBareRepo
// ---------------------------------------------------------------------------

/**
 * Clones a remote repository as a bare repository at `bareDir`.
 *
 * Runs `git clone --bare <remoteUrl> <bareDir>`. The resulting repository
 * contains all refs and objects but no working tree.
 *
 * @param remoteUrl - URL or local path of the source repository.
 * @param bareDir - Absolute path where the bare clone will be placed.
 * @returns Resolves when the clone is complete.
 *
 * @see RULE-CRAFT-1
 */
export async function cloneBareRepo(remoteUrl: string, bareDir: string): Promise<void> {
  await execFile("git", ["clone", "--bare", remoteUrl, bareDir]);
}

// ---------------------------------------------------------------------------
// fetchBareRepo
// ---------------------------------------------------------------------------

/**
 * Fetches all remotes in an existing bare repository.
 *
 * Runs `git fetch --all` with `bareDir` as the working directory. This keeps
 * the bare repo up to date with upstream changes so newly created worktrees
 * start from the latest refs.
 *
 * @param bareDir - Absolute path to an existing bare git repository.
 * @returns Resolves when the fetch is complete.
 *
 * @see RULE-CRAFT-1
 */
export async function fetchBareRepo(bareDir: string): Promise<void> {
  await execFile("git", ["fetch", "--all"], { cwd: bareDir });
}
