/**
 * Agent management routes for the ATC daemon.
 *
 * Provides CRUD endpoints for agent records, lifecycle transitions
 * (pause/resume/recover), and usage reporting.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { AgentRecord } from "../../types.js";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface CreateAgentBody {
  id: string;
  adapterType: string;
  projectName: string;
  callsign: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers agent management routes as a Fastify plugin.
 *
 * Routes:
 * - `POST   /api/v1/agents`            — create agent
 * - `GET    /api/v1/agents`            — list agents
 * - `GET    /api/v1/agents/:id`        — get agent
 * - `POST   /api/v1/agents/:id/pause`  — pause agent
 * - `POST   /api/v1/agents/:id/resume` — resume agent
 * - `POST   /api/v1/agents/recover`    — recover all suspended agents
 * - `DELETE /api/v1/agents/:id`        — terminate and remove agent
 * - `GET    /api/v1/agents/:id/usage`  — get usage for agent's craft
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-PILOT-1
 */
export async function agentRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /api/v1/agents
  // -------------------------------------------------------------------------

  app.post<{ Body: CreateAgentBody }>("/api/v1/agents", async (request, reply) => {
    const { id, adapterType, projectName, callsign } = request.body;

    const record: AgentRecord = {
      id,
      adapterType,
      projectName,
      callsign,
      status: "running",
      adapterMeta: {},
    };

    app.agentStore.set(record);
    return reply.code(201).send(record);
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/agents
  // -------------------------------------------------------------------------

  app.get("/api/v1/agents", async (_request, reply) => {
    return reply.send(app.agentStore.list());
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/agents/:id
  // -------------------------------------------------------------------------

  app.get<{ Params: { id: string } }>("/api/v1/agents/:id", async (request, reply) => {
    const agent = app.agentStore.get(request.params.id);
    if (!agent) {
      return reply.code(404).send({ error: `Agent not found: ${request.params.id}` });
    }
    return reply.send(agent);
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/agents/:id/pause
  // -------------------------------------------------------------------------

  app.post<{ Params: { id: string } }>("/api/v1/agents/:id/pause", async (request, reply) => {
    const agent = app.agentStore.get(request.params.id);
    if (!agent) {
      return reply.code(404).send({ error: `Agent not found: ${request.params.id}` });
    }
    app.agentStore.updateStatus(request.params.id, "paused");
    return reply.send(app.agentStore.get(request.params.id));
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/agents/:id/resume
  // -------------------------------------------------------------------------

  app.post<{ Params: { id: string } }>("/api/v1/agents/:id/resume", async (request, reply) => {
    const agent = app.agentStore.get(request.params.id);
    if (!agent) {
      return reply.code(404).send({ error: `Agent not found: ${request.params.id}` });
    }
    app.agentStore.updateStatus(request.params.id, "running");
    return reply.send(app.agentStore.get(request.params.id));
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/agents/recover
  // -------------------------------------------------------------------------

  app.post("/api/v1/agents/recover", async (_request, reply) => {
    let count = 0;
    for (const agent of app.agentStore.list()) {
      if (agent.status === "suspended") {
        app.agentStore.updateStatus(agent.id, "running");
        count++;
      }
    }
    return reply.send({ recovered: count });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/agents/:id
  // -------------------------------------------------------------------------

  app.delete<{ Params: { id: string } }>("/api/v1/agents/:id", async (request, reply) => {
    const agent = app.agentStore.get(request.params.id);
    if (!agent) {
      return reply.code(404).send({ error: `Agent not found: ${request.params.id}` });
    }
    app.agentStore.updateStatus(request.params.id, "terminated");
    app.agentStore.remove(request.params.id);
    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/agents/:id/usage
  // -------------------------------------------------------------------------

  /**
   * Read usage.json for the agent's craft.
   * Returns an array of usage reports, or empty array if none found.
   */
  app.get<{ Params: { id: string } }>("/api/v1/agents/:id/usage", async (request, reply) => {
    const agent = app.agentStore.get(request.params.id);
    if (!agent) {
      return reply.code(404).send({ error: `Agent not found: ${request.params.id}` });
    }

    const usagePath = join(
      app.profileDir,
      "projects",
      agent.projectName,
      "crafts",
      agent.callsign,
      "usage.json",
    );

    try {
      const content = await readFile(usagePath, "utf-8");
      // usage.json is line-delimited JSON
      const reports = content
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as unknown);
      return reply.send(reports);
    } catch {
      return reply.send([]);
    }
  });
}
