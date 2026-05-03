/**
 * Shared helpers for the structured ATC MCP tool error contract.
 *
 * All ATC MCP tool error text MUST use the format:
 *   `{ruleId}: {description}. {fixHint}.`
 *
 * @see RULE-MCP-1 — sentinel ruleId for daemon connectivity failures.
 * @see RULE-MCP-2 — structured error format requirement.
 * @see RULE-MCP-3 — use daemon-supplied ruleId when present.
 */

/**
 * Fix hints keyed by ruleId for daemon-supplied 403 responses.
 * @see §4.9.3
 */
const DAEMON_FIX_HINTS: Record<string, string> = {
  "RULE-CTRL-2":
    "Only a captain or first officer may hold exclusive controls; assign a captain or first officer as the transfer target",
  "RULE-CTRL-3":
    "You must hold controls before modifying files; request a controls transfer first",
  "RULE-CTRL-6":
    "The captain has final authority over controls disputes; contact the captain to resolve",
};

/**
 * Format a structured MCP error string per RULE-MCP-2.
 *
 * Neither `description` nor `fixHint` should end with a period — the format
 * appends a period after each.
 */
export function mcpError(ruleId: string, description: string, fixHint: string): string {
  return `${ruleId}: ${description}. ${fixHint}.`;
}

/**
 * Parse a daemon HTTP response body, returning `{ error, ruleId }`.
 *
 * Attempts JSON parse; falls back to the raw text if non-JSON. Per RULE-MCP-3,
 * the caller should use the returned `ruleId` when present.
 */
export async function parseDaemonBody(
  response: Response,
): Promise<{ error: string; ruleId?: string }> {
  const text = await response.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { error?: unknown; ruleId?: unknown };
    return {
      error: typeof json.error === "string" ? json.error : text,
      ruleId: typeof json.ruleId === "string" ? json.ruleId : undefined,
    };
  } catch {
    return { error: text };
  }
}

/**
 * Return the fix hint for a daemon-supplied ruleId (§4.9.3).
 * Falls back to a generic hint for unknown rules.
 */
export function fixHintForDaemonRule(ruleId: string): string {
  return DAEMON_FIX_HINTS[ruleId] ?? "Check the ATC specification for the named rule";
}
