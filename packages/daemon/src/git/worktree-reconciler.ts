/**
 * Startup reconciliation for orphaned git worktrees.
 *
 * On daemon restart, worktrees may exist on disk without a matching active
 * craft in the store (e.g. the daemon crashed after worktree creation but
 * before the craft was persisted, or a craft was removed without cleaning up
 * its worktree). This module identifies and prunes those orphans so that the
 * bare repository's worktree list stays consistent with the craft store.
 *
 * Call {@link reconcileOrphanWorktrees} once during daemon startup — after all
 * stores are initialized and before the HTTP server begins accepting connections
 * — to ensure no orphaned worktrees accumulate across restarts.
 *
 * @see RULE-CRAFT-1 for craft-to-branch correspondence.
 */

import { execFile as execFileCb } from "node:child_process";
import { access, constants, readdir, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { TERMINAL_STATES } from "@airtrafficcontrol/types";
import { removeWorktree } from "./worktree.js";
import type { CraftStore } from "../state/craft-store.js";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal logger interface required by the reconciler.
 * Matches the inline logger shape used in {@link Daemon}.
 */
export interface ReconcilerLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
}

/**
 * A single entry produced by parsing `git worktree list --porcelain` output.
 *
 * @see {@link parseWorktreeList}
 */
export interface WorktreeEntry {
  /** Absolute path to the worktree directory. */
  path: string;
  /**
   * True when this entry represents the main (bare) worktree — the one that
   * should never be pruned.
   */
  isMain: boolean;
  /**
   * True when git has marked the worktree as locked, meaning `git worktree
   * remove` would fail without `--force` and the directory may be in use.
   */
  isLocked: boolean;
}

// ---------------------------------------------------------------------------
// parseWorktreeList
// ---------------------------------------------------------------------------

/**
 * Parses `git worktree list --porcelain` stdout into {@link WorktreeEntry}
 * records.
 *
 * Each entry block in porcelain format is separated by a blank line. Lines
 * within a block follow `<key> <value>` or bare `<key>` for boolean flags:
 *
 * ```
 * worktree /path/to/bare.git
 * HEAD abc123
 * bare
 *
 * worktree /path/to/projects/p/crafts/alpha/worktree
 * HEAD def456
 * branch refs/heads/alpha-branch
 *
 * worktree /path/to/projects/p/crafts/beta/worktree
 * HEAD 789abc
 * branch refs/heads/beta-branch
 * locked reason text
 * ```
 *
 * @param output - Raw stdout from `git worktree list --porcelain`.
 * @returns Parsed worktree entries in document order.
 *
 * @see RULE-CRAFT-1
 */
export function parseWorktreeList(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  const blocks = output.trim().split(/\n\n+/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    let path: string | undefined;
    let isMain = false;
    let isLocked = false;

    for (const line of block.trim().split("\n")) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length).trim();
      } else if (line === "bare") {
        isMain = true;
      } else if (line.startsWith("locked")) {
        isLocked = true;
      }
    }

    if (path !== undefined) {
      entries.push({ path, isMain, isLocked });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// listWorktrees (internal)
// ---------------------------------------------------------------------------

/**
 * Runs `git worktree list --porcelain` on `bareDir` and returns the parsed
 * entries. Returns an empty array if `bareDir` does not exist (no bare repo
 * yet) or if the git command fails for any reason.
 *
 * @param bareDir - Absolute path to the bare git repository.
 * @param logger - Used to emit a warning when git reports an unexpected error.
 */
async function listWorktrees(bareDir: string, logger: ReconcilerLogger): Promise<WorktreeEntry[]> {
  try {
    await access(bareDir, constants.F_OK);
  } catch {
    return [];
  }

  try {
    const { stdout } = await execFile("git", ["worktree", "list", "--porcelain"], {
      cwd: bareDir,
    });
    return parseWorktreeList(stdout);
  } catch (err) {
    logger.warn(`[worktree-reconciler] git worktree list failed for ${bareDir}: ${String(err)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// reconcileOrphanWorktrees
// ---------------------------------------------------------------------------

/**
 * Reconciles git worktrees for all projects against the craft store, pruning
 * any orphaned worktrees found on disk.
 *
 * **What counts as an orphan?**
 * A non-main, non-locked worktree whose path matches the pattern
 * `<profileDir>/projects/<project>/crafts/<callsign>/worktree` is an orphan
 * when:
 * - No craft with `callsign` exists in `craftStore` for that project, **or**
 * - The matching craft is in a terminal state (`Landed` or `ReturnToOrigin`).
 *
 * **Safety guarantees:**
 * - The main (bare) worktree is always preserved.
 * - Locked worktrees are always skipped — a warning is logged instead.
 * - Prune failures are caught and logged; the loop continues to remaining worktrees.
 * - Projects without a bare repo (`repo.git`) are silently skipped.
 * - If the `projects/` directory does not exist yet, the function returns immediately.
 *
 * **Side effect:** calls `craftStore.loadProject()` for each project so that
 * on-disk craft state is reflected in memory before routes begin serving traffic.
 *
 * @param profileDir - Absolute path to the daemon profile directory.
 * @param craftStore - Craft store; `loadProject` is called per project.
 * @param logger - Logger for info/warn/error messages.
 *
 * @see RULE-CRAFT-1
 */
export async function reconcileOrphanWorktrees(
  profileDir: string,
  craftStore: CraftStore,
  logger: ReconcilerLogger,
): Promise<void> {
  const projectsDir = join(profileDir, "projects");

  let projectNames: string[];
  try {
    projectNames = await readdir(projectsDir);
  } catch {
    return;
  }

  for (const projectName of projectNames) {
    const projectDir = join(projectsDir, projectName);
    const bareDir = join(projectDir, "repo.git");

    // Ensure craft store reflects on-disk state for this project.
    try {
      await craftStore.loadProject(projectName);
    } catch (err) {
      logger.warn(
        `[worktree-reconciler] Failed to load crafts for project ${projectName}: ${String(err)}`,
      );
    }

    const worktrees = await listWorktrees(bareDir, logger);

    for (const wt of worktrees) {
      // The bare/main worktree must never be pruned.
      if (wt.isMain) continue;

      // Locked worktrees cannot be removed safely — skip and warn.
      if (wt.isLocked) {
        logger.warn(`[worktree-reconciler] Skipping locked worktree: ${wt.path}`);
        continue;
      }

      // Derive callsign from path: <projectDir>/crafts/<callsign>/worktree
      // Resolve craftsDir via realpath so that symlinked temp prefixes (e.g.
      // /tmp → /private/tmp on macOS) don't break the relative-path comparison
      // against paths git reports in `git worktree list --porcelain`.
      const craftsDir = await realpath(join(projectDir, "crafts")).catch(
        () => join(projectDir, "crafts"),
      );
      const relPath = relative(craftsDir, wt.path);

      // Reject paths outside the crafts directory or with unexpected layouts.
      if (relPath.startsWith("..") || relPath === "") continue;
      const parts = relPath.split(sep);
      if (parts.length !== 2 || parts[1] !== "worktree") continue;

      const callsign = parts[0];
      const craft = craftStore.get(projectName, callsign);

      const isOrphan = craft === undefined || TERMINAL_STATES.has(craft.status);
      if (!isOrphan) continue;

      const reason =
        craft === undefined
          ? "no matching craft in store"
          : `craft is in terminal state ${craft.status}`;
      logger.info(
        `[worktree-reconciler] Pruning orphaned worktree for ${projectName}/${callsign} (${reason})`,
      );

      try {
        await removeWorktree(bareDir, wt.path);
      } catch (err) {
        logger.error(`[worktree-reconciler] Failed to prune worktree ${wt.path}`, err);
      }
    }
  }
}
