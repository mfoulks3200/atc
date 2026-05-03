/**
 * Black box (event log) routes for the ATC daemon.
 *
 * Provides read-only endpoints for a craft's append-only event log.
 *
 * @see RULE-BBOX-1 through RULE-BBOX-4 for black box rules.
 */

import type { FastifyInstance } from "fastify";
import type { BlackBoxEntry } from "../../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Verification state for a single black box entry. Phase 1: all entries are unsigned. */
export type VerificationState = "signed-valid" | "signed-invalid" | "unsigned" | "author-not-found";

/** A black box entry annotated with its cryptographic verification state. */
export interface VerifiedBlackBoxEntry extends BlackBoxEntry {
  /** @see RULE-BBOX-8 */
  verificationState: VerificationState;
}

/**
 * Response from GET /api/v1/projects/:name/crafts/:callsign/blackbox/verify.
 *
 * Invariant: total === verified + unsigned + tampered + unresolvable.
 *
 * @see RULE-BBOX-8
 */
export interface BlackBoxVerifyResponse {
  total: number;
  verified: number;
  unsigned: number;
  tampered: number;
  unresolvable: number;
  entries: VerifiedBlackBoxEntry[];
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers black box routes as a Fastify plugin.
 *
 * Routes:
 * - `GET /api/v1/projects/:name/crafts/:callsign/blackbox` — raw event log
 * - `GET /api/v1/projects/:name/crafts/:callsign/blackbox/verify` — verified log with integrity aggregates
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-BBOX-1
 * @see RULE-BBOX-8
 */
export async function blackboxRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts/:callsign/blackbox
  // -------------------------------------------------------------------------

  app.get<{ Params: { name: string; callsign: string } }>(
    "/api/v1/projects/:name/crafts/:callsign/blackbox",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      return reply.send(craft.blackBox);
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts/:callsign/blackbox/verify
  // -------------------------------------------------------------------------

  /**
   * Returns the black box with per-entry verification states and aggregate counts.
   *
   * Phase 1 behaviour: no signing is implemented, so all entries are returned
   * with verificationState "unsigned". Aggregates: verified=0, tampered=0,
   * unresolvable=0, unsigned=total.
   *
   * @see RULE-BBOX-8
   */
  app.get<{ Params: { name: string; callsign: string } }>(
    "/api/v1/projects/:name/crafts/:callsign/blackbox/verify",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      const entries: VerifiedBlackBoxEntry[] = craft.blackBox.map((entry) => ({
        ...entry,
        verificationState: "unsigned" as VerificationState,
      }));

      const response: BlackBoxVerifyResponse = {
        total: entries.length,
        verified: 0,
        unsigned: entries.length,
        tampered: 0,
        unresolvable: 0,
        entries,
      };

      return reply.send(response);
    },
  );
}
