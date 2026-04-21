/**
 * REST routes for project-level configuration management.
 *
 * All mutations funnel through the project's LayeredConfigStore, which
 * atomically persists the sparse diff against defaults and broadcasts
 * change events on the `config:project:<name>` channel.
 *
 * @see RULE-CRAFT-1
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { ConfigValidationError, UnknownConfigKeyError } from "@airtrafficcontrol/errors";
import type { LayeredConfigStore } from "../../config/layered-store.js";
import type { ProjectMetadataConfig } from "../../config/schema.js";

/**
 * Registers `/api/v1/projects/:name/config` routes on the Fastify instance.
 *
 * Routes: GET, PUT, PATCH, and DELETE /:key.
 * If no store is registered for the given project name, routes return 404.
 *
 * @see RULE-CRAFT-1
 */
export async function projectConfigRoutes(app: FastifyInstance): Promise<void> {
  const requireStore = (
    name: string,
    reply: FastifyReply,
  ): LayeredConfigStore<ProjectMetadataConfig> | null => {
    const store = app.projectConfigStores.get(name);
    if (!store) {
      void reply.code(404).send({
        error: { code: "PROJECT_NOT_FOUND", message: `Project not found: ${name}` },
      });
      return null;
    }
    return store;
  };

  const mapError = (err: unknown): { statusCode: number; body: unknown } => {
    if (err instanceof ConfigValidationError) {
      return {
        statusCode: 400,
        body: { error: { code: "INVALID_CONFIG", message: err.message, issues: err.issues } },
      };
    }
    if (err instanceof UnknownConfigKeyError) {
      return {
        statusCode: 404,
        body: { error: { code: "UNKNOWN_CONFIG_KEY", message: err.message } },
      };
    }
    return {
      statusCode: 500,
      body: { error: { code: "INTERNAL", message: (err as Error).message } },
    };
  };

  // GET /api/v1/projects/:name/config
  app.get<{ Params: { name: string } }>("/api/v1/projects/:name/config", async (request, reply) => {
    const store = requireStore(request.params.name, reply);
    if (store === null) return;
    return { config: store.get(), overrides: store.getOverrides() };
  });

  // PUT /api/v1/projects/:name/config
  app.put<{ Params: { name: string } }>("/api/v1/projects/:name/config", async (request, reply) => {
    const store = requireStore(request.params.name, reply);
    if (store === null) return;
    try {
      const merged = await store.replace(request.body as ProjectMetadataConfig);
      return { config: merged };
    } catch (err) {
      const { statusCode, body } = mapError(err);
      return reply.code(statusCode).send(body);
    }
  });

  // PATCH /api/v1/projects/:name/config
  app.patch<{ Params: { name: string } }>(
    "/api/v1/projects/:name/config",
    async (request, reply) => {
      const store = requireStore(request.params.name, reply);
      if (store === null) return;
      try {
        const merged = await store.patch(request.body as Partial<ProjectMetadataConfig>);
        return { config: merged };
      } catch (err) {
        const { statusCode, body } = mapError(err);
        return reply.code(statusCode).send(body);
      }
    },
  );

  // DELETE /api/v1/projects/:name/config/:key
  app.delete<{ Params: { name: string; key: string } }>(
    "/api/v1/projects/:name/config/:key",
    async (request, reply) => {
      const store = requireStore(request.params.name, reply);
      if (store === null) return;
      try {
        const merged = await store.unset(
          request.params.key as keyof ProjectMetadataConfig & string,
        );
        return { config: merged };
      } catch (err) {
        const { statusCode, body } = mapError(err);
        return reply.code(statusCode).send(body);
      }
    },
  );
}
