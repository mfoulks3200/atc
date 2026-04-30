import { ChecklistError, InsufficientControlsError } from "@airtrafficcontrol/errors";
import { ChecklistItemSeverity, ControlMode, SeatType } from "@airtrafficcontrol/types";
import type {
  ChecklistItemDef,
  ChecklistItemResult,
  ChecklistRunResult,
  ControlState,
  LifecycleEvent,
} from "@airtrafficcontrol/types";
import { executeShell } from "./executor/shell.js";
import { executeMcpTool } from "./executor/mcp-tool.js";
import type { McpToolHandler } from "./executor/mcp-tool.js";

/**
 * Pre-supplied assessment result for an agent-assessed checklist item.
 * @see RULE-CHKL-9
 */
export interface AgentAssessment {
  /** Whether the agent assessed the item as passing. */
  readonly passed: boolean;
  /**
   * Concise justification of the agent's reasoning.
   * MUST be non-empty; an empty string is treated as a required failure.
   * @see RULE-CHKL-9
   */
  readonly message: string;
}

/**
 * Input for running a checklist.
 */
export interface RunChecklistInput {
  readonly checklistName: string;
  readonly event: LifecycleEvent;
  readonly craftCallsign: string;
  readonly attempt: number;
  readonly items: readonly ChecklistItemDef[];
  readonly mcpHandler?: McpToolHandler;
  /**
   * Identifier of the pilot requesting the checklist run.
   * When provided along with `controls`, authorization is enforced:
   * the pilot must hold controls on the craft.
   * @see RULE-LCHK-1
   */
  readonly pilotId?: string;
  /**
   * Current control state of the craft.
   * Required together with `pilotId` for authorization.
   * @see RULE-LCHK-1
   */
  readonly controls?: ControlState;
  /**
   * Seat type of the executing pilot.
   * When provided, Jumpseat pilots are blocked from agent-assessed items.
   * @see RULE-CHKL-9
   */
  readonly pilotSeatType?: SeatType;
  /**
   * Pre-supplied assessments for agent-assessed items (those with no executor).
   * Keyed by item name. Missing or empty-message entries are treated as required failures.
   * @see RULE-CHKL-9
   */
  readonly agentAssessments?: Readonly<Record<string, AgentAssessment>>;
}

/**
 * Runs a checklist: executes all items sequentially and aggregates results.
 *
 * Pass/fail is determined by required items only. Advisory failures
 * are included in results but do not affect the overall outcome.
 *
 * Agent-assessed items (no executor) require a pre-supplied assessment in
 * `agentAssessments`. Jumpseat pilots are rejected for agent-assessed items.
 *
 * @param input - Checklist execution parameters.
 * @returns Aggregate result with per-item detail.
 * @throws {ChecklistError} If items array is empty.
 * @throws {ChecklistError} If a Jumpseat pilot attempts to assess agent-assessed items (RULE-CHKL-9).
 * @see RULE-CHKL-4 — required failures block, advisory failures don't.
 * @see RULE-CHKL-7 — items execute sequentially in order.
 * @see RULE-CHKL-9 — agent-assessed items require non-empty justification.
 */
export async function runChecklist(input: RunChecklistInput): Promise<ChecklistRunResult> {
  const {
    checklistName,
    event,
    craftCallsign,
    attempt,
    items,
    mcpHandler,
    pilotId,
    controls,
    pilotSeatType,
    agentAssessments,
  } = input;

  // RULE-LCHK-1: When pilot context is provided, verify the pilot holds controls.
  if (pilotId !== undefined && controls !== undefined) {
    const holding =
      controls.mode === ControlMode.Exclusive
        ? controls.holder === pilotId
        : (controls.sharedAreas?.some((area) => area.pilotIdentifier === pilotId) ?? false);

    if (!holding) {
      throw new ChecklistError(
        `Pilot "${pilotId}" does not hold controls on craft "${craftCallsign}" [RULE-LCHK-1]`,
        "RULE-LCHK-1",
      );
    }
  }

  if (items.length === 0) {
    throw new ChecklistError("Checklist must contain at least one item", "RULE-CHKL-4");
  }

  // RULE-CHKL-9: Jumpseat pilots cannot assess agent-assessed items.
  const hasAgentAssessedItems = items.some((item) => item.executor === undefined);
  if (hasAgentAssessedItems && pilotSeatType === SeatType.Jumpseat) {
    throw new InsufficientControlsError(
      `Jumpseat pilot cannot provide assessment for agent-assessed checklist items on craft "${craftCallsign}" [RULE-CHKL-9]`,
    );
  }

  const results: ChecklistItemResult[] = [];

  for (const item of items) {
    if (item.executor === undefined) {
      // Agent-assessed path: use pre-supplied assessment.
      const assessment = agentAssessments?.[item.name];
      const hasValidJustification =
        assessment !== undefined && assessment.message.trim().length > 0;

      if (!hasValidJustification) {
        // Missing or empty justification is a required failure per RULE-CHKL-9.
        results.push({
          name: item.name,
          title: item.title,
          passed: false,
          severity: ChecklistItemSeverity.Required,
          message:
            assessment !== undefined && assessment.message.trim().length === 0
              ? "Agent-assessed item requires non-empty justification [RULE-CHKL-9]"
              : "No assessment provided for agent-assessed item [RULE-CHKL-9]",
          output: undefined,
          durationMs: 0,
          agentAssessed: true,
        });
        continue;
      }

      results.push({
        name: item.name,
        title: item.title,
        passed: assessment.passed,
        severity: item.severity,
        message: assessment.message,
        output: undefined,
        durationMs: 0,
        agentAssessed: true,
      });
      continue;
    }

    // Executor-based path.
    let execResult: { passed: boolean; output: string; durationMs: number };

    if (item.executor.type === "shell") {
      execResult = await executeShell(item.executor.command);
    } else {
      if (!mcpHandler) {
        execResult = { passed: false, output: "No MCP handler provided", durationMs: 0 };
      } else {
        execResult = await executeMcpTool(item.executor.tool, item.executor.params, mcpHandler);
      }
    }

    results.push({
      name: item.name,
      title: item.title,
      passed: execResult.passed,
      severity: item.severity,
      message: execResult.passed ? undefined : (item.failureMessage ?? item.description),
      output: execResult.output,
      durationMs: execResult.durationMs,
      agentAssessed: false,
    });
  }

  const hasRequiredFailure = results.some(
    (r) => !r.passed && r.severity === ChecklistItemSeverity.Required,
  );

  return {
    checklistName,
    event,
    craftCallsign,
    attempt,
    timestamp: new Date().toISOString(),
    passed: !hasRequiredFailure,
    items: results,
  };
}
