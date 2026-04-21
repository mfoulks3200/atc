/**
 * Controls (code-modification authority) routes for the ATC daemon.
 *
 * A craft has exactly one `ControlState` at any time — either an exclusive
 * holder or a set of non-overlapping shared areas. These routes let clients
 * read the current state and transition between modes, recording every
 * transfer in the craft black box (RULE-CTRL-7).
 *
 * @see RULE-CTRL-1 — captain holds exclusive controls at creation.
 * @see RULE-CTRL-2 — only captains and first officers may hold controls.
 * @see RULE-CTRL-6 — captain has final authority on disputes.
 * @see RULE-CTRL-7 — every transfer / mode change is recorded in the black box.
 */

import type { FastifyInstance } from "fastify";
import { BlackBoxEntryType, ControlMode, SeatType } from "@airtrafficcontrol/types";
import type { ControlState as CoreControlState } from "@airtrafficcontrol/types";
import {
  claimExclusiveControls as coreClaim,
  shareControls as coreShare,
} from "@airtrafficcontrol/core";
import { ControlsError } from "@airtrafficcontrol/errors";
import { appendBlackBoxEntry } from "./blackbox-helpers.js";
import { publishCraftEvent } from "./broadcast.js";
import type { ControlState } from "../../types.js";

/**
 * Convert the daemon-persisted `ControlState` (uses `pilotId` / string union
 * modes) into the core-library shape (uses `pilotIdentifier` / ControlMode
 * enum) so we can reuse the validated core helpers.
 */
function toCoreControlState(controls: ControlState): CoreControlState {
  return {
    mode: controls.mode === "exclusive" ? ControlMode.Exclusive : ControlMode.Shared,
    holder: controls.holder,
    sharedAreas: controls.sharedAreas?.map((a) => ({
      pilotIdentifier: a.pilotId,
      area: a.area,
    })),
  };
}

/**
 * Convert a core `ControlState` back into the daemon's persisted shape.
 */
function fromCoreControlState(controls: CoreControlState): ControlState {
  return {
    mode: controls.mode === ControlMode.Exclusive ? "exclusive" : "shared",
    holder: controls.holder,
    sharedAreas: controls.sharedAreas?.map((a) => ({
      pilotId: a.pilotIdentifier,
      area: a.area,
    })),
  };
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface ControlsParams {
  name: string;
  callsign: string;
}

interface ClaimExclusiveBody {
  /** Pilot identifier that wants to hold exclusive controls. */
  pilotId: string;
}

interface ShareControlsBody {
  /**
   * Non-overlapping area assignments. Each area is a path prefix (e.g.
   * `src/api`) that only the named pilot may modify.
   */
  areas: Array<{ pilotId: string; area: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up a pilot's seat type on a given craft. Returns `undefined` if the
 * pilot is not on the craft's manifest.
 */
function seatOf(
  craft: { captain: string; firstOfficers: string[]; jumpseaters: string[] },
  pilotId: string,
): SeatType | undefined {
  if (craft.captain === pilotId) return SeatType.Captain;
  if (craft.firstOfficers.includes(pilotId)) return SeatType.FirstOfficer;
  if (craft.jumpseaters.includes(pilotId)) return SeatType.Jumpseat;
  return undefined;
}

/**
 * Build a runtime `SeatType` map for every pilot on the craft so the core
 * `shareControls()` helper can validate seat assignments (RULE-CTRL-2).
 */
function crewSeatMap(craft: {
  captain: string;
  firstOfficers: string[];
  jumpseaters: string[];
}): Map<string, SeatType> {
  const map = new Map<string, SeatType>();
  map.set(craft.captain, SeatType.Captain);
  for (const fo of craft.firstOfficers) map.set(fo, SeatType.FirstOfficer);
  for (const js of craft.jumpseaters) map.set(js, SeatType.Jumpseat);
  return map;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers controls routes as a Fastify plugin.
 *
 * Routes:
 * - `GET  /api/v1/projects/:name/crafts/:callsign/controls`       — read current state
 * - `POST /api/v1/projects/:name/crafts/:callsign/controls/claim` — claim exclusive
 * - `POST /api/v1/projects/:name/crafts/:callsign/controls/share` — establish shared
 *
 * @see RULE-CTRL-1 through RULE-CTRL-7
 */
export async function controlsRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /controls — read current state
  // -------------------------------------------------------------------------

  app.get<{ Params: ControlsParams }>(
    "/api/v1/projects/:name/crafts/:callsign/controls",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const craft = app.craftStore.get(name, callsign);
      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }
      return reply.send(craft.controls);
    },
  );

  // -------------------------------------------------------------------------
  // POST /controls/claim — exclusive controls
  // -------------------------------------------------------------------------

  app.post<{ Params: ControlsParams; Body: ClaimExclusiveBody }>(
    "/api/v1/projects/:name/crafts/:callsign/controls/claim",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const { pilotId } = request.body;
      const craft = app.craftStore.get(name, callsign);
      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      const seat = seatOf(craft, pilotId);
      if (seat === undefined) {
        return reply.code(400).send({ error: `Pilot ${pilotId} is not on craft ${callsign}` });
      }

      // RULE-CTRL-2: jumpseaters must not hold controls.
      try {
        const nextControls = coreClaim(toCoreControlState(craft.controls), pilotId, seat);

        const previousSummary = summarizeControls(craft.controls);
        craft.controls = fromCoreControlState(nextControls);

        // RULE-CTRL-7: record the transfer in the black box.
        appendBlackBoxEntry(
          app,
          name,
          craft,
          pilotId,
          BlackBoxEntryType.Observation,
          `Controls transferred to exclusive holder ${pilotId} (was ${previousSummary})`,
        );
        app.craftStore.set(name, craft);
        publishCraftEvent(app, name, craft, "craft.controls.changed", {
          controls: craft.controls,
        });
        return reply.send(craft.controls);
      } catch (err) {
        if (err instanceof ControlsError) {
          return reply.code(403).send({ error: err.message, ruleId: err.ruleId });
        }
        throw err;
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /controls/share — shared controls with non-overlapping areas
  // -------------------------------------------------------------------------

  app.post<{ Params: ControlsParams; Body: ShareControlsBody }>(
    "/api/v1/projects/:name/crafts/:callsign/controls/share",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const { areas } = request.body;
      const craft = app.craftStore.get(name, callsign);
      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      // Every pilot referenced in the shared areas must be on this craft.
      const seatMap = crewSeatMap(craft);
      for (const { pilotId } of areas) {
        if (!seatMap.has(pilotId)) {
          return reply.code(400).send({
            error: `Pilot ${pilotId} is not on craft ${callsign}`,
          });
        }
      }

      try {
        const core = coreShare(
          areas.map((a) => ({ pilotIdentifier: a.pilotId, area: a.area })),
          seatMap,
        );
        const previousSummary = summarizeControls(craft.controls);
        craft.controls = fromCoreControlState(core);

        const areaSummary = areas.map((a) => `${a.pilotId}:${a.area}`).join(", ");
        appendBlackBoxEntry(
          app,
          name,
          craft,
          areas[0]?.pilotId ?? "system",
          BlackBoxEntryType.Observation,
          `Controls switched to shared mode [${areaSummary}] (was ${previousSummary})`,
        );
        app.craftStore.set(name, craft);
        publishCraftEvent(app, name, craft, "craft.controls.changed", {
          controls: craft.controls,
        });
        return reply.send(craft.controls);
      } catch (err) {
        if (err instanceof ControlsError) {
          return reply.code(403).send({ error: err.message, ruleId: err.ruleId });
        }
        throw err;
      }
    },
  );
}

/**
 * Build a short human-readable summary of a `ControlState` for black box
 * entries.
 */
function summarizeControls(controls: ControlState): string {
  if (controls.mode === "exclusive") {
    return `exclusive holder=${controls.holder ?? "none"}`;
  }
  const areas = (controls.sharedAreas ?? []).map((a) => `${a.pilotId}:${a.area}`).join(", ");
  return `shared [${areas}]`;
}
