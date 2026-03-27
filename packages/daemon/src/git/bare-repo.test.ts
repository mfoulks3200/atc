/**
 * Tests for bare git repository management utilities.
 *
 * Uses real filesystem I/O and real git operations in mkdtemp directories —
 * no mocks. This ensures git subprocess calls and directory creation are
 * exercised end-to-end.
 */

import { execSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cloneBareRepo, fetchBareRepo, initBareRepo } from "./bare-repo.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns stdout of a git command run in `cwd`, trimmed. */
function git(args: string[], cwd: string): string {
  return execSync(`git ${args.join(" ")}`, { cwd, encoding: "utf8" }).trim();
}

// ---------------------------------------------------------------------------
// initBareRepo
// ---------------------------------------------------------------------------

describe("initBareRepo", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "atc-bare-repo-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates a bare git repository at the specified path", async () => {
    const bareDir = join(tmpDir, "repo.git");

    await initBareRepo(bareDir);

    const result = git(["rev-parse", "--is-bare-repository"], bareDir);
    expect(result).toBe("true");
  });

  it("creates parent directories as needed", async () => {
    const bareDir = join(tmpDir, "deep", "nested", "repo.git");

    await initBareRepo(bareDir);

    const result = git(["rev-parse", "--is-bare-repository"], bareDir);
    expect(result).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// cloneBareRepo
// ---------------------------------------------------------------------------

describe("cloneBareRepo", () => {
  let tmpDir: string;
  let sourceRepo: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "atc-clone-bare-test-"));
    sourceRepo = join(tmpDir, "source");

    execSync(`git init ${sourceRepo}`);
    execSync(
      'git -c user.name="test" -c user.email="test@test.com" commit --allow-empty -m "initial"',
      { cwd: sourceRepo },
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("clones a source repository as a bare repository", async () => {
    const bareDir = join(tmpDir, "clone.git");

    await cloneBareRepo(sourceRepo, bareDir);

    const result = git(["rev-parse", "--is-bare-repository"], bareDir);
    expect(result).toBe("true");
  });

  it("cloned bare repo contains the source commits", async () => {
    const bareDir = join(tmpDir, "clone.git");

    await cloneBareRepo(sourceRepo, bareDir);

    const log = git(["log", "--oneline"], bareDir);
    expect(log).toContain("initial");
  });
});

// ---------------------------------------------------------------------------
// fetchBareRepo
// ---------------------------------------------------------------------------

describe("fetchBareRepo", () => {
  let tmpDir: string;
  let sourceRepo: string;
  let bareDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "atc-fetch-bare-test-"));
    sourceRepo = join(tmpDir, "source");
    bareDir = join(tmpDir, "clone.git");

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

  it("fetches new commits from the remote into the bare repository", async () => {
    // Add a second commit to the source after cloning
    execSync(
      'git -c user.name="test" -c user.email="test@test.com" commit --allow-empty -m "second"',
      { cwd: sourceRepo },
    );

    await fetchBareRepo(bareDir);

    // For a bare repo cloned from a local path, fetched commits land in FETCH_HEAD.
    // Verify the new commit is accessible via FETCH_HEAD.
    const log = git(["log", "--oneline", "FETCH_HEAD"], bareDir);
    expect(log).toContain("second");
  });
});
