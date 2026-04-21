/**
 * In-process MCP tools for tower landing operations.
 *
 * Once all vectors are passed and the landing checklist is green, the
 * captain requests clearance from the tower and — in simple FCFS setups —
 * triggers the merge itself. These tools expose the daemon's tower routes
 * as explicit actions so the captain agent can close the landing loop
 * without human operator intervention.
 *
 * Only the captain should invoke these — RULE-TOWER-1 and the craft
 * lifecycle spec place landing authority with the pilot-in-command. The
 * tools themselves don't enforce seat (the daemon route accepts any
 * caller), but the system prompt tells first officers and jumpseats not
 * to call them.
 *
 * @see RULE-TOWER-1 — landing clearance authority.
 * @see RULE-TOWER-2 — all vectors must pass before clearance.
 * @see RULE-TOWER-3 — tower merges the craft into main.
 * @see RULE-TMRG-2, RULE-TMRG-3 — branch-up-to-date / merge execution.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";

/**
 * Context a pilot agent needs in order to drive tower landing operations
 * on its craft.
 */
export interface TowerToolContext {
  /** Absolute URL of the ATC daemon. */
  daemonUrl: string;
  /** Project name the craft belongs to. */
  projectName: string;
  /** Aviation callsign of the craft being landed. */
  callsign: string;
}

/**
 * Build an in-process MCP server exposing tower landing tools for the
 * bound craft.
 */
export function createTowerMcpServer(ctx: TowerToolContext): McpSdkServerConfigWithInstance {
  const clearanceUrl = `${ctx.daemonUrl}/api/v1/projects/${ctx.projectName}/tower/clearance`;
  const mergeUrl = `${ctx.daemonUrl}/api/v1/projects/${ctx.projectName}/tower/merge`;

  return createSdkMcpServer({
    name: "atc-tower",
    version: "1.0.0",
    tools: [
      tool(
        "tower_request_clearance",
        [
          "Request landing clearance from the tower for this craft.",
          "",
          "Precondition: ALL vectors in the flight plan must be Passed and",
          "the landing checklist must have run (status = ClearedToLand).",
          "Also make sure the branch is committed — the tower verifies branch",
          "contents before merging.",
          "",
          "On success, the craft is enqueued on the tower landing queue",
          "FCFS. Use `tower_execute_merge` next to perform the merge.",
          "",
          "Typically only the captain calls this (RULE-TOWER-1).",
        ].join("\n"),
        {},
        async () => {
          try {
            const response = await fetch(clearanceUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callsign: ctx.callsign }),
            });
            const body = await response.text();
            if (!response.ok) {
              return {
                content: [
                  { type: "text", text: `Clearance refused (HTTP ${response.status}): ${body}` },
                ],
                isError: true,
              };
            }
            return {
              content: [{ type: "text", text: `Clearance granted: ${body}` }],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text", text: `Clearance request threw: ${msg}` }],
              isError: true,
            };
          }
        },
      ),
      tool(
        "tower_execute_merge",
        [
          "Execute the tower merge for this craft — verifies the branch is",
          "up-to-date with main, merges into main, and transitions the craft",
          "to `Landed` on success. If the merge fails (conflict, stale",
          "branch), the craft transitions back to `GoAround` and a black",
          "box entry describes the failure mode.",
          "",
          "Precondition: the craft must have been granted clearance and be",
          "enqueued on the tower queue (use `tower_request_clearance` first).",
          "",
          "Typically only the captain calls this.",
        ].join("\n"),
        {},
        async () => {
          try {
            const response = await fetch(mergeUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callsign: ctx.callsign }),
            });
            const body = await response.text();
            if (!response.ok) {
              return {
                content: [
                  { type: "text", text: `Merge failed (HTTP ${response.status}): ${body}` },
                ],
                isError: true,
              };
            }
            return {
              content: [{ type: "text", text: `Merge result: ${body}` }],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text", text: `Merge request threw: ${msg}` }],
              isError: true,
            };
          }
        },
      ),
    ],
  });
}
