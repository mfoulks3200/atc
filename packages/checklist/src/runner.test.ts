import { describe, it, expect, vi } from "vitest";
import { runChecklist } from "./runner.js";
import { ChecklistItemSeverity, LifecycleEvent } from "@atc/types";
import type { ChecklistItemDef } from "@atc/types";
import type { McpToolHandler } from "./executor/mcp-tool.js";

const shellItem = (name: string, command: string, severity = ChecklistItemSeverity.Required): ChecklistItemDef => ({
  name,
  severity,
  executor: { type: "shell", command },
  description: `${name} failed`,
});

describe("runChecklist", () => {
  it("returns passed: true when all items pass", async () => {
    const result = await runChecklist({
      checklistName: "Pre-Landing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [shellItem("Echo", "echo ok")],
    });
    expect(result.passed).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.passed).toBe(true);
    expect(result.checklistName).toBe("Pre-Landing");
    expect(result.event).toBe(LifecycleEvent.BeforeLandingCheck);
    expect(result.craftCallsign).toBe("ATC-1");
    expect(result.attempt).toBe(1);
    expect(result.timestamp).toBeDefined();
  });

  it("returns passed: false when a required item fails (RULE-CHKL-4)", async () => {
    const result = await runChecklist({
      checklistName: "Pre-Landing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [shellItem("Pass", "echo ok"), shellItem("Fail", "exit 1")],
    });
    expect(result.passed).toBe(false);
    expect(result.items[0]!.passed).toBe(true);
    expect(result.items[1]!.passed).toBe(false);
    expect(result.items[1]!.message).toBe("Fail failed");
  });

  it("returns passed: true when only advisory items fail (RULE-CHKL-4)", async () => {
    const result = await runChecklist({
      checklistName: "Pre-Landing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [
        shellItem("Required", "echo ok", ChecklistItemSeverity.Required),
        shellItem("Advisory", "exit 1", ChecklistItemSeverity.Advisory),
      ],
    });
    expect(result.passed).toBe(true);
    expect(result.items[1]!.passed).toBe(false);
    expect(result.items[1]!.severity).toBe(ChecklistItemSeverity.Advisory);
  });

  it("runs items sequentially (RULE-CHKL-7)", async () => {
    const result = await runChecklist({
      checklistName: "Sequential",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [shellItem("A", "echo A"), shellItem("B", "echo B"), shellItem("C", "echo C")],
    });
    expect(result.items.map((i) => i.name)).toEqual(["A", "B", "C"]);
  });

  it("includes durationMs for each item", async () => {
    const result = await runChecklist({
      checklistName: "Timing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [shellItem("Echo", "echo ok")],
    });
    expect(result.items[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws ChecklistError when items array is empty", async () => {
    await expect(
      runChecklist({
        checklistName: "Empty",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [],
      }),
    ).rejects.toThrow("Checklist must contain at least one item");
  });

  it("handles MCP tool executor", async () => {
    const mcpHandler: McpToolHandler = vi.fn().mockResolvedValue({ passed: true, output: "ok" });
    const mcpItem: ChecklistItemDef = {
      name: "Check Docs",
      severity: ChecklistItemSeverity.Advisory,
      executor: { type: "mcp-tool", tool: "check-docs", params: { threshold: 80 } },
    };
    const result = await runChecklist({
      checklistName: "MCP",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [mcpItem],
      mcpHandler,
    });
    expect(result.passed).toBe(true);
    expect(mcpHandler).toHaveBeenCalledWith("check-docs", { threshold: 80 });
  });
});
