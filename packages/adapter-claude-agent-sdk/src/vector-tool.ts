/**
 * In-process MCP tool for filing vector (milestone) reports.
 *
 * Once the agent has completed the acceptance criteria for the current vector,
 * it calls `vector_report` to record the milestone as passed and advance the
 * flight plan. Vectors must be reported in order — the daemon enforces RULE-VEC-2
 * by rejecting reports for any vector other than the next Pending one.
 *
 * Using a dedicated tool (rather than raw curl) means vector reports are
 * structured, attributable, and testable without shell-escaping complexity.
 *
 * @see RULE-VEC-2 — vectors must be passed in sequential order.
 * @see RULE-VEC-3 — reports must include evidence.
 * @see RULE-VEC-4 — only crew members may file reports.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * Context a pilot needs to file vector completion reports.
 */
export interface VectorToolContext {
  /** Absolute URL of the ATC daemon. */
  daemonUrl: string;
  /** Project the craft belongs to. */
  projectName: string;
  /** Aviation callsign of the craft. */
  callsign: string;
  /** Pilot ID of the reporting agent; passed as `pilotId` in the request body. */
  pilotId: string;
}

/**
 * Build an in-process MCP server exposing the `vector_report` tool.
 *
 * The returned config can be registered alongside other MCP servers in the
 * adapter's `launch()` options. When the agent calls `vector_report`, we POST
 * to the daemon's vector report endpoint using the pilot's identity.
 *
 * @param ctx - Routing context for this pilot's vector reports.
 * @returns An MCP server config ready to register with the SDK.
 *
 * @see RULE-VEC-2
 */
export function createVectorMcpServer(ctx: VectorToolContext): McpSdkServerConfigWithInstance {
  const baseUrl = `${ctx.daemonUrl}/api/v1/projects/${ctx.projectName}/crafts/${ctx.callsign}`;

  return createSdkMcpServer({
    name: "atc-vectors",
    version: "1.0.0",
    tools: [
      tool(
        "vector_report",
        [
          "Report the current vector (milestone) as passed with evidence.",
          "",
          "Call this ONLY when you have fully satisfied the acceptance criteria",
          "for the current vector. Provide concrete evidence — test output,",
          "lint results, or a description of what you built and verified.",
          "",
          "Constraints:",
          "- Only the NEXT Pending vector in sequence can be reported.",
          "  (RULE-VEC-2: vectors must be passed in order.)",
          "- The evidence string must be non-empty. (RULE-VEC-3)",
          "- Do not report a vector unless criteria are genuinely met —",
          "  the report is immutable once recorded.",
          "",
          "After a successful report, check the flight plan to find the next",
          "Pending vector and begin work on it.",
        ].join("\n"),
        {
          vectorName: z
            .string()
            .describe("Exact name of the vector to report as passed (case-sensitive)."),
          evidence: z
            .string()
            .describe(
              "Concrete evidence that the acceptance criteria are met (e.g. test output, lint results).",
            ),
        },
        async (args) => {
          const url = `${baseUrl}/vectors/${encodeURIComponent(args.vectorName)}/report`;
          try {
            const response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pilotId: ctx.pilotId, evidence: args.evidence }),
            });
            if (!response.ok) {
              const body = await response.text().catch(() => "");
              return {
                content: [
                  {
                    type: "text",
                    text: `Vector report failed (HTTP ${response.status})${body ? `: ${body}` : ""}`,
                  },
                ],
                isError: true,
              };
            }
            const flightPlan = (await response.json()) as unknown[];
            const next = (flightPlan as Array<{ name: string; status: string }>).find(
              (v) => v.status === "Pending",
            );
            const summary = next
              ? `Vector "${args.vectorName}" passed. Next vector: "${next.name}".`
              : `Vector "${args.vectorName}" passed. All vectors complete — run the landing checklist.`;
            return {
              content: [{ type: "text", text: summary }],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text", text: `Vector report threw: ${msg}` }],
              isError: true,
            };
          }
        },
      ),
    ],
  });
}
