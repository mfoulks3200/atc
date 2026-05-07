/**
 * Unit tests for the TowerMergeExecutor adapter.
 *
 * Verifies that the adapter correctly delegates to merge.ts helpers and
 * maps the `{kind: "merged"}` git outcome to the `{kind: "landed"}` tower
 * outcome required by the MergeExecutor interface.
 *
 * @see RULE-TMRG-2
 * @see RULE-TMRG-3
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import type { GitMergeOutcome } from "./merge.js";

// Hoist mocks before importing the module under test.
vi.mock("./merge.js", () => ({
  getDefaultBranch: vi.fn(async () => "main"),
  isBranchUpToDate: vi.fn(async () => true),
  mergeBranchIntoMain: vi.fn(
    async (): Promise<GitMergeOutcome> => ({
      kind: "merged",
      mainBranch: "main",
      mergeCommit: "deadbeef",
    }),
  ),
}));

import { createTowerMergeExecutor } from "./tower-merge-executor.js";
import { getDefaultBranch, isBranchUpToDate, mergeBranchIntoMain } from "./merge.js";

describe("createTowerMergeExecutor", () => {
  const BARE_DIR = "/fake/repo.git";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // getMainBranch
  // -------------------------------------------------------------------------

  describe("getMainBranch", () => {
    it("delegates to getDefaultBranch with the bare dir", async () => {
      const executor = createTowerMergeExecutor(BARE_DIR);
      const branch = await executor.getMainBranch();
      expect(branch).toBe("main");
      expect(getDefaultBranch).toHaveBeenCalledWith(BARE_DIR);
    });
  });

  // -------------------------------------------------------------------------
  // isBranchUpToDate
  // -------------------------------------------------------------------------

  describe("isBranchUpToDate", () => {
    it("delegates to gitIsBranchUpToDate with the bare dir and both branch names", async () => {
      const executor = createTowerMergeExecutor(BARE_DIR);
      const result = await executor.isBranchUpToDate("main", "feat/widget");
      expect(result).toBe(true);
      expect(isBranchUpToDate).toHaveBeenCalledWith(BARE_DIR, "main", "feat/widget");
    });

    it("returns false when the underlying helper reports the branch is behind", async () => {
      vi.mocked(isBranchUpToDate).mockResolvedValueOnce(false);
      const executor = createTowerMergeExecutor(BARE_DIR);
      const result = await executor.isBranchUpToDate("main", "feat/stale");
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // merge — outcome mapping
  // -------------------------------------------------------------------------

  describe("merge", () => {
    it("maps 'merged' git outcome to 'landed' tower outcome (RULE-TMRG-2)", async () => {
      const executor = createTowerMergeExecutor(BARE_DIR);
      const outcome = await executor.merge("main", "feat/widget", "Tower merge: feat/widget");
      expect(outcome.kind).toBe("landed");
      if (outcome.kind === "landed") {
        expect(outcome.mergeCommit).toBe("deadbeef");
        expect(outcome.mainBranch).toBe("main");
      }
    });

    it("passes the bareDir, branches, and message to mergeBranchIntoMain", async () => {
      const executor = createTowerMergeExecutor(BARE_DIR);
      await executor.merge("main", "feat/widget", "Tower merge: feat/widget");
      expect(mergeBranchIntoMain).toHaveBeenCalledWith(
        BARE_DIR,
        "main",
        "feat/widget",
        "Tower merge: feat/widget",
      );
    });

    it("passes 'stale' git outcome through unchanged (RULE-TMRG-2)", async () => {
      vi.mocked(mergeBranchIntoMain).mockResolvedValueOnce({
        kind: "stale",
        mainBranch: "main",
        reason: "Branch is behind main",
      });
      const executor = createTowerMergeExecutor(BARE_DIR);
      const outcome = await executor.merge("main", "feat/stale", "Tower merge: feat/stale");
      expect(outcome.kind).toBe("stale");
      if (outcome.kind === "stale") {
        expect(outcome.reason).toBe("Branch is behind main");
        expect(outcome.mainBranch).toBe("main");
      }
    });

    it("passes 'conflict' git outcome through unchanged (RULE-TMRG-3)", async () => {
      vi.mocked(mergeBranchIntoMain).mockResolvedValueOnce({
        kind: "conflict",
        mainBranch: "main",
        reason: "CONFLICT in src/foo.ts",
      });
      const executor = createTowerMergeExecutor(BARE_DIR);
      const outcome = await executor.merge("main", "feat/conflict", "Tower merge: feat/conflict");
      expect(outcome.kind).toBe("conflict");
      if (outcome.kind === "conflict") {
        expect(outcome.reason).toBe("CONFLICT in src/foo.ts");
        expect(outcome.mainBranch).toBe("main");
      }
    });
  });
});
