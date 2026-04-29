/**
 * @airtrafficcontrol/mcp-server
 *
 * Standalone MCP server package that exposes ATC coordination primitives
 * as a Streamable HTTP MCP server mounted on the daemon's Fastify instance.
 *
 * ## Usage
 *
 * ```ts
 * import { mcpPlugin } from "@airtrafficcontrol/mcp-server";
 * app.register(mcpPlugin);
 * ```
 *
 * ## Session Flow
 *
 * ```
 * POST /api/v1/mcp/session  { pilotId, callsign, projectName }
 *   → 201 { token }
 *
 * POST /api/v1/mcp          (MCP JSON-RPC)
 * Authorization: Bearer <token>
 * ```
 *
 * @see RULE-CTRL-2 for seat-gated tool access.
 * @see RULE-EMER-1 for emergency declaration authority.
 */

export { mcpPlugin } from "./plugin.js";
export type { AtcSession, SessionEntry } from "./session-store.js";
