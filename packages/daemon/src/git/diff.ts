/**
 * Git diff utilities for the ATC daemon.
 *
 * Provides operations to compare a craft branch against the project's main
 * branch: listing changed files and retrieving file content for both sides
 * of the diff. All operations work directly against a bare repo with
 * `git --git-dir`; no working tree is required.
 *
 * @see RULE-CRAFT-1
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

/** Status of a file in the diff. */
export type DiffFileStatus = "added" | "modified" | "deleted";

/** A single changed file in a diff. */
export interface DiffFileEntry {
  path: string;
  status: DiffFileStatus;
}

/**
 * Lists files changed between two branches in a bare repository.
 *
 * Uses `git diff --name-status` to obtain the list. Status codes are mapped
 * to the simplified `DiffFileStatus` type: A → added, D → deleted,
 * everything else → modified.
 *
 * @param bareDir - Absolute path to the bare git repository.
 * @param baseBranch - The base branch (e.g. `"main"`).
 * @param craftBranch - The craft branch to compare.
 * @returns Array of changed files with path and status.
 */
export async function listChangedFiles(
  bareDir: string,
  baseBranch: string,
  craftBranch: string,
): Promise<DiffFileEntry[]> {
  const { stdout } = await execFile("git", [
    "--git-dir",
    bareDir,
    "diff",
    "--name-status",
    `${baseBranch}...${craftBranch}`,
  ]);

  if (!stdout.trim()) return [];

  return stdout
    .trim()
    .split("\n")
    .map((line) => {
      const [code, ...rest] = line.split("\t");
      const path = rest.join("\t");
      let status: DiffFileStatus;
      if (code === "A") status = "added";
      else if (code === "D") status = "deleted";
      else status = "modified";
      return { path, status };
    });
}

/**
 * Retrieves the content of a file at a given branch ref in a bare repository.
 *
 * Uses `git show <ref>:<path>`. Returns `null` when the file does not exist
 * at the given ref (e.g. added files have no original, deleted files have no
 * modified content).
 *
 * @param bareDir - Absolute path to the bare git repository.
 * @param ref - The branch or commit ref.
 * @param filePath - The file path relative to the repo root.
 * @returns The file content as a UTF-8 string, or `null` if the file does not exist at the ref.
 */
export async function getFileAtRef(
  bareDir: string,
  ref: string,
  filePath: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFile("git", ["--git-dir", bareDir, "show", `${ref}:${filePath}`]);
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Checks whether a file is binary at a given ref by inspecting the first
 * 8KB for null bytes.
 *
 * @param bareDir - Absolute path to the bare git repository.
 * @param ref - The branch or commit ref.
 * @param filePath - The file path relative to the repo root.
 * @returns `true` if the file appears to be binary.
 */
export async function isFileBinary(
  bareDir: string,
  ref: string,
  filePath: string,
): Promise<boolean> {
  try {
    const { stdout } = await execFile("git", ["--git-dir", bareDir, "show", `${ref}:${filePath}`], {
      encoding: "buffer" as unknown as BufferEncoding,
      maxBuffer: 8192,
    });
    const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout as unknown as string);
    return buf.includes(0);
  } catch {
    return false;
  }
}
