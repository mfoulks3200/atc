import { describe, it, expect, vi } from "vitest";
import { executeMcpTool } from "./mcp-tool.js";
import type { McpToolHandler } from "./mcp-tool.js";

describe("executeMcpTool", () => {
  it("returns passed: true when handler returns passed: true", async () => {
    const handler: McpToolHandler = vi.fn().mockResolvedValue({
      passed: true,
      output: "all good",
    });

    const result = await executeMcpTool("check-docs", { threshold: 80 }, handler);

    expect(result.passed).toBe(true);
    expect(result.output).toBe("all good");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(handler).toHaveBeenCalledWith("check-docs", { threshold: 80 });
  });

  it("returns passed: false when handler returns passed: false", async () => {
    const handler: McpToolHandler = vi.fn().mockResolvedValue({
      passed: false,
      output: "coverage at 62%",
    });

    const result = await executeMcpTool("check-docs", { threshold: 80 }, handler);

    expect(result.passed).toBe(false);
    expect(result.output).toBe("coverage at 62%");
  });

  it("returns passed: false when handler throws", async () => {
    const handler: McpToolHandler = vi.fn().mockRejectedValue(new Error("tool not found"));

    const result = await executeMcpTool("nonexistent", {}, handler);

    expect(result.passed).toBe(false);
    expect(result.output).toContain("tool not found");
  });

  it("caps output at 500 lines", async () => {
    const longOutput = Array.from({ length: 600 }, (_, i) => `line${i + 1}`).join("\n");
    const handler: McpToolHandler = vi.fn().mockResolvedValue({
      passed: true,
      output: longOutput,
    });

    const result = await executeMcpTool("check", {}, handler);

    const lines = result.output!.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeLessThanOrEqual(500);
  });
});
