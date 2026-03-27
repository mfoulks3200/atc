/**
 * Tests for git worktree management utilities.
 *
 * Uses real filesystem I/O and real git operations in mkdtemp directories —
 * no mocks. Each test gets a fresh bare repository cloned from a source repo
 * with at least one commit (required for worktree operations).
 */

import { execSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorktree, removeWorktree } from "./worktree.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns stdout of a git command run in `cwd`, trimmed. */
function git(args: string[], cwd: string): string {
  return execSync(`git ${args.join(" ")}`, { cwd, encoding: "utf8" }).trim();
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let bareDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "atc-worktree-test-"));
  const sourceRepo = join(tmpDir, "source");
  bareDir = join(tmpDir, "bare.git");

  execSync(`git init ${sourceRepo}`);
  execSync(
    'git -c user.name="test" -c user.email="test@test.com" commit --allow-empty -m "initial"',
    { cwd: sourceRepo },
  );
  execSync(`git clone --bare ${sourceRepo} ${bareDir}`);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// createWorktree
// ---------------------------------------------------------------------------

describe("createWorktree", () => {
  it("creates a worktree directory at the specified path", async () => {
    const worktreePath = join(tmpDir, "wt-alpha");

    await createWorktree(bareDir, worktreePath, "feature/alpha");

    expect(existsSync(worktreePath)).toBe(true);
  });

  it("checks out the new branch in the created worktree", async () => {
    const worktreePath = join(tmpDir, "wt-bravo");

    await createWorktree(bareDir, worktreePath, "feature/bravo");

    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath);
    expect(branch).toBe("feature/bravo");
  });

  it("registers the worktree in the bare repo's worktree list", async () => {
    const worktreePath = join(tmpDir, "wt-charlie");

    await createWorktree(bareDir, worktreePath, "feature/charlie");

    const list = git(["worktree", "list", "--porcelain"], bareDir);
    expect(list).toContain(worktreePath);
  });
});

// ---------------------------------------------------------------------------
// removeWorktree
// ---------------------------------------------------------------------------

describe("removeWorktree", () => {
  it("removes the worktree directory from the filesystem", async () => {
    const worktreePath = join(tmpDir, "wt-delta");
    await createWorktree(bareDir, worktreePath, "feature/delta");

    await removeWorktree(bareDir, worktreePath);

    expect(existsSync(worktreePath)).toBe(false);
  });

  it("deregisters the worktree from the bare repo", async () => {
    const worktreePath = join(tmpDir, "wt-echo");
    await createWorktree(bareDir, worktreePath, "feature/echo");

    await removeWorktree(bareDir, worktreePath);

    const list = git(["worktree", "list", "--porcelain"], bareDir);
    expect(list).not.toContain(worktreePath);
  });
});
