/**
 * REST routes for global configuration management.
 *
 * All mutations funnel through the daemon's GlobalConfigStore, which
 * atomically persists the sparse diff against defaults and broadcasts
 * change events on the `config:global` channel.
 *
 * @see RULE-CFG-1
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { ConfigValidationError, UnknownConfigKeyError } from "@atc/errors";
import type { LayeredConfigStore } from "../../config/layered-store.js";
import type { GlobalConfig } from "../../config/schema.js";

/**
 * Registers `/api/v1/config/global` routes on the Fastify instance.
 *
 * If no global config store is wired to the app, the routes return 503.
 */
export async function configRoutes(app: FastifyInstance): Promise<void> {
  const requireStore = (reply: FastifyReply): LayeredConfigStore<GlobalConfig> | null => {
    if (app.globalConfigStore === null) {
      void reply.code(503).send({
        error: { code: "UNAVAILABLE", message: "Global config store not available" },
      });
      return null;
    }
    return app.globalConfigStore;
  };

  const mapError = (err: unknown): { statusCode: number; body: unknown } => {
    if (err instanceof ConfigValidationError) {
      return {
        statusCode: 400,
        body: {
          error: {
            code: "INVALID_CONFIG",
            message: err.message,
            issues: err.issues,
          },
        },
      };
    }
    if (err instanceof UnknownConfigKeyError) {
      return {
        statusCode: 404,
        body: {
          error: {
            code: "UNKNOWN_CONFIG_KEY",
            message: err.message,
          },
        },
      };
    }
    return {
      statusCode: 500,
      body: { error: { code: "INTERNAL", message: (err as Error).message } },
    };
  };

  app.get("/api/v1/config/global", async (_request, reply) => {
    const store = requireStore(reply);
    if (store === null) return;
    return { config: store.get(), overrides: store.getOverrides() };
  });

  app.put("/api/v1/config/global", async (request, reply) => {
    const store = requireStore(reply);
    if (store === null) return;
    try {
      const merged = await store.replace(request.body as GlobalConfig);
      return { config: merged };
    } catch (err) {
      const { statusCode, body } = mapError(err);
      return reply.code(statusCode).send(body);
    }
  });

  app.patch("/api/v1/config/global", async (request, reply) => {
    const store = requireStore(reply);
    if (store === null) return;
    try {
      const merged = await store.patch(request.body as Partial<GlobalConfig>);
      return { config: merged };
    } catch (err) {
      const { statusCode, body } = mapError(err);
      return reply.code(statusCode).send(body);
    }
  });

  app.delete<{ Params: { key: string } }>("/api/v1/config/global/:key", async (request, reply) => {
    const store = requireStore(reply);
    if (store === null) return;
    try {
      const merged = await store.unset(request.params.key as keyof GlobalConfig & string);
      return { config: merged };
    } catch (err) {
      const { statusCode, body } = mapError(err);
      return reply.code(statusCode).send(body);
    }
  });
}
