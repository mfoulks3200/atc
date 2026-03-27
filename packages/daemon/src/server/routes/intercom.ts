/**
 * Intercom (in-flight messaging) routes for the ATC daemon.
 *
 * Provides endpoints for reading and appending intercom messages
 * to a craft's communication log.
 *
 * @see RULE-CRAFT-5 for intercom usage constraints.
 */

import type { FastifyInstance } from "fastify";
import type { IntercomMessage } from "../../types.js";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface IntercomParams {
  name: string;
  callsign: string;
}

interface PostIntercomBody {
  from: string;
  seat: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers intercom routes as a Fastify plugin.
 *
 * Routes:
 * - `GET  /api/v1/projects/:name/crafts/:callsign/intercom` — list messages
 * - `POST /api/v1/projects/:name/crafts/:callsign/intercom` — send a message
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-CRAFT-5
 */
export async function intercomRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts/:callsign/intercom
  // -------------------------------------------------------------------------

  app.get<{ Params: IntercomParams }>(
    "/api/v1/projects/:name/crafts/:callsign/intercom",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      return reply.send(craft.intercom);
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts/:callsign/intercom
  // -------------------------------------------------------------------------

  app.post<{ Params: IntercomParams; Body: PostIntercomBody }>(
    "/api/v1/projects/:name/crafts/:callsign/intercom",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const { from, seat, content } = request.body;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      const message: IntercomMessage = {
        from,
        seat,
        content,
        timestamp: new Date().toISOString(),
      };

      app.craftStore.appendIntercom(name, callsign, message);
      return reply.send(message);
    },
  );
}
