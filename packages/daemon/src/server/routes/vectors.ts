/**
 * Vector (flight plan) routes for the ATC daemon.
 *
 * Provides endpoints for reading a craft's flight plan and reporting
 * vector completion with evidence.
 *
 * @see RULE-VEC-1 through RULE-VEC-5 for vector rules.
 * @see RULE-VEC-2 for sequential ordering constraint.
 */

import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface VectorParams {
  name: string;
  callsign: string;
  vectorName: string;
}

interface ReportBody {
  evidence: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers vector (flight plan) routes as a Fastify plugin.
 *
 * Routes:
 * - `GET  /api/v1/projects/:name/crafts/:callsign/vectors`                  — list vectors
 * - `POST /api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/report` — report a vector
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-VEC-2
 */
export async function vectorRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts/:callsign/vectors
  // -------------------------------------------------------------------------

  app.get<{ Params: { name: string; callsign: string } }>(
    "/api/v1/projects/:name/crafts/:callsign/vectors",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      return reply.send(craft.flightPlan);
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/report
  // -------------------------------------------------------------------------

  /**
   * Report a vector as passed with evidence.
   *
   * @see RULE-VEC-2 — vectors must be passed in order; only the next Pending vector can be reported.
   */
  app.post<{ Params: VectorParams; Body: ReportBody }>(
    "/api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/report",
    async (request, reply) => {
      const { name, callsign, vectorName } = request.params;
      const { evidence } = request.body;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      const vector = craft.flightPlan.find((v) => v.name === vectorName);
      if (!vector) {
        return reply.code(404).send({ error: `Vector not found: ${vectorName}` });
      }

      // RULE-VEC-2: must be the next Pending vector in order
      const nextPending = craft.flightPlan.find((v) => v.status === "Pending");
      if (!nextPending || nextPending.name !== vectorName) {
        return reply.code(409).send({
          error: `Vector "${vectorName}" is not the next pending vector`,
        });
      }

      vector.status = "Passed";
      vector.evidence = evidence;
      vector.reportedAt = new Date().toISOString();
      app.craftStore.set(name, craft);

      return reply.send(craft.flightPlan);
    },
  );
}
