/**
 * Agent management routes for the ATC daemon.
 *
 * Provides CRUD endpoints for agent records, lifecycle transitions
 * (pause/resume/recover), and usage reporting.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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

interface LaunchAgentBody {
  projectName: string;
  callsign: string;
  adapterType: string;
  adapterConfig?: Record<string, unknown>;
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
  // POST /api/v1/agents/launch
  // -------------------------------------------------------------------------

  /**
   * Launch a new agent for a craft through the AgentManager.
   *
   * Resolves the craft's captain pilot, delegates to the registered adapter,
   * and persists the returned handle as an AgentRecord. Returns 404 when the
   * craft or captain cannot be found, 400 when the adapter is not registered.
   *
   * @see RULE-PILOT-1
   */
  app.post<{ Body: LaunchAgentBody }>("/api/v1/agents/launch", async (request, reply) => {
    const { projectName, callsign, adapterType, adapterConfig } = request.body;
    const manager = app.agentManager;
    if (manager === null) {
      return reply.code(503).send({ error: "Agent manager is not configured" });
    }

    const craft = app.craftStore.get(projectName, callsign);
    if (!craft) {
      return reply.code(404).send({ error: `Craft not found: ${callsign}` });
    }
    if (!craft.captain) {
      return reply.code(400).send({ error: "Craft has no captain assigned" });
    }
    const captain = app.pilotStore.get(projectName, craft.captain);
    if (!captain) {
      return reply.code(404).send({ error: `Captain pilot not found: ${craft.captain}` });
    }
    if (app.adapterRegistry.get(adapterType) === undefined) {
      return reply.code(400).send({ error: `Unknown adapter type: ${adapterType}` });
    }

    const agentId = randomUUID();
    const worktreePath = join(
      app.profileDir,
      "projects",
      projectName,
      "crafts",
      callsign,
      "worktree",
    );

    try {
      const record = await manager.launch({
        agentId,
        adapterType,
        projectName,
        callsign,
        launchOptions: {
          agentId,
          worktreePath,
          craft,
          systemPrompt: captain.systemPrompt ?? "",
          intercomHistory: craft.intercom,
          adapterConfig: adapterConfig ?? {},
          mcpServers: captain.mcpServers,
        },
      });
      return reply.code(201).send(record);
    } catch (err) {
      return reply
        .code(500)
        .send({ error: err instanceof Error ? err.message : "Failed to launch agent" });
    }
  });

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
    if (app.agentManager !== null) {
      await app.agentManager.stop(request.params.id);
    } else {
      app.agentStore.updateStatus(request.params.id, "terminated");
    }
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
