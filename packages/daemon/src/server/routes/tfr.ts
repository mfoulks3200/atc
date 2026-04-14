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

    // RULE-TFR-5: Set holdingPattern on affected crafts
    // RULE-TFRP-5: Record TFRIssued in black box
    applyTfrToCrafts(app, tfr, projectName);

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

      // RULE-TFR-8: Clear holdingPattern on crafts not subject to another active TFR
      // RULE-TFRP-5: Record TFRLifted in black box
      clearTfrFromCrafts(app, lifted, projectName);

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
 * Sets holdingPattern and records TFRIssued on all crafts affected by the TFR.
 */
function applyTfrToCrafts(app: FastifyInstance, tfr: TfrState, projectName?: string): void {
  if (!projectName) return;

  const crafts = app.craftStore.listForProject(projectName);
  for (const craft of crafts) {
    if (isAffectedByTfrState(tfr, projectName, craft.callsign)) {
      craft.holdingPattern = true;

      // RULE-TFRP-5: Record TFRIssued in black box
      const entry: BlackBoxEntry = {
        timestamp: new Date().toISOString(),
        author: "system",
        type: BlackBoxEntryType.TFRIssued,
        content: `TFR ${tfr.identifier} issued: ${tfr.reason} (scope=${tfr.scope}, mode=${tfr.mode})`,
      };
      craft.blackBox.push(entry);
      app.craftStore.set(projectName, craft);
    }
  }
}

/**
 * Clears holdingPattern and records TFRLifted on affected crafts,
 * unless another active TFR still applies.
 */
function clearTfrFromCrafts(app: FastifyInstance, tfr: TfrState, projectName?: string): void {
  if (!projectName) return;

  // Build a "was-active" snapshot to check which crafts were affected before lifting.
  const asActive: TfrState = { ...tfr, liftedAt: null };

  const crafts = app.craftStore.listForProject(projectName);
  for (const craft of crafts) {
    if (isAffectedByTfrState(asActive, projectName, craft.callsign)) {
      // RULE-TFRP-5: Record TFRLifted in black box
      const entry: BlackBoxEntry = {
        timestamp: new Date().toISOString(),
        author: "system",
        type: BlackBoxEntryType.TFRLifted,
        content: `TFR ${tfr.identifier} lifted`,
      };
      craft.blackBox.push(entry);

      // RULE-TFR-8: Only clear holdingPattern if no other active TFR applies
      const remaining = app.tfrStore.findAffecting(projectName, craft.callsign);
      if (remaining.length === 0) {
        craft.holdingPattern = false;
      }
      app.craftStore.set(projectName, craft);
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
