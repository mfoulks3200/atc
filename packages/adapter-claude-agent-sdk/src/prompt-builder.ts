/**
 * Builds system prompt strings for agents launched via the Claude Agent SDK adapter.
 *
 * The prompt encodes a craft's full state — callsign, cargo, flight plan, controls,
 * and the pilot's seat assignment — so the agent starts with complete situational
 * awareness without needing to query the daemon on boot.
 *
 * @see RULE-PILOT-1 for pilot identity and lifecycle rules.
 * @see RULE-CRAFT-1 through RULE-CRAFT-8 for craft lifecycle rules.
 * @see RULE-VEC-1 through RULE-VEC-5 for vector rules.
 * @see RULE-CTRL-1 through RULE-CTRL-5 for controls rules.
 */

import type { CraftState } from "@atc/daemon";

/**
 * Builds a structured system prompt string for a pilot agent.
 *
 * Encodes the craft callsign, branch, cargo, category, the pilot's ID and seat,
 * the current craft status, all flight plan vectors with their current status,
 * the controls state, and a brief summary of key ATC rules the agent must follow.
 *
 * @param craft    - The full persisted craft state.
 * @param pilotId  - The identifier of the pilot being launched.
 * @param seat     - The seat type assigned to this pilot ("captain", "firstOfficer", "jumpseat").
 * @returns A formatted system prompt string.
 *
 * @see RULE-PILOT-1 for pilot identity rules.
 * @see RULE-SEAT-1 through RULE-SEAT-3 for seat assignment rules.
 */
export function buildSystemPrompt(craft: CraftState, pilotId: string, seat: string): string {
  const vectorLines = craft.flightPlan
    .map((v, i) => {
      const statusTag =
        v.status === "Passed" ? "[PASSED]" : v.status === "Failed" ? "[FAILED]" : "[PENDING]";
      return `  ${i + 1}. ${statusTag} ${v.name}: ${v.acceptanceCriteria}`;
    })
    .join("\n");

  const controlsLine =
    craft.controls.mode === "exclusive"
      ? `Exclusive — held by ${craft.controls.holder ?? "unknown"}`
      : `Shared — participants: ${(craft.controls.sharedAreas ?? []).map((a) => `${a.pilotId} (${a.area})`).join(", ") || "none"}`;

  return [
    "# ATC Agent System Prompt",
    "",
    "## Craft",
    `- Callsign: ${craft.callsign}`,
    `- Branch: ${craft.branch}`,
    `- Cargo: ${craft.cargo}`,
    `- Category: ${craft.category}`,
    `- Status: ${craft.status}`,
    "",
    "## Pilot",
    `- ID: ${pilotId}`,
    `- Seat: ${seat}`,
    "",
    "## Flight Plan",
    vectorLines || "  (no vectors defined)",
    "",
    "## Controls",
    `- Mode: ${controlsLine}`,
    "",
    "## Rules Summary",
    "- Work only within the scope of your assigned cargo.",
    "- Advance vectors in order; do not skip.",
    "- Only the captain may declare an emergency.",
    "- Jumpseat pilots may not modify code or hold controls.",
    "- All significant events must be logged to the black box.",
  ].join("\n");
}
