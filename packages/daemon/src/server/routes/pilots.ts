/**
 * Pilot management routes for the ATC daemon.
 *
 * Provides CRUD endpoints for pilot records within a project scope.
 * Pilots are stored in an in-memory Map on the Fastify instance.
 *
 * @see RULE-PILOT-1 for pilot identity rules.
 * @see RULE-SEAT-1 through RULE-SEAT-3 for seat assignment rules.
 */

import type { FastifyInstance } from "fastify";
import type { PilotRecord } from "../../types.js";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface PilotParams {
  name: string;
  id: string;
}

interface CreatePilotBody {
  identifier: string;
  certifications: string[];
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
}

interface PatchPilotBody {
  certifications?: string[];
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers pilot management routes as a Fastify plugin.
 *
 * Routes:
 * - `POST  /api/v1/projects/:name/pilots`      — create pilot
 * - `GET   /api/v1/projects/:name/pilots`      — list pilots
 * - `GET   /api/v1/projects/:name/pilots/:id`  — get pilot
 * - `PATCH /api/v1/projects/:name/pilots/:id`  — update pilot
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-PILOT-1
 */
export async function pilotRoutes(app: FastifyInstance): Promise<void> {
  /** Helper to get or create the project's pilot map. */
  function getProjectPilots(projectName: string): Map<string, PilotRecord> {
    let pilots = app.pilotStore.get(projectName);
    if (!pilots) {
      pilots = new Map();
      app.pilotStore.set(projectName, pilots);
    }
    return pilots;
  }

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/pilots
  // -------------------------------------------------------------------------

  app.post<{ Params: { name: string }; Body: CreatePilotBody }>(
    "/api/v1/projects/:name/pilots",
    async (request, reply) => {
      const { name } = request.params;
      const { identifier, certifications, mcpServers } = request.body;

      const record: PilotRecord = {
        identifier,
        certifications,
        mcpServers: mcpServers ?? {},
      };

      getProjectPilots(name).set(identifier, record);
      return reply.code(201).send(record);
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/pilots
  // -------------------------------------------------------------------------

  app.get<{ Params: { name: string } }>(
    "/api/v1/projects/:name/pilots",
    async (request, reply) => {
      const { name } = request.params;
      const pilots = app.pilotStore.get(name);
      return reply.send(pilots ? Array.from(pilots.values()) : []);
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/pilots/:id
  // -------------------------------------------------------------------------

  app.get<{ Params: PilotParams }>(
    "/api/v1/projects/:name/pilots/:id",
    async (request, reply) => {
      const { name, id } = request.params;
      const pilot = app.pilotStore.get(name)?.get(id);
      if (!pilot) {
        return reply.code(404).send({ error: `Pilot not found: ${id}` });
      }
      return reply.send(pilot);
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /api/v1/projects/:name/pilots/:id
  // -------------------------------------------------------------------------

  app.patch<{ Params: PilotParams; Body: PatchPilotBody }>(
    "/api/v1/projects/:name/pilots/:id",
    async (request, reply) => {
      const { name, id } = request.params;
      const pilot = app.pilotStore.get(name)?.get(id);
      if (!pilot) {
        return reply.code(404).send({ error: `Pilot not found: ${id}` });
      }

      const updated: PilotRecord = {
        ...pilot,
        ...request.body,
        identifier: pilot.identifier, // preserve identifier
      };

      getProjectPilots(name).set(id, updated);
      return reply.send(updated);
    },
  );
}
