/**
 * Pilot management routes for the ATC daemon.
 *
 * Provides CRUD endpoints for pilot records within a project scope.
 * Pilots are persisted via {@link PilotStore}.
 *
 * @see RULE-PILOT-1 for pilot identity rules.
 * @see RULE-SEAT-1 through RULE-SEAT-3 for seat assignment rules.
 */

import type { FastifyInstance } from "fastify";

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
 * - `POST   /api/v1/projects/:name/pilots`      — create pilot
 * - `GET    /api/v1/projects/:name/pilots`      — list pilots
 * - `GET    /api/v1/projects/:name/pilots/:id`  — get pilot
 * - `PATCH  /api/v1/projects/:name/pilots/:id`  — update pilot
 * - `DELETE /api/v1/projects/:name/pilots/:id`  — delete pilot
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-PILOT-1
 */
export async function pilotRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/pilots
  // -------------------------------------------------------------------------

  app.post<{ Params: { name: string }; Body: CreatePilotBody }>(
    "/api/v1/projects/:name/pilots",
    async (request, reply) => {
      const { name } = request.params;
      const { identifier, certifications, mcpServers } = request.body;

      const record = {
        identifier,
        certifications,
        mcpServers: mcpServers ?? {},
      };

      app.pilotStore.set(name, record);
      return reply.code(201).send(record);
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/pilots
  // -------------------------------------------------------------------------

  app.get<{ Params: { name: string } }>("/api/v1/projects/:name/pilots", async (request, reply) => {
    const { name } = request.params;
    return reply.send(app.pilotStore.listForProject(name));
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/pilots/:id
  // -------------------------------------------------------------------------

  app.get<{ Params: PilotParams }>("/api/v1/projects/:name/pilots/:id", async (request, reply) => {
    const { name, id } = request.params;
    const pilot = app.pilotStore.get(name, id);
    if (!pilot) {
      return reply.code(404).send({ error: `Pilot not found: ${id}` });
    }
    return reply.send(pilot);
  });

  // -------------------------------------------------------------------------
  // PATCH /api/v1/projects/:name/pilots/:id
  // -------------------------------------------------------------------------

  app.patch<{ Params: PilotParams; Body: PatchPilotBody }>(
    "/api/v1/projects/:name/pilots/:id",
    async (request, reply) => {
      const { name, id } = request.params;
      const pilot = app.pilotStore.get(name, id);
      if (!pilot) {
        return reply.code(404).send({ error: `Pilot not found: ${id}` });
      }

      const updated = {
        ...pilot,
        ...request.body,
        identifier: pilot.identifier, // preserve identifier
      };

      app.pilotStore.set(name, updated);
      return reply.send(updated);
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /api/v1/projects/:name/pilots/:id
  // -------------------------------------------------------------------------

  app.delete<{ Params: PilotParams }>(
    "/api/v1/projects/:name/pilots/:id",
    async (request, reply) => {
      const { name, id } = request.params;
      const removed = app.pilotStore.remove(name, id);
      if (!removed) {
        return reply.code(404).send({ error: `Pilot not found: ${id}` });
      }
      return reply.code(204).send();
    },
  );
}
