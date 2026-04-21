/**
 * Temporary Flight Restriction (TFR) routes for the ATC daemon.
 *
 * Provides endpoints for issuing, listing, and lifting TFRs.
 * When a TFR is issued, affected crafts have their `holdingPattern` flag
 * set and a `TFRIssued` black box entry recorded. When lifted, the flag
 * is cleared and a `TFRLifted` entry recorded.
 *
 * Routes:
 * - `POST /api/v1/tfrs`          — issue a new TFR
 * - `GET  /api/v1/tfrs`          — list TFRs (optional ?active=true filter)
 * - `POST /api/v1/tfrs/:id/lift` — lift a TFR
 *
 * @see RULE-TFR-1 through RULE-TFR-8
 * @see RULE-TFRP-1 through RULE-TFRP-7
 */

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { BlackBoxEntryType } from "@airtrafficcontrol/types";
import type { TfrState, BlackBoxEntry } from "../../types.js";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface IssueTfrBody {
  scope: "global" | "project" | "craft";
  target: string | null;
  mode: "graceful" | "immediate";
  reason: string;
  issuedBy: "user" | "tower";
  /** Required when scope is "project" or "craft" to identify affected crafts. */
  projectName?: string;
}

interface LiftTfrParams {
  id: string;
}

interface LiftTfrQuery {
  projectName?: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers TFR routes as a Fastify plugin.
 *
 * @param app - The Fastify instance to register routes on.
 * @see RULE-TFR-1 through RULE-TFR-8
 */
export async function tfrRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /api/v1/tfrs — Issue a new TFR
  // -------------------------------------------------------------------------

  app.post<{ Body: IssueTfrBody }>("/api/v1/tfrs", async (request, reply) => {
    const { scope, target, mode, reason, issuedBy, projectName } = request.body;

    // RULE-TFR-4: Tower must not issue global TFRs
    if (issuedBy === "tower" && scope === "global") {
      return reply.code(403).send({ error: "Tower must not issue global TFRs (RULE-TFR-4)" });
    }

    // RULE-TFR-2: Validate scope/target combinations
    if (scope === "global" && target !== null) {
      return reply.code(400).send({ error: "Global TFR must have a null target (RULE-TFR-2)" });
    }
    if (scope === "project" && !target) {
      return reply
        .code(400)
        .send({ error: "Project-scoped TFR must specify a target (RULE-TFR-2)" });
    }
    if (scope === "craft" && !target) {
      return reply.code(400).send({ error: "Craft-scoped TFR must specify a target (RULE-TFR-2)" });
    }

    const tfr: TfrState = {
      identifier: randomUUID(),
      scope,
      target,
      mode,
      reason,
      issuedBy,
      issuedAt: new Date().toISOString(),
      liftedAt: null,
    };

    app.tfrStore.set(tfr);

    // RULE-TFR-5: Set holdingPattern on affected crafts and pause agents
    // RULE-TFRP-5: Record TFRIssued in black box
    await applyTfrToCrafts(app, tfr, projectName);

    // Publish to the tfr:global channel so clients can react in real time
    if (tfr.scope === "global") {
      app.channelRegistry.publish("tfr:global", {
        type: "event",
        channel: "tfr:global",
        event: "tfr.issued",
        timestamp: new Date().toISOString(),
        data: { tfr },
      });
    }

    return reply.code(201).send(tfr);
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/tfrs — List TFRs
  // -------------------------------------------------------------------------

  app.get<{ Querystring: { active?: string } }>("/api/v1/tfrs", async (request, reply) => {
    const active = request.query.active === "true";
    const tfrs = active ? app.tfrStore.listActive() : app.tfrStore.list();
    return reply.send(tfrs);
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/tfrs/:id/lift — Lift a TFR
  // -------------------------------------------------------------------------

  app.post<{ Params: LiftTfrParams; Querystring: LiftTfrQuery }>(
    "/api/v1/tfrs/:id/lift",
    async (request, reply) => {
      const { id } = request.params;
      const { projectName } = request.query;
      const tfr = app.tfrStore.get(id);

      if (!tfr) {
        return reply.code(404).send({ error: `TFR not found: ${id}` });
      }

      if (tfr.liftedAt !== null) {
        return reply.code(409).send({ error: `TFR "${id}" is already lifted` });
      }

      // RULE-TFRP-3: Lift the TFR
      const lifted: TfrState = {
        ...tfr,
        liftedAt: new Date().toISOString(),
      };
      app.tfrStore.set(lifted);

      // RULE-TFR-8: Clear holdingPattern; resume agents no longer under any TFR
      // RULE-TFRP-4 / RULE-TFRP-5
      await clearTfrFromCrafts(app, lifted, projectName);

      // Publish to the tfr:global channel so clients can react in real time
      if (lifted.scope === "global") {
        app.channelRegistry.publish("tfr:global", {
          type: "event",
          channel: "tfr:global",
          event: "tfr.lifted",
          timestamp: new Date().toISOString(),
          data: { tfr: lifted },
        });
      }

      return reply.send(lifted);
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns all { projectName, craft } pairs affected by the given TFR.
 *
 * For global scope this spans every project. For project/craft scope it
 * restricts to the supplied projectName (required by callers in those cases).
 */
function affectedCrafts(
  app: FastifyInstance,
  tfr: TfrState,
  projectName?: string,
): Array<{ projectName: string; craft: import("../../types.js").CraftState }> {
  if (tfr.scope === "global") {
    return app.craftStore.listAll();
  }
  if (!projectName) return [];
  return app.craftStore.listForProject(projectName).map((craft) => ({ projectName, craft }));
}

/**
 * Sets holdingPattern and records TFRIssued on all crafts affected by the TFR.
 * Also pauses any running agents on those crafts (RULE-TFR-5 / RULE-TFRP-1).
 */
async function applyTfrToCrafts(
  app: FastifyInstance,
  tfr: TfrState,
  projectName?: string,
): Promise<void> {
  const pairs = affectedCrafts(app, tfr, projectName);
  for (const { projectName: proj, craft } of pairs) {
    if (!isAffectedByTfrState(tfr, proj, craft.callsign)) continue;

    craft.holdingPattern = true;

    // RULE-TFRP-5: Record TFRIssued in black box
    const entry: BlackBoxEntry = {
      timestamp: new Date().toISOString(),
      author: "system",
      type: BlackBoxEntryType.TFRIssued,
      content: `TFR ${tfr.identifier} issued: ${tfr.reason} (scope=${tfr.scope}, mode=${tfr.mode})`,
    };
    craft.blackBox.push(entry);
    app.craftStore.set(proj, craft);

    // RULE-TFR-5 / RULE-TFRP-1: Pause any running agents on this craft.
    if (app.agentManager !== null) {
      const runningAgents = app.agentManager
        .listAgents()
        .filter((r) => r.callsign === craft.callsign && r.status === "running");
      for (const record of runningAgents) {
        await app.agentManager.pauseAgent(record.id);
      }
    }
  }
}

/**
 * Clears holdingPattern and records TFRLifted on affected crafts,
 * unless another active TFR still applies. Resumes any paused agents
 * on crafts that are now fully clear (RULE-TFRP-4).
 */
async function clearTfrFromCrafts(
  app: FastifyInstance,
  tfr: TfrState,
  projectName?: string,
): Promise<void> {
  // Build a "was-active" snapshot to check which crafts were affected before lifting.
  const asActive: TfrState = { ...tfr, liftedAt: null };

  const pairs = affectedCrafts(app, asActive, projectName);
  for (const { projectName: proj, craft } of pairs) {
    if (!isAffectedByTfrState(asActive, proj, craft.callsign)) continue;

    // RULE-TFRP-5: Record TFRLifted in black box
    const entry: BlackBoxEntry = {
      timestamp: new Date().toISOString(),
      author: "system",
      type: BlackBoxEntryType.TFRLifted,
      content: `TFR ${tfr.identifier} lifted`,
    };
    craft.blackBox.push(entry);

    // RULE-TFR-8: Only clear holdingPattern if no other active TFR applies
    const remaining = app.tfrStore.findAffecting(proj, craft.callsign);
    const nowClear = remaining.length === 0;
    if (nowClear) {
      craft.holdingPattern = false;
    }
    app.craftStore.set(proj, craft);

    // RULE-TFRP-4: Resume paused agents once no TFR covers this craft.
    if (nowClear && app.agentManager !== null) {
      const pausedAgents = app.agentManager
        .listAgents()
        .filter((r) => r.callsign === craft.callsign && r.status === "paused");
      for (const record of pausedAgents) {
        await app.agentManager.resumeAgent(record.id, {
          craft,
          intercomHistory: craft.intercom,
          lastKnownState: "",
        });
      }
    }
  }
}

/**
 * Checks if a TfrState (daemon representation) affects a given project/callsign.
 */
function isAffectedByTfrState(tfr: TfrState, projectName: string, callsign: string): boolean {
  if (tfr.liftedAt !== null) return false;
  switch (tfr.scope) {
    case "global":
      return true;
    case "project":
      return tfr.target === projectName;
    case "craft":
      return tfr.target === callsign;
    default:
      return false;
  }
}
