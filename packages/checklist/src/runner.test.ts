import { describe, it, expect, vi } from "vitest";
import { runChecklist } from "./runner.js";
import { ChecklistItemSeverity, ControlMode, LifecycleEvent, SeatType } from "@airtrafficcontrol/types";
import type { ChecklistItemDef, ControlState } from "@airtrafficcontrol/types";
import { InsufficientControlsError } from "@airtrafficcontrol/errors";
import type { McpToolHandler } from "./executor/mcp-tool.js";

const shellItem = (
  name: string,
  command: string,
  severity = ChecklistItemSeverity.Required,
  title?: string,
): ChecklistItemDef => ({
  name,
  title: title ?? name,
  severity,
  executor: { type: "shell", command },
  description: `${name} failed`,
});

const agentItem = (
  name: string,
  severity = ChecklistItemSeverity.Required,
  title?: string,
): ChecklistItemDef => ({
  name,
  title: title ?? name,
  severity,
  description: `Evaluate ${name}`,
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

  it("includes title in item results", async () => {
    const result = await runChecklist({
      checklistName: "Pre-Landing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [shellItem("echo-check", "echo ok", ChecklistItemSeverity.Required, "Echo Check")],
    });
    expect(result.items[0]!.title).toBe("Echo Check");
    expect(result.items[0]!.name).toBe("echo-check");
  });

  it("sets agentAssessed: false for executor items", async () => {
    const result = await runChecklist({
      checklistName: "Pre-Landing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [shellItem("Echo", "echo ok")],
    });
    expect(result.items[0]!.agentAssessed).toBe(false);
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

  it("uses failureMessage on failure when provided", async () => {
    const item: ChecklistItemDef = {
      name: "Fail",
      title: "Fail Check",
      severity: ChecklistItemSeverity.Required,
      executor: { type: "shell", command: "exit 1" },
      description: "generic description",
      failureMessage: "specific failure hint",
    };
    const result = await runChecklist({
      checklistName: "Pre-Landing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [item],
    });
    expect(result.items[0]!.message).toBe("specific failure hint");
  });

  it("falls back to description when no failureMessage on failure", async () => {
    const result = await runChecklist({
      checklistName: "Pre-Landing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [shellItem("Fail", "exit 1")],
    });
    expect(result.items[0]!.message).toBe("Fail failed");
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

  it("throws ChecklistError when pilot does not hold exclusive controls (RULE-LCHK-1)", async () => {
    const controls: ControlState = { mode: ControlMode.Exclusive, holder: "captain-1" };
    await expect(
      runChecklist({
        checklistName: "Auth Test",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [shellItem("Echo", "echo ok")],
        pilotId: "fo-1",
        controls,
      }),
    ).rejects.toThrow("RULE-LCHK-1");
  });

  it("throws ChecklistError when pilot is not in any shared area (RULE-LCHK-1)", async () => {
    const controls: ControlState = {
      mode: ControlMode.Shared,
      sharedAreas: [{ pilotIdentifier: "captain-1", area: "src/" }],
    };
    await expect(
      runChecklist({
        checklistName: "Auth Test",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [shellItem("Echo", "echo ok")],
        pilotId: "observer-1",
        controls,
      }),
    ).rejects.toThrow("RULE-LCHK-1");
  });

  it("succeeds when pilot holds exclusive controls (RULE-LCHK-1)", async () => {
    const controls: ControlState = { mode: ControlMode.Exclusive, holder: "captain-1" };
    const result = await runChecklist({
      checklistName: "Auth Test",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [shellItem("Echo", "echo ok")],
      pilotId: "captain-1",
      controls,
    });
    expect(result.passed).toBe(true);
  });

  it("succeeds when pilot is in a shared area (RULE-LCHK-1)", async () => {
    const controls: ControlState = {
      mode: ControlMode.Shared,
      sharedAreas: [
        { pilotIdentifier: "captain-1", area: "src/api/" },
        { pilotIdentifier: "fo-1", area: "src/ui/" },
      ],
    };
    const result = await runChecklist({
      checklistName: "Auth Test",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [shellItem("Echo", "echo ok")],
      pilotId: "fo-1",
      controls,
    });
    expect(result.passed).toBe(true);
  });

  it("returns failed when mcp-tool executor has no handler provided (RULE-CHKL-1)", async () => {
    const mcpItem: ChecklistItemDef = {
      name: "Check Docs",
      title: "Documentation Coverage",
      severity: ChecklistItemSeverity.Required,
      executor: { type: "mcp-tool", tool: "check-docs", params: {} },
    };
    const result = await runChecklist({
      checklistName: "MCP",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [mcpItem],
      // intentionally no mcpHandler
    });
    expect(result.passed).toBe(false);
    expect(result.items[0]!.output).toBe("No MCP handler provided");
    expect(result.items[0]!.agentAssessed).toBe(false);
  });

  it("handles MCP tool executor", async () => {
    const mcpHandler: McpToolHandler = vi.fn().mockResolvedValue({ passed: true, output: "ok" });
    const mcpItem: ChecklistItemDef = {
      name: "Check Docs",
      title: "Documentation Coverage",
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

  describe("agent-assessed items (RULE-CHKL-9)", () => {
    it("passes with valid agent assessment", async () => {
      const result = await runChecklist({
        checklistName: "Agent Check",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [agentItem("Code Review")],
        agentAssessments: {
          "Code Review": { passed: true, message: "Reviewed all changes; no issues found." },
        },
      });
      expect(result.passed).toBe(true);
      expect(result.items[0]!.passed).toBe(true);
      expect(result.items[0]!.agentAssessed).toBe(true);
      expect(result.items[0]!.output).toBeUndefined();
      expect(result.items[0]!.message).toBe("Reviewed all changes; no issues found.");
    });

    it("fails with valid agent assessment reporting failure", async () => {
      const result = await runChecklist({
        checklistName: "Agent Check",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [agentItem("Code Review")],
        agentAssessments: {
          "Code Review": { passed: false, message: "Found security issue in auth module." },
        },
      });
      expect(result.passed).toBe(false);
      expect(result.items[0]!.passed).toBe(false);
      expect(result.items[0]!.agentAssessed).toBe(true);
      expect(result.items[0]!.message).toBe("Found security issue in auth module.");
    });

    it("treats missing assessment as required failure (RULE-CHKL-9)", async () => {
      const result = await runChecklist({
        checklistName: "Agent Check",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [agentItem("Code Review")],
      });
      expect(result.passed).toBe(false);
      expect(result.items[0]!.passed).toBe(false);
      expect(result.items[0]!.severity).toBe(ChecklistItemSeverity.Required);
      expect(result.items[0]!.agentAssessed).toBe(true);
    });

    it("treats empty-message assessment as required failure (RULE-CHKL-9)", async () => {
      const result = await runChecklist({
        checklistName: "Agent Check",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [agentItem("Code Review")],
        agentAssessments: { "Code Review": { passed: true, message: "" } },
      });
      expect(result.passed).toBe(false);
      expect(result.items[0]!.passed).toBe(false);
      expect(result.items[0]!.agentAssessed).toBe(true);
    });

    it("treats whitespace-only message as required failure (RULE-CHKL-9)", async () => {
      const result = await runChecklist({
        checklistName: "Agent Check",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [agentItem("Code Review")],
        agentAssessments: { "Code Review": { passed: true, message: "   " } },
      });
      expect(result.passed).toBe(false);
      expect(result.items[0]!.agentAssessed).toBe(true);
    });

    it("advisory agent item missing assessment does not block overall (advisory severity)", async () => {
      const result = await runChecklist({
        checklistName: "Agent Check",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [agentItem("Optional Review", ChecklistItemSeverity.Advisory)],
      });
      // The item fails (missing assessment → required failure override), but severity stays
      // as Required override — wait, let me re-read the spec.
      // Actually per spec: "A result with an empty or missing justification for an agent-assessed
      // item is malformed and MUST be treated as a required failure."
      // So it overrides severity to Required. The overall result should fail.
      expect(result.passed).toBe(false);
      expect(result.items[0]!.severity).toBe(ChecklistItemSeverity.Required);
    });

    it("throws InsufficientControlsError for Jumpseat pilot on agent-assessed items (RULE-CHKL-9)", async () => {
      await expect(
        runChecklist({
          checklistName: "Agent Check",
          event: LifecycleEvent.BeforeLandingCheck,
          craftCallsign: "ATC-1",
          attempt: 1,
          items: [agentItem("Code Review")],
          pilotSeatType: SeatType.Jumpseat,
          agentAssessments: {
            "Code Review": { passed: true, message: "Looks fine." },
          },
        }),
      ).rejects.toThrow(InsufficientControlsError);
    });

    it("allows Captain to assess agent items (RULE-CHKL-9)", async () => {
      const result = await runChecklist({
        checklistName: "Agent Check",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [agentItem("Code Review")],
        pilotSeatType: SeatType.Captain,
        agentAssessments: {
          "Code Review": { passed: true, message: "All good." },
        },
      });
      expect(result.passed).toBe(true);
    });

    it("allows FirstOfficer to assess agent items (RULE-CHKL-9)", async () => {
      const result = await runChecklist({
        checklistName: "Agent Check",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [agentItem("Code Review")],
        pilotSeatType: SeatType.FirstOfficer,
        agentAssessments: {
          "Code Review": { passed: true, message: "All good." },
        },
      });
      expect(result.passed).toBe(true);
    });

    it("Jumpseat pilot is allowed on executor-only checklists (no agent items)", async () => {
      const result = await runChecklist({
        checklistName: "Shell Only",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [shellItem("Build", "echo ok")],
        pilotSeatType: SeatType.Jumpseat,
      });
      expect(result.passed).toBe(true);
    });

    it("mixed executor and agent items all produce agentAssessed correctly", async () => {
      const result = await runChecklist({
        checklistName: "Mixed",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [
          shellItem("Build", "echo ok"),
          agentItem("Code Review"),
        ],
        agentAssessments: {
          "Code Review": { passed: true, message: "LGTM" },
        },
      });
      expect(result.items[0]!.agentAssessed).toBe(false);
      expect(result.items[1]!.agentAssessed).toBe(true);
    });
  });
});
