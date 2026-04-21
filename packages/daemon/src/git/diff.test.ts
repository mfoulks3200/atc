/**
 * Tests for git diff utilities.
 *
 * Exercises real bare repositories in mkdtemp directories — no mocks.
 * Each test seeds a scratch repo, creates feature branches, then runs the
 * production diff helpers against it.
 *
 * @see RULE-CRAFT-1
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listChangedFiles, getFileAtRef, isFileBinary } from "./diff.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Scratch {
  tmpDir: string;
  bareDir: string;
  sourceRepo: string;
}

async function makeScratch(): Promise<Scratch> {
  const tmpDir = await mkdtemp(join(tmpdir(), "atc-diff-test-"));
  const sourceRepo = join(tmpDir, "source");
  const bareDir = join(tmpDir, "repo.git");

  execFileSync("git", ["init", "-b", "main", sourceRepo]);
  execFileSync("git", ["config", "user.name", "test"], { cwd: sourceRepo });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: sourceRepo });

  await writeFile(join(sourceRepo, "README.md"), "# scratch\n");
  await writeFile(join(sourceRepo, "existing.ts"), "export const x = 1;\n");
  execFileSync("git", ["add", "."], { cwd: sourceRepo });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: sourceRepo });

  execFileSync("git", ["clone", "--bare", sourceRepo, bareDir]);

  return { tmpDir, bareDir, sourceRepo };
}

async function addFeatureBranch(
  bareDir: string,
  branchName: string,
  files: Record<string, string>,
  deletePaths?: string[],
): Promise<void> {
  const safe = branchName.replace(/[^a-zA-Z0-9]/g, "-");
  const wt = await mkdtemp(join(tmpdir(), `atc-diff-feat-${safe}-`));
  const wtRepo = join(wt, "wt");
  try {
    execFileSync("git", [
      "--git-dir",
      bareDir,
      "worktree",
      "add",
      "-b",
      branchName,
      wtRepo,
      "main",
    ]);
    execFileSync("git", ["config", "user.name", "test"], { cwd: wtRepo });
    execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: wtRepo });
    for (const [path, content] of Object.entries(files)) {
      await writeFile(join(wtRepo, path), content);
    }
    if (deletePaths) {
      for (const p of deletePaths) {
        execFileSync("git", ["rm", p], { cwd: wtRepo });
      }
    }
    execFileSync("git", ["add", "."], { cwd: wtRepo });
    execFileSync("git", ["commit", "--allow-empty", "-m", `feat: ${branchName}`], { cwd: wtRepo });
  } finally {
    try {
      execFileSync("git", ["--git-dir", bareDir, "worktree", "remove", "--force", wtRepo]);
    } catch {
      // ignore
    }
    await rm(wt, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// listChangedFiles
// ---------------------------------------------------------------------------

describe("listChangedFiles", () => {
  let scratch: Scratch;

  beforeEach(async () => {
    scratch = await makeScratch();
  });

  afterEach(async () => {
    await rm(scratch.tmpDir, { recursive: true, force: true });
  });

  it("returns added, modified, and deleted files", async () => {
    await addFeatureBranch(
      scratch.bareDir,
      "feat/mixed",
      { "new-file.ts": "new\n", "existing.ts": "export const x = 2;\n" },
      ["README.md"],
    );

    const files = await listChangedFiles(scratch.bareDir, "main", "feat/mixed");

    const byPath = Object.fromEntries(files.map((f) => [f.path, f.status]));
    expect(byPath["new-file.ts"]).toBe("added");
    expect(byPath["existing.ts"]).toBe("modified");
    expect(byPath["README.md"]).toBe("deleted");
  });

  it("returns an empty array when there are no changes", async () => {
    await addFeatureBranch(scratch.bareDir, "feat/noop", {});
    const files = await listChangedFiles(scratch.bareDir, "main", "feat/noop");
    expect(files).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getFileAtRef
// ---------------------------------------------------------------------------

describe("getFileAtRef", () => {
  let scratch: Scratch;

  beforeEach(async () => {
    scratch = await makeScratch();
  });

  afterEach(async () => {
    await rm(scratch.tmpDir, { recursive: true, force: true });
  });

  it("returns file content at a given ref", async () => {
    const content = await getFileAtRef(scratch.bareDir, "main", "README.md");
    expect(content).toBe("# scratch\n");
  });

  it("returns null for a file that does not exist at the ref", async () => {
    const content = await getFileAtRef(scratch.bareDir, "main", "nonexistent.txt");
    expect(content).toBeNull();
  });

  it("returns modified content on a feature branch", async () => {
    await addFeatureBranch(scratch.bareDir, "feat/edit", {
      "existing.ts": "export const x = 42;\n",
    });
    const content = await getFileAtRef(scratch.bareDir, "feat/edit", "existing.ts");
    expect(content).toBe("export const x = 42;\n");
  });
});

// ---------------------------------------------------------------------------
// isFileBinary
// ---------------------------------------------------------------------------

describe("isFileBinary", () => {
  let scratch: Scratch;

  beforeEach(async () => {
    scratch = await makeScratch();
  });

  afterEach(async () => {
    await rm(scratch.tmpDir, { recursive: true, force: true });
  });

  it("returns false for a text file", async () => {
    const result = await isFileBinary(scratch.bareDir, "main", "README.md");
    expect(result).toBe(false);
  });

  it("returns false for a non-existent file", async () => {
    const result = await isFileBinary(scratch.bareDir, "main", "nonexistent");
    expect(result).toBe(false);
  });
});
