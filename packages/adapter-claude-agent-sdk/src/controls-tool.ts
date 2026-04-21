/**
 * In-process MCP tool for pilot-initiated controls transfers.
 *
 * When another crew member requests controls on the intercom (RULE-CTRL-3),
 * the current holder should actually *cede* them rather than simply
 * acknowledging. This tool lets an agent POST to
 * `/controls/claim` to hand exclusive controls over to a named pilot.
 *
 * The tool is bound to the caller's pilot id and craft, so a pilot cannot
 * spoof transfers on other crafts. The daemon route still validates that
 * the target is on the manifest and not a jumpseat (RULE-CTRL-2).
 *
 * @see RULE-CTRL-3 for the hold-before-modify rule.
 * @see RULE-CTRL-6 for captain final-authority.
 * @see RULE-CTRL-7 for the black-box transfer log.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * Context a pilot needs to transfer controls on its craft.
 */
export interface ControlsToolContext {
  /** Absolute URL of the ATC daemon. */
  daemonUrl: string;
  /** Project the craft belongs to. */
  projectName: string;
  /** Aviation callsign of the craft. */
  callsign: string;
  /** Pilot id this agent represents (the caller). */
  pilotId: string;
}

/**
 * Build an in-process MCP server exposing the `controls_transfer` tool.
 *
 * The returned config can be registered alongside other MCP servers in the
 * adapter's `launch()` options.
 */
export function createControlsMcpServer(ctx: ControlsToolContext): McpSdkServerConfigWithInstance {
  const claimUrl = `${ctx.daemonUrl}/api/v1/projects/${ctx.projectName}/crafts/${ctx.callsign}/controls/claim`;
  const readUrl = `${ctx.daemonUrl}/api/v1/projects/${ctx.projectName}/crafts/${ctx.callsign}/controls`;

  return createSdkMcpServer({
    name: "atc-controls",
    version: "1.0.0",
    tools: [
      tool(
        "controls_transfer",
        [
          "Transfer EXCLUSIVE controls of this craft to another pilot.",
          "",
          "Call this when a crewmate has requested controls on the intercom",
          "and you (the current holder) have decided to cede them — or when",
          "you, as captain, need to reclaim controls (RULE-CTRL-6).",
          "",
          "Constraints:",
          "- The target must be on the craft manifest.",
          "- The target must NOT be a jumpseat (RULE-CTRL-2).",
          "- Do not transfer without acknowledging on the intercom first —",
          "  the 3W principle applies to control handoffs too.",
          "",
          "After a successful transfer, broadcast a confirmation on the",
          "intercom so the recipient knows they may now modify files.",
        ].join("\n"),
        {
          targetPilotId: z
            .string()
            .describe("Pilot identifier that should hold exclusive controls after the transfer."),
        },
        async (args) => {
          try {
            const response = await fetch(claimUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pilotId: args.targetPilotId }),
            });
            if (!response.ok) {
              const body = await response.text().catch(() => "");
              return {
                content: [
                  {
                    type: "text",
                    text: `Controls transfer failed (HTTP ${response.status}): ${body}`,
                  },
                ],
                isError: true,
              };
            }
            return {
              content: [
                {
                  type: "text",
                  text: `Controls transferred to ${args.targetPilotId}. You no longer hold modification rights on this craft unless you reclaim them.`,
                },
              ],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text", text: `Transfer threw: ${msg}` }],
              isError: true,
            };
          }
        },
      ),
      tool(
        "controls_read",
        "Read the current controls state of this craft. Returns the mode (exclusive/shared), holder, and shared areas. Use this to check who holds controls before modifying files or requesting a transfer.",
        {},
        async () => {
          try {
            const response = await fetch(readUrl);
            if (!response.ok) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Failed to read controls: HTTP ${response.status}`,
                  },
                ],
                isError: true,
              };
            }
            const state = (await response.json()) as unknown;
            return {
              content: [{ type: "text", text: JSON.stringify(state, null, 2) }],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text", text: `Read threw: ${msg}` }],
              isError: true,
            };
          }
        },
      ),
    ],
  });
}
