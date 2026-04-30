import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChecklistItemConfig } from "../types.js";
import { runChecklist } from "./runner.js";

/** Helper: create a real temp directory for each test. */
async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "atc-checklist-test-"));
}

describe("runChecklist", () => {
  it("returns passed: true and all results when all commands succeed", async () => {
    const cwd = await makeTmpDir();
    const items: ChecklistItemConfig[] = [
      { name: "echo hello", command: "echo hello" },
      { name: "echo world", command: "echo world" },
    ];

    const result = await runChecklist(items, cwd);

    expect(result.passed).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].passed).toBe(true);
    expect(result.items[0].name).toBe("echo hello");
    expect(result.items[0].stdout.trim()).toBe("hello");
    expect(result.items[1].passed).toBe(true);
    expect(result.items[1].stdout.trim()).toBe("world");
    expect(result.items[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("runs all items even when one fails and returns passed: false (RULE-CHKL-4)", async () => {
    const cwd = await makeTmpDir();
    const items: ChecklistItemConfig[] = [
      { name: "fail step", command: "exit 1" },
      { name: "still runs", command: "echo ok" },
    ];

    const result = await runChecklist(items, cwd);

    expect(result.passed).toBe(false);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].passed).toBe(false);
    expect(result.items[0].name).toBe("fail step");
    expect(result.items[0].error).toBeDefined();
    expect(result.items[1].passed).toBe(true);
    expect(result.items[1].name).toBe("still runs");
  });

  it("captures stderr on failure", async () => {
    const cwd = await makeTmpDir();
    const items: ChecklistItemConfig[] = [
      { name: "stderr step", command: "echo 'something went wrong' >&2 && exit 1" },
    ];

    const result = await runChecklist(items, cwd);

    expect(result.passed).toBe(false);
    expect(result.items[0].stderr.trim()).toBe("something went wrong");
  });

  it("times out a long-running command and sets error containing 'timed out'", async () => {
    const cwd = await makeTmpDir();
    const items: ChecklistItemConfig[] = [
      { name: "slow step", command: "sleep 60", timeout: 1000 },
    ];

    const result = await runChecklist(items, cwd);

    expect(result.passed).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].passed).toBe(false);
    expect(result.items[0].error).toMatch(/timed out/i);
  }, 10_000);

  it("returns passed: true with empty items array when no items provided", async () => {
    const cwd = await makeTmpDir();

    const result = await runChecklist([], cwd);

    expect(result.passed).toBe(true);
    expect(result.items).toHaveLength(0);
  });

  it("does not leak ambient environment variables to child processes", async () => {
    const cwd = await makeTmpDir();
    const secretKey = `ATC_SECRET_TEST_${Date.now()}`;
    process.env[secretKey] = "leaked-secret";

    try {
      const items: ChecklistItemConfig[] = [
        { name: "check env", command: `echo "\${${secretKey}:-EMPTY}"` },
      ];

      const result = await runChecklist(items, cwd);

      expect(result.passed).toBe(true);
      expect(result.items[0].stdout.trim()).toBe("EMPTY");
    } finally {
      delete process.env[secretKey];
    }
  });

  it("forwards allowlisted env vars (PATH) to child processes", async () => {
    const cwd = await makeTmpDir();
    const items: ChecklistItemConfig[] = [
      { name: "check path", command: 'echo "${PATH:-MISSING}"' },
    ];

    const result = await runChecklist(items, cwd);

    expect(result.passed).toBe(true);
    expect(result.items[0].stdout.trim()).not.toBe("MISSING");
  });
});
