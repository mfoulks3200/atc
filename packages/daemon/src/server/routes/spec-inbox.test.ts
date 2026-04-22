/**
 * Tests for the spec-inbox file watcher (RULE-SDD-17).
 *
 * Verifies that .spec.yaml/.spec.json files dropped into a project's specInbox
 * directory are processed, deduped, and moved to .processed/ or .failed/.
 *
 * @see RULE-SDD-17 — dedup by inode+mtime or content hash
 * @see §4.6.5 — File Watcher
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpecInboxWatcher } from "./spec-inbox.js";

vi.mock("./crafts-from-spec.js", () => ({
  processSpec: vi.fn().mockResolvedValue({ callsign: "test-craft-01", status: "Taxiing" }),
}));

vi.mock("../../git/worktree.js", () => ({
  createWorktree: vi.fn().mockResolvedValue(undefined),
  removeWorktree: vi.fn().mockResolvedValue(undefined),
}));

const VALID_YAML = [
  "title: Test Feature",
  "cargo: Add a test feature.",
  "category: backend",
  "vectors:",
  "  - name: Design",
  "    criteria:",
  "      - RFC approved",
].join("\n");

const VALID_JSON = JSON.stringify({
  title: "Test Feature",
  cargo: "Add a test feature.",
  category: "backend",
  vectors: [{ name: "Design", criteria: ["RFC approved"] }],
});

describe("SpecInboxWatcher", () => {
  let inboxDir: string;
  let watcher: SpecInboxWatcher;
  let processSpec: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    inboxDir = await mkdtemp(join(tmpdir(), "atc-inbox-"));
    processSpec = vi.fn().mockResolvedValue({ callsign: "test-craft-01", status: "Taxiing" });
    watcher = new SpecInboxWatcher(inboxDir, processSpec);
  });

  afterEach(async () => {
    watcher.stop();
    await rm(inboxDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("processes a .spec.yaml file dropped into the inbox", async () => {
    await writeFile(join(inboxDir, "my-feature.spec.yaml"), VALID_YAML);
    await watcher.processExisting();

    expect(processSpec).toHaveBeenCalledOnce();
    // processSpec(projectName, spec, source) — spec is at index 1
    const [, parsed] = processSpec.mock.calls[0] as [unknown, { title: string }];
    expect(parsed.title).toBe("Test Feature");
  });

  it("processes a .spec.json file dropped into the inbox", async () => {
    await writeFile(join(inboxDir, "my-feature.spec.json"), VALID_JSON);
    await watcher.processExisting();

    expect(processSpec).toHaveBeenCalledOnce();
  });

  it("moves successfully processed file to .processed/ subdirectory", async () => {
    const file = join(inboxDir, "my-feature.spec.yaml");
    await writeFile(file, VALID_YAML);
    await watcher.processExisting();

    const processedDir = join(inboxDir, ".processed");
    const processedFile = join(processedDir, "my-feature.spec.yaml");
    await expect(stat(processedFile)).resolves.toBeTruthy();
  });

  it("removes the original file from inbox after successful processing", async () => {
    const file = join(inboxDir, "my-feature.spec.yaml");
    await writeFile(file, VALID_YAML);
    await watcher.processExisting();

    await expect(stat(file)).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Failure handling
  // -------------------------------------------------------------------------

  it("moves failed file to .failed/ subdirectory with .error JSON sidecar", async () => {
    processSpec.mockRejectedValueOnce(
      Object.assign(new Error("No pilots"), { code: "NO_CERTIFIED_PILOT" }),
    );
    await writeFile(join(inboxDir, "bad.spec.yaml"), VALID_YAML);
    await watcher.processExisting();

    const failedFile = join(inboxDir, ".failed", "bad.spec.yaml");
    const sidecar = join(inboxDir, ".failed", "bad.spec.yaml.error");
    await expect(stat(failedFile)).resolves.toBeTruthy();
    const errorJson = JSON.parse(await readFile(sidecar, "utf8")) as {
      code: string;
      message: string;
      timestamp: string;
      sourceFile: string;
    };
    expect(errorJson.code).toBe("NO_CERTIFIED_PILOT");
    expect(errorJson.sourceFile).toBe("bad.spec.yaml");
    expect(typeof errorJson.timestamp).toBe("string");
  });

  it("writes SPEC_PARSE_ERROR sidecar for unparseable YAML", async () => {
    // `{unclosed` is definitively invalid YAML (unclosed flow-mapping)
    await writeFile(join(inboxDir, "bad.spec.yaml"), "{unclosed: yaml, missing: end");
    await watcher.processExisting();

    const sidecar = join(inboxDir, ".failed", "bad.spec.yaml.error");
    const errorJson = JSON.parse(await readFile(sidecar, "utf8")) as { code: string };
    expect(errorJson.code).toBe("SPEC_PARSE_ERROR");
  });

  // -------------------------------------------------------------------------
  // Deduplication (RULE-SDD-17)
  // -------------------------------------------------------------------------

  it("does not process the same file twice (dedup by inode+mtime, RULE-SDD-17)", async () => {
    await writeFile(join(inboxDir, "my-feature.spec.yaml"), VALID_YAML);
    await watcher.processExisting();
    await watcher.processExisting();

    expect(processSpec).toHaveBeenCalledOnce();
  });

  it("ignores files not ending in .spec.yaml or .spec.json", async () => {
    await writeFile(join(inboxDir, "README.md"), "# readme");
    await writeFile(join(inboxDir, "foo.yaml"), VALID_YAML);
    await watcher.processExisting();

    expect(processSpec).not.toHaveBeenCalled();
  });

  it("ignores subdirectory entries (.processed, .failed)", async () => {
    await mkdir(join(inboxDir, ".processed"), { recursive: true });
    await writeFile(join(inboxDir, ".processed", "old.spec.yaml"), VALID_YAML);
    await watcher.processExisting();

    expect(processSpec).not.toHaveBeenCalled();
  });
});
