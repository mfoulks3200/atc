/**
 * Black box (event log) routes for the ATC daemon.
 *
 * Provides a read-only endpoint for a craft's append-only event log.
 *
 * @see RULE-BB-1 through RULE-BB-4 for black box rules.
 */

import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers black box routes as a Fastify plugin.
 *
 * Routes:
 * - `GET /api/v1/projects/:name/crafts/:callsign/blackbox` — read event log
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-BB-1
 */
export async function blackboxRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts/:callsign/blackbox
  // -------------------------------------------------------------------------

  app.get<{ Params: { name: string; callsign: string } }>(
    "/api/v1/projects/:name/crafts/:callsign/blackbox",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      return reply.send(craft.blackBox);
    },
  );
}
