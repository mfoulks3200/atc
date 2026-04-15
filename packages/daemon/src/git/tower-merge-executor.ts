/**
 * Adapter that lets `@airtrafficcontrol/tower` execute real git merges
 * against a daemon-managed bare repository.
 *
 * Implements the `MergeExecutor` interface from the tower package on top
 * of the daemon's `git/merge.ts` helpers. The executor is bound to a
 * single project's bare repo and is constructed per merge request so the
 * tower package never sees a path from the daemon's filesystem layout.
 *
 * @see RULE-TOWER-3
 * @see RULE-TMRG-2
 * @see RULE-TMRG-3
 */

import type { MergeExecutor, MergeOutcome } from "@airtrafficcontrol/tower";
import {
  getDefaultBranch,
  isBranchUpToDate as gitIsBranchUpToDate,
  mergeBranchIntoMain,
} from "./merge.js";

/**
 * Build a {@link MergeExecutor} bound to a single project's bare repo.
 *
 * @param bareDir - Absolute path to the project's bare git repository.
 * @returns A {@link MergeExecutor} the tower can use to execute merges.
 *
 * @see RULE-TMRG-2
 * @see RULE-TMRG-3
 */
export function createTowerMergeExecutor(bareDir: string): MergeExecutor {
  return {
    getMainBranch: () => getDefaultBranch(bareDir),
    isBranchUpToDate: (mainBranch, branch) => gitIsBranchUpToDate(bareDir, mainBranch, branch),
    merge: async (mainBranch, branch, message): Promise<MergeOutcome> => {
      const result = await mergeBranchIntoMain(bareDir, mainBranch, branch, message);
      if (result.kind === "merged") {
        return { kind: "landed", mainBranch: result.mainBranch, mergeCommit: result.mergeCommit };
      }
      return result;
    },
  };
}
