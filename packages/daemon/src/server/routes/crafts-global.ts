/**
 * Cross-project crafts listing route.
 *
 * Returns every craft known to the daemon, each tagged with its project name
 * so the web "All Crafts" page can render a single global view without
 * needing to fan out per-project queries from the client.
 *
 * Optional filters:
 * - `?status=InFlight` — restrict to a single craft status
 * - `?project=foo`     — restrict to a single project name
 *
 * @see RULE-CRAFT-1 — every craft has a unique callsign within a project.
 */

import type { FastifyInstance } from "fastify";
import type { CraftState } from "../../types.js";

interface ListCraftsQuery {
  status?: string;
  project?: string;
}

/**
 * A craft with its owning project name attached.
 */
type CraftWithProject = CraftState & { projectName: string };

export async function craftsGlobalRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ListCraftsQuery }>(
    "/api/v1/crafts",
    async (request, reply) => {
      const { status, project } = request.query;
      const all = app.craftStore.listAll();
      const filtered: CraftWithProject[] = [];
      for (const { projectName, craft } of all) {
        if (project && projectName !== project) continue;
        if (status && craft.status !== status) continue;
        filtered.push({ ...craft, projectName });
      }
      return reply.send(filtered);
    },
  );
}
