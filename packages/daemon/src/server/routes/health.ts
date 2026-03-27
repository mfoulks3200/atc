import type { FastifyInstance } from "fastify";

const START_TIME = Date.now();
const VERSION = "0.0.1";

/**
 * Registers health and status routes on the provided Fastify instance.
 *
 * Routes:
 * - `GET /api/v1/health` — liveness check with version and uptime.
 * - `GET /api/v1/status` — runtime summary with profile and entity counts.
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
   * Returns the active profile name and placeholder counts for tracked
   * entities. Counts will be wired to live stores in a later task.
   */
  app.get("/api/v1/status", async (_request, _reply) => {
    return {
      profile: "default",
      projects: 0,
      crafts: 0,
      agents: 0,
    };
  });
}
