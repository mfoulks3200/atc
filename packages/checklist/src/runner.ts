import { ChecklistError } from "@airtrafficcontrol/errors";
import { ChecklistItemSeverity, ControlMode } from "@airtrafficcontrol/types";
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
}

/**
 * Runs a checklist: executes all items sequentially and aggregates results.
 *
 * Pass/fail is determined by required items only. Advisory failures
 * are included in results but do not affect the overall outcome.
 *
 * @param input - Checklist execution parameters.
 * @returns Aggregate result with per-item detail.
 * @throws {ChecklistError} If items array is empty.
 * @see RULE-CHKL-4 — required failures block, advisory failures don't.
 * @see RULE-CHKL-7 — items execute sequentially in order.
 */
export async function runChecklist(input: RunChecklistInput): Promise<ChecklistRunResult> {
  const { checklistName, event, craftCallsign, attempt, items, mcpHandler, pilotId, controls } =
    input;

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

  const results: ChecklistItemResult[] = [];

  for (const item of items) {
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
      passed: execResult.passed,
      severity: item.severity,
      message: execResult.passed ? undefined : item.description,
      output: execResult.output,
      durationMs: execResult.durationMs,
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
