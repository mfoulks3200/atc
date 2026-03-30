import { describe, it, expect } from "vitest";
import { executeShell } from "./shell.js";

describe("executeShell", () => {
  it("returns passed: true and captures stdout when command exits 0", async () => {
    const result = await executeShell("echo hello");
    expect(result.passed).toBe(true);
    expect(result.output).toContain("hello");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns passed: false when command exits non-zero", async () => {
    const result = await executeShell("exit 1");
    expect(result.passed).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("captures stderr in output", async () => {
    const result = await executeShell("echo error >&2 && exit 1");
    expect(result.passed).toBe(false);
    expect(result.output).toContain("error");
  });

  it("caps output at 500 lines", async () => {
    const result = await executeShell("for i in $(seq 1 600); do echo line$i; done");
    expect(result.passed).toBe(true);
    const lines = result.output!.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeLessThanOrEqual(500);
  });

  it("returns passed: false when command does not exist", async () => {
    const result = await executeShell("nonexistent_command_xyz_123");
    expect(result.passed).toBe(false);
    expect(result.output).toBeDefined();
  });
});
