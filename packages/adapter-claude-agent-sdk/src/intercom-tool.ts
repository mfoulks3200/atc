/**
 * In-process MCP tool exposing the ATC intercom as an explicit action the
 * pilot agent must invoke — instead of implicitly forwarding every assistant
 * message to the shared channel.
 *
 * Separating the intercom from the agent's regular output means:
 *  - Internal reasoning, tool-use narration, and file-edit explanations stay
 *    private to the agent (and the black box).
 *  - Crew communication is deliberate — the agent has to decide to transmit.
 *  - Recipients see only messages the sender meant for them.
 *
 * @see RULE-CRAFT-5 for intercom usage constraints.
 * @see RULE-ICOM-1 through RULE-ICOM-4 for intercom etiquette rules.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * Context a pilot agent needs in order to send intercom messages that are
 * correctly attributed and routed.
 */
export interface IntercomToolContext {
  /** Absolute URL of the ATC daemon (e.g. `http://localhost:7700`). */
  daemonUrl: string;
  /** Project the craft belongs to. */
  projectName: string;
  /** Aviation callsign of the craft. */
  callsign: string;
  /** Pilot identifier this agent represents; used as the intercom `from` field. */
  pilotId: string;
  /** Seat type this pilot is acting as ("captain", "firstOfficer", or "jumpseat"). */
  seat: string;
}

/**
 * Build an in-process MCP server that exposes an `intercom_send` tool.
 *
 * The returned `McpSdkServerConfigWithInstance` can be passed to the SDK's
 * `options.mcpServers` at launch time. When the agent invokes the tool, we
 * POST to the daemon's intercom endpoint using the pilot's identity.
 *
 * @param ctx - Routing context for this pilot's intercom traffic.
 * @returns An MCP server config ready to register with the SDK.
 */
export function createIntercomMcpServer(
  ctx: IntercomToolContext,
): McpSdkServerConfigWithInstance {
  const intercomUrl = `${ctx.daemonUrl}/api/v1/projects/${ctx.projectName}/crafts/${ctx.callsign}/intercom`;

  return createSdkMcpServer({
    name: "atc-intercom",
    version: "1.0.0",
    tools: [
      tool(
        "intercom_send",
        [
          "Broadcast a message to the craft intercom — the shared radio channel",
          "with all other crew members on this craft.",
          "",
          "Use this tool ONLY for deliberate communication with the crew:",
          "- Control handoffs",
          "- Status updates (vector reports, checklist results, blockers)",
          "- Requests or acknowledgments",
          "- Emergency declarations",
          "",
          "Do NOT use this for:",
          "- Your internal reasoning or thinking-out-loud",
          "- Narrating what you are about to do",
          "- File edit descriptions or tool-use commentary",
          "",
          "Follow the 3W principle in every message (RULE-ICOM-2):",
          "  1. Who you are calling (recipient by pilot ID, or 'crew' for all).",
          "  2. Who you are (your pilot ID).",
          "  3. What you want (concise message or request).",
          "End with 'Over' so others know the channel is free (RULE-ICOM-4).",
        ].join("\n"),
        { content: z.string().describe("The intercom message text to broadcast.") },
        async (args) => {
          try {
            const response = await fetch(intercomUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                from: ctx.pilotId,
                seat: ctx.seat,
                content: args.content,
              }),
            });
            if (!response.ok) {
              const body = await response.text().catch(() => "");
              return {
                content: [
                  {
                    type: "text",
                    text: `Intercom POST failed with status ${response.status}${
                      body ? `: ${body}` : ""
                    }`,
                  },
                ],
                isError: true,
              };
            }
            return {
              content: [
                {
                  type: "text",
                  text: "Intercom message broadcast successfully.",
                },
              ],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [
                { type: "text", text: `Intercom POST threw: ${msg}` },
              ],
              isError: true,
            };
          }
        },
      ),
    ],
  });
}
