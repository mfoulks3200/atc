/**
 * Tower (merge queue) routes for the ATC daemon.
 *
 * Provides endpoints for viewing the tower landing queue and requesting
 * landing clearance after all vectors have passed.
 *
 * @see RULE-TOWER-1 for tower coordination rules.
 * @see RULE-TOWER-2 for clearance prerequisites.
 */

import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface ClearanceBody {
  callsign: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers tower (merge queue) routes as a Fastify plugin.
 *
 * Routes:
 * - `GET  /api/v1/projects/:name/tower`           — view queue
 * - `POST /api/v1/projects/:name/tower/clearance`  — request clearance
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-TOWER-1
 * @see RULE-TOWER-2
 */
export async function towerRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/tower
  // -------------------------------------------------------------------------

  app.get<{ Params: { name: string } }>("/api/v1/projects/:name/tower", async (request, reply) => {
    const { name } = request.params;
    return reply.send(app.towerStore.getQueue(name));
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/tower/clearance
  // -------------------------------------------------------------------------

  /**
   * Request landing clearance for a craft.
   *
   * @see RULE-TOWER-2 — all vectors must be passed before clearance can be granted.
   */
  app.post<{ Params: { name: string }; Body: ClearanceBody }>(
    "/api/v1/projects/:name/tower/clearance",
    async (request, reply) => {
      const { name } = request.params;
      const { callsign } = request.body;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      // RULE-TOWER-2: all vectors must be passed
      const allPassed = craft.flightPlan.every((v) => v.status === "Passed");
      if (!allPassed) {
        return reply.code(409).send({ error: "Not all vectors have passed" });
      }

      app.towerStore.enqueue(name, callsign);

      return reply.send({ granted: true });
    },
  );
}
