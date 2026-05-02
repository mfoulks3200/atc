/**
 * Black box (event log) routes for the ATC daemon.
 *
 * Provides endpoints for a craft's append-only event log:
 * - Read (plain JSON)
 * - NDJSON export with pagination (RULE-BBOX-6)
 * - Signature verification (RULE-BBOX-8)
 *
 * @see RULE-BBOX-1 through RULE-BBOX-4 for black box rules.
 * @see RULE-BBOX-6 for NDJSON export.
 * @see RULE-BBOX-8 for verification endpoint.
 */

import type { FastifyInstance } from "fastify";
import { verifyBlackBoxEntry } from "../../signing/sign.js";
import type { BlackBoxEntry } from "../../types.js";

// ---------------------------------------------------------------------------
// Verification helpers
// ---------------------------------------------------------------------------

type VerificationState = "signed-valid" | "signed-invalid" | "unsigned" | "author-not-found";

interface EntryVerificationResult {
  index: number;
  timestamp: string;
  author: string;
  type: string;
  state: VerificationState;
}

interface VerifyResponse {
  total: number;
  verified: number;
  unsigned: number;
  tampered: number;
  unresolvable: number;
  entries: EntryVerificationResult[];
}

/**
 * Resolves the public key that was active for a pilot at a given timestamp.
 *
 * Checks `pilot.keyHistory` to find the key record whose `validFrom`/`validUntil`
 * range covers the entry's timestamp. Falls back to the current `pilot.publicKey`
 * if no history entry matches but the pilot has a current key.
 *
 * @see RULE-BBOX-8
 */
function resolvePublicKeyAtTime(
  pilot: {
    publicKey: string | null;
    keyHistory: { publicKey: string; validFrom: string; validUntil: string | null }[];
  },
  entryTimestamp: string,
): string | null {
  const entryTime = new Date(entryTimestamp).getTime();

  for (const entry of pilot.keyHistory) {
    const from = new Date(entry.validFrom).getTime();
    const until = entry.validUntil === null ? Infinity : new Date(entry.validUntil).getTime();
    if (entryTime >= from && entryTime < until) {
      return entry.publicKey;
    }
  }

  // No key history match — the entry may have been written before key registration.
  // Return null (will be classified as unsigned).
  return null;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers black box routes as a Fastify plugin.
 *
 * Routes:
 * - `GET /api/v1/projects/:name/crafts/:callsign/blackbox`        — read event log
 * - `GET /api/v1/projects/:name/crafts/:callsign/blackbox/export` — NDJSON export
 * - `GET /api/v1/projects/:name/crafts/:callsign/blackbox/verify` — signature verification
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-BBOX-1
 * @see RULE-BBOX-6
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
  // GET /api/v1/projects/:name/crafts/:callsign/blackbox/export
  // NDJSON export: each line is a self-contained JSON object with all fields.
  // Supports ?limit=N&offset=N pagination.
  // @see RULE-BBOX-6
  // -------------------------------------------------------------------------

  app.get<{
    Params: { name: string; callsign: string };
    Querystring: { limit?: string; offset?: string };
  }>("/api/v1/projects/:name/crafts/:callsign/blackbox/export", async (request, reply) => {
    const { name, callsign } = request.params;
    const craft = app.craftStore.get(name, callsign);

    if (!craft) {
      return reply.code(404).send({ error: `Craft not found: ${callsign}` });
    }

    const offset = Math.max(0, parseInt(request.query.offset ?? "0", 10) || 0);
    const limit =
      request.query.limit !== undefined
        ? Math.max(1, parseInt(request.query.limit, 10) || 100)
        : craft.blackBox.length;

    const page = craft.blackBox.slice(offset, offset + limit);

    const ndjson = page.map((entry: BlackBoxEntry) => JSON.stringify(entry)).join("\n");

    return reply.code(200).header("Content-Type", "application/x-ndjson").send(ndjson);
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts/:callsign/blackbox/verify
  // Checks the signature of every entry in the craft's black box.
  // @see RULE-BBOX-8
  // -------------------------------------------------------------------------

  app.get<{ Params: { name: string; callsign: string } }>(
    "/api/v1/projects/:name/crafts/:callsign/blackbox/verify",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      let verified = 0;
      let unsigned = 0;
      let tampered = 0;
      let unresolvable = 0;

      const entries: EntryVerificationResult[] = craft.blackBox.map((entry, index) => {
        let state: VerificationState;

        if (entry.signature === null || entry.signature === undefined) {
          state = "unsigned";
          unsigned++;
        } else {
          const pilot = app.pilotStore.get(name, entry.author);
          if (!pilot) {
            state = "author-not-found";
            unresolvable++;
          } else {
            const publicKey = resolvePublicKeyAtTime(pilot, entry.timestamp);
            if (publicKey === null) {
              // Pilot has a key now, but this entry was written before key registration.
              state = "unsigned";
              unsigned++;
            } else {
              const valid = verifyBlackBoxEntry(publicKey, entry, entry.signature);
              if (valid) {
                state = "signed-valid";
                verified++;
              } else {
                state = "signed-invalid";
                tampered++;
              }
            }
          }
        }

        return {
          index,
          timestamp: entry.timestamp,
          author: entry.author,
          type: String(entry.type),
          state,
        };
      });

      const response: VerifyResponse = {
        total: craft.blackBox.length,
        verified,
        unsigned,
        tampered,
        unresolvable,
        entries,
      };

      return reply.send(response);
    },
  );
}
