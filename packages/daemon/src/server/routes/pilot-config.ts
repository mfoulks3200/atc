/**
 * REST routes for per-pilot configuration management.
 *
 * Backed by an in-memory PilotConfigStore. Broadcasts change events on
 * `config:pilot:<id>` channels.
 *
 * @see RULE-PILOT-1
 */

import type { FastifyInstance } from "fastify";
import { UnknownConfigKeyError } from "@airtrafficcontrol/errors";
import type { PilotConfig } from "../../config/schema.js";

/** URL params for routes scoped to a pilot. */
interface PilotConfigParams {
  name: string;
  id: string;
}

/** URL params for routes that address a single config key. */
interface PilotConfigKeyParams extends PilotConfigParams {
  key: string;
}

/**
 * Registers `/api/v1/projects/:name/pilots/:id/config` routes on the Fastify instance.
 *
 * Routes: GET, PUT, PATCH, and DELETE /:key.
 *
 * @see RULE-PILOT-1
 */
export async function pilotConfigRoutes(app: FastifyInstance): Promise<void> {
  // GET — returns { config, overrides }
  app.get<{ Params: PilotConfigParams }>(
    "/api/v1/projects/:name/pilots/:id/config",
    async (request, _reply) => {
      const { id } = request.params;
      return {
        config: app.pilotConfigStore.get(id),
        overrides: app.pilotConfigStore.getOverrides(id),
      };
    },
  );

  // PUT — full replace
  app.put<{ Params: PilotConfigParams }>(
    "/api/v1/projects/:name/pilots/:id/config",
    async (request, reply) => {
      const { id } = request.params;
      try {
        const merged = app.pilotConfigStore.replace(id, request.body as PilotConfig);
        return { config: merged };
      } catch (err) {
        return reply.code(400).send({
          error: { code: "INVALID_CONFIG", message: (err as Error).message },
        });
      }
    },
  );

  // PATCH — partial merge
  app.patch<{ Params: PilotConfigParams }>(
    "/api/v1/projects/:name/pilots/:id/config",
    async (request, _reply) => {
      const { id } = request.params;
      const merged = app.pilotConfigStore.patch(id, request.body as Partial<PilotConfig>);
      return { config: merged };
    },
  );

  // DELETE /:key — revert to default
  app.delete<{ Params: PilotConfigKeyParams }>(
    "/api/v1/projects/:name/pilots/:id/config/:key",
    async (request, reply) => {
      const { id, key } = request.params;
      try {
        const merged = app.pilotConfigStore.unset(id, key as keyof PilotConfig);
        return { config: merged };
      } catch (err) {
        if (err instanceof UnknownConfigKeyError) {
          return reply.code(404).send({
            error: { code: "UNKNOWN_CONFIG_KEY", message: err.message },
          });
        }
        return reply.code(500).send({
          error: { code: "INTERNAL", message: (err as Error).message },
        });
      }
    },
  );
}
