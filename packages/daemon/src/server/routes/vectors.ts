/**
 * Vector (flight plan) routes for the ATC daemon.
 *
 * Provides endpoints for reading a craft's flight plan and reporting
 * vector completion with evidence.
 *
 * @see RULE-VEC-1 through RULE-VEC-5 for vector rules.
 * @see RULE-VEC-2 for sequential ordering constraint.
 * @see RULE-CHKL-10 for vector-scoped checklist binding rules.
 */

import type { FastifyInstance } from "fastify";
import { BlackBoxEntryType, LifecycleEvent } from "@airtrafficcontrol/types";
import type { ChecklistRunResult } from "@airtrafficcontrol/types";
import { runChecklist, resolveChecklist } from "@airtrafficcontrol/checklist";
import { publishCraftEvent } from "./broadcast.js";
import { appendBlackBoxEntry } from "./blackbox-helpers.js";
import { getOrCreateProjectChecklistRegistries } from "../app.js";

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
 * @see RULE-CHKL-10
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
   * Runs any `before:vector-complete` checklists scoped to this vector before
   * marking it passed (RULE-CHKL-10). If a required item fails, the vector is
   * not marked passed and 422 is returned with the checklist results. After a
   * successful report, `after:vector-complete` checklists are run and recorded
   * in the black box (advisory — they do not gate the response).
   *
   * @see RULE-VEC-2     — vectors must be passed in order.
   * @see RULE-CHKL-10   — vector-scoped bindings matched by vectorName.
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

      const registries = getOrCreateProjectChecklistRegistries(
        app.projectChecklistRegistries,
        name,
      );

      // RULE-CHKL-10: resolve and run before:vector-complete checklists scoped to this vector.
      const beforeResolved = resolveChecklist({
        craftCallsign: callsign,
        craftCategory: craft.category,
        event: LifecycleEvent.BeforeVectorComplete,
        vectorName,
        templates: registries.templates,
        bindings: registries.bindings,
        overrides: registries.overrides,
      });

      // RULE-CHKL-11: all bound templates run to completion regardless of individual failures.
      const beforeResults: ChecklistRunResult[] = [];
      for (const checklist of beforeResolved) {
        const checkResult = await runChecklist({
          checklistName: checklist.templateName,
          event: LifecycleEvent.BeforeVectorComplete,
          craftCallsign: callsign,
          attempt: 1,
          items: checklist.items,
        });

        beforeResults.push(checkResult);

        appendBlackBoxEntry(
          app,
          name,
          craft,
          "system",
          BlackBoxEntryType.ChecklistRun,
          `Vector checklist "${checklist.templateName}" for "${vectorName}" ${checkResult.passed ? "passed" : "failed"}`,
        );
      }

      const anyRequiredFailure = beforeResults.some((r) => !r.passed);
      if (anyRequiredFailure) {
        app.craftStore.set(name, craft);
        return reply.code(422).send({
          error: "One or more vector checklists failed",
          code: "VECTOR_CHECKLIST_FAILED",
          vectorName,
          checklistResults: beforeResults,
        });
      }

      vector.status = "Passed";
      vector.evidence = evidence;
      vector.reportedAt = new Date().toISOString();

      appendBlackBoxEntry(
        app,
        name,
        craft,
        craft.captain,
        BlackBoxEntryType.VectorPassed,
        `Vector "${vectorName}" passed with evidence: ${evidence}`,
      );

      app.craftStore.set(name, craft);
      publishCraftEvent(app, name, craft, "craft.vector.reported", { vector });

      // RULE-CHKL-10: run after:vector-complete checklists — observational, do not gate response.
      const afterResolved = resolveChecklist({
        craftCallsign: callsign,
        craftCategory: craft.category,
        event: LifecycleEvent.AfterVectorComplete,
        vectorName,
        templates: registries.templates,
        bindings: registries.bindings,
        overrides: registries.overrides,
      });

      for (const checklist of afterResolved) {
        const checkResult = await runChecklist({
          checklistName: checklist.templateName,
          event: LifecycleEvent.AfterVectorComplete,
          craftCallsign: callsign,
          attempt: 1,
          items: checklist.items,
        });
        appendBlackBoxEntry(
          app,
          name,
          craft,
          "system",
          BlackBoxEntryType.ChecklistRun,
          `Post-vector checklist "${checklist.templateName}" for "${vectorName}" ${checkResult.passed ? "passed" : "failed"}`,
        );
      }

      return reply.send(craft.flightPlan);
    },
  );
}
