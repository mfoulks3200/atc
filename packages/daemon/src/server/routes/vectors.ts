/**
 * Vector (flight plan) routes for the ATC daemon.
 *
 * Provides endpoints for reading a craft's flight plan and reporting
 * vector completion with evidence.
 *
 * @see RULE-VEC-1 through RULE-VEC-9 for vector rules.
 * @see RULE-VEC-2 for sequential ordering constraint.
 * @see RULE-CTRL-3a for adversarial review controls handoff enforcement.
 */

import type { FastifyInstance } from "fastify";
import { BlackBoxEntryType } from "@airtrafficcontrol/types";
import { publishCraftEvent } from "./broadcast.js";
import { appendBlackBoxEntry } from "./blackbox-helpers.js";

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
 * @see RULE-CTRL-3a
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
   * For `adversarial_review` vectors, the designated reviewer must hold
   * exclusive controls before the report can be accepted (RULE-CTRL-3a).
   * This implicitly enforces that the builder has released controls.
   *
   * @see RULE-VEC-2 — vectors must be passed in order; only the next Pending vector can be reported.
   * @see RULE-CTRL-3a — reviewer must hold exclusive controls for adversarial_review vectors.
   */
  app.post<{ Params: VectorParams; Body: ReportBody }>(
    "/api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/report",
    async (request, reply) => {
      const { name, callsign, vectorName } = request.params;
      const { evidence } = request.body;

      if (!app.craftStore.get(name, callsign)) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      return app.craftStore.withCraftLock(name, callsign, async () => {
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

        // RULE-CTRL-3a: adversarial_review vectors require the designated reviewer
        // to hold exclusive controls before the report can be accepted.
        if (vector.type === "adversarial_review") {
          const { reviewerPilotId } = vector;
          const { controls } = craft;
          const reviewerHoldsExclusive =
            controls.mode === "exclusive" && controls.holder === reviewerPilotId;
          if (!reviewerHoldsExclusive) {
            return reply.code(403).send({
              error:
                `Adversarial review vector "${vectorName}" requires reviewer ` +
                `${reviewerPilotId} to hold exclusive controls before filing a report. ` +
                `Current controls: ${controls.mode}` +
                (controls.mode === "exclusive" ? ` holder=${controls.holder}` : ""),
              ruleId: "RULE-CTRL-3a",
            });
          }
        }

        const author =
          vector.type === "adversarial_review" && vector.reviewerPilotId
            ? vector.reviewerPilotId
            : craft.captain;

        vector.status = "Passed";
        vector.evidence = evidence;
        vector.reportedAt = new Date().toISOString();

        appendBlackBoxEntry(
          app,
          name,
          craft,
          author,
          BlackBoxEntryType.VectorPassed,
          `Vector "${vectorName}" passed with evidence: ${evidence}`,
          { authenticatedPilotId: author },
        );

        app.craftStore.set(name, craft);
        publishCraftEvent(app, name, craft, "craft.vector.reported", { vector });

        return reply.send(craft.flightPlan);
      });
    },
  );
}
