/**
 * Fastify plugin that mounts the ATC MCP server at `/api/v1/mcp`.
 *
 * Routes:
 * - `POST /api/v1/mcp/session`  — create an ATC session and get a token
 * - `DELETE /api/v1/mcp/session` — terminate a session
 * - `POST /api/v1/mcp`          — MCP Streamable HTTP primary endpoint
 * - `GET  /api/v1/mcp`          — MCP SSE stream endpoint
 * - `DELETE /api/v1/mcp`        — close an MCP SSE session
 *
 * ## Session Flow
 *
 * 1. Client calls `POST /api/v1/mcp/session` with `{ pilotId, callsign, projectName }`.
 * 2. Server validates the pilot is on the craft.
 * 3. Returns `{ token }`.
 * 4. Client sends all MCP requests with `Authorization: Bearer <token>`.
 *
 * @see RULE-CTRL-2 for seat-gated tools.
 * @see RULE-EMER-1 for emergency declaration authority.
 */

import type { FastifyInstance } from "fastify";
import { SessionStore } from "./session-store.js";
import { buildAtcMcpServer, type AtcAppInstance } from "./build-server.js";

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

interface CreateSessionBody {
  pilotId: string;
  callsign: string;
  projectName: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers the ATC MCP server routes on the given Fastify instance.
 *
 * The daemon calls this once during startup via `app.register(mcpPlugin)`.
 * All tool calls and resources are scoped to the ATC session identified by
 * the Bearer token in each request's Authorization header.
 *
 * @param app - The Fastify instance (must have `craftStore` and `pilotStore` decorated).
 */
export async function mcpPlugin(app: FastifyInstance): Promise<void> {
  const sessions = new SessionStore();
  // Cast to AtcAppInstance: the daemon decorates craftStore before registering this plugin.
  const atcApp = app as FastifyInstance & AtcAppInstance;

  // -------------------------------------------------------------------------
  // POST /api/v1/mcp/session — create session
  // -------------------------------------------------------------------------

  app.post<{ Body: CreateSessionBody }>("/api/v1/mcp/session", async (request, reply) => {
    const { pilotId, callsign, projectName } = request.body ?? {};

    if (!pilotId || !callsign || !projectName) {
      return reply.code(400).send({ error: "pilotId, callsign, and projectName are required." });
    }

    const craft = atcApp.craftStore.get(projectName, callsign);
    if (!craft) {
      return reply.code(404).send({ error: `Craft not found: ${callsign} in project ${projectName}` });
    }

    const isOnCraft =
      craft.captain === pilotId ||
      craft.firstOfficers.includes(pilotId) ||
      craft.jumpseaters.includes(pilotId);

    if (!isOnCraft) {
      return reply.code(403).send({
        error: `Pilot ${pilotId} is not a crew member of ${callsign}.`,
        ruleId: "RULE-SEAT-1",
      });
    }

    const session = { pilotId, callsign, projectName };
    const { mcpServer, transport } = await buildAtcMcpServer(session, atcApp);
    const token = sessions.create({ session, mcpServer, transport });

    return reply.code(201).send({ token });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/mcp/session — terminate session
  // -------------------------------------------------------------------------

  app.delete("/api/v1/mcp/session", async (request, reply) => {
    const token = extractToken(request.headers["authorization"]);
    if (!token) {
      return reply.code(401).send({ error: "Authorization: Bearer <token> required." });
    }
    await sessions.delete(token);
    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/mcp — MCP primary endpoint (Streamable HTTP)
  // -------------------------------------------------------------------------

  app.post("/api/v1/mcp", async (request, reply) => {
    const token = extractToken(request.headers["authorization"]);
    if (!token) {
      return reply.code(401).send({ error: "Authorization: Bearer <token> required." });
    }

    const entry = sessions.get(token);
    if (!entry) {
      return reply.code(401).send({ error: "Invalid or expired ATC session token." });
    }

    await entry.transport.handleRequest(request.raw, reply.raw, request.body);
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/mcp — SSE stream endpoint
  // -------------------------------------------------------------------------

  app.get("/api/v1/mcp", async (request, reply) => {
    const token = extractToken(request.headers["authorization"]);
    if (!token) {
      return reply.code(401).send({ error: "Authorization: Bearer <token> required." });
    }

    const entry = sessions.get(token);
    if (!entry) {
      return reply.code(401).send({ error: "Invalid or expired ATC session token." });
    }

    await entry.transport.handleRequest(request.raw, reply.raw);
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/mcp — close MCP SSE session
  // -------------------------------------------------------------------------

  app.delete("/api/v1/mcp", async (request, reply) => {
    const token = extractToken(request.headers["authorization"]);
    if (!token) {
      return reply.code(401).send({ error: "Authorization: Bearer <token> required." });
    }

    const entry = sessions.get(token);
    if (!entry) {
      return reply.code(404).send({ error: "Session not found." });
    }

    await entry.transport.handleRequest(request.raw, reply.raw);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1];
}
