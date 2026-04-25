import type { FastifyInstance } from "fastify";

const START_TIME = Date.now();
const VERSION = "0.0.1";

/**
 * Registers health and status routes on the provided Fastify instance.
 *
 * Routes:
 * - `GET /api/v1/health` — liveness check with version and uptime.
 * - `GET /api/v1/status` — runtime summary with profile and entity counts.
 * - `GET /api/v1/about` — daemon version information.
 *
 * @param app - The Fastify instance to register routes on.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Liveness check.
   *
   * Returns the daemon version and seconds elapsed since process start.
   */
  app.get("/api/v1/health", async (_request, _reply) => {
    return {
      status: "ok",
      version: VERSION,
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
    };
  });

  /**
   * Runtime status summary.
   *
   * Returns the active profile name and live counts of tracked entities.
   */
  app.get("/api/v1/status", async (_request, _reply) => {
    return {
      profile: "default",
      projects: app.projectConfigStores.size,
      crafts: app.craftStore.listAll().length,
      agents: app.agentStore.list().length,
    };
  });

  /**
   * About endpoint.
   *
   * Returns the daemon version. Consumers (CLI, other services) can
   * use this to check the running daemon version.
   */
  app.get("/api/v1/about", async (_request, _reply) => {
    return { version: VERSION };
  });
}
