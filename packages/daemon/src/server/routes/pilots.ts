/**
 * Pilot management routes for the ATC daemon.
 *
 * Provides CRUD endpoints for pilot records within a project scope.
 * Pilots are persisted via {@link PilotStore}.
 *
 * @see RULE-PILOT-1 for pilot identity rules.
 * @see RULE-PILOT-3 for optional Ed25519 key pair registration.
 * @see RULE-PILOT-3a for keystore separation requirement.
 * @see RULE-PILOT-3b for auth-authorship binding.
 * @see RULE-BBOX-9 for KeyRotated entry on key rotation.
 * @see RULE-SEAT-1 through RULE-SEAT-3 for seat assignment rules.
 */

import type { FastifyInstance } from "fastify";
import { generateEd25519KeyPair, computeKeyFingerprint } from "../../state/pilot-keystore.js";
import { appendBlackBoxEntry } from "./blackbox-helpers.js";
import { BlackBoxEntryType } from "@airtrafficcontrol/types";
import type { KeyRotatedPayload } from "../../types.js";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface PilotParams {
  name: string;
  id: string;
}

interface CreatePilotBody {
  identifier: string;
  certifications: string[];
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
}

interface PatchPilotBody {
  certifications?: string[];
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers pilot management routes as a Fastify plugin.
 *
 * Routes:
 * - `POST   /api/v1/projects/:name/pilots`             — create pilot
 * - `GET    /api/v1/projects/:name/pilots`             — list pilots
 * - `GET    /api/v1/projects/:name/pilots/:id`         — get pilot
 * - `PATCH  /api/v1/projects/:name/pilots/:id`         — update pilot
 * - `DELETE /api/v1/projects/:name/pilots/:id`         — delete pilot
 * - `POST   /api/v1/projects/:name/pilots/:id/keypair` — generate/rotate key pair
 * - `DELETE /api/v1/projects/:name/pilots/:id/keypair` — remove key pair
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-PILOT-1
 * @see RULE-PILOT-3
 * @see RULE-BBOX-9
 */
export async function pilotRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/pilots
  // -------------------------------------------------------------------------

  app.post<{ Params: { name: string }; Body: CreatePilotBody }>(
    "/api/v1/projects/:name/pilots",
    async (request, reply) => {
      const { name } = request.params;
      const { identifier, certifications, mcpServers } = request.body;

      const record = {
        identifier,
        certifications,
        mcpServers: mcpServers ?? {},
        publicKey: null,
        keyHistory: [],
      };

      app.pilotStore.set(name, record);
      return reply.code(201).send(record);
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/pilots
  // -------------------------------------------------------------------------

  app.get<{ Params: { name: string } }>("/api/v1/projects/:name/pilots", async (request, reply) => {
    const { name } = request.params;
    return reply.send(app.pilotStore.listForProject(name));
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/pilots/:id
  // -------------------------------------------------------------------------

  app.get<{ Params: PilotParams }>("/api/v1/projects/:name/pilots/:id", async (request, reply) => {
    const { name, id } = request.params;
    const pilot = app.pilotStore.get(name, id);
    if (!pilot) {
      return reply.code(404).send({ error: `Pilot not found: ${id}` });
    }
    return reply.send(pilot);
  });

  // -------------------------------------------------------------------------
  // PATCH /api/v1/projects/:name/pilots/:id
  // -------------------------------------------------------------------------

  app.patch<{ Params: PilotParams; Body: PatchPilotBody }>(
    "/api/v1/projects/:name/pilots/:id",
    async (request, reply) => {
      const { name, id } = request.params;
      const pilot = app.pilotStore.get(name, id);
      if (!pilot) {
        return reply.code(404).send({ error: `Pilot not found: ${id}` });
      }

      const updated = {
        ...pilot,
        ...request.body,
        identifier: pilot.identifier, // preserve identifier
      };

      app.pilotStore.set(name, updated);
      return reply.send(updated);
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /api/v1/projects/:name/pilots/:id
  // -------------------------------------------------------------------------

  app.delete<{ Params: PilotParams }>(
    "/api/v1/projects/:name/pilots/:id",
    async (request, reply) => {
      const { name, id } = request.params;
      const removed = app.pilotStore.remove(name, id);
      if (!removed) {
        return reply.code(404).send({ error: `Pilot not found: ${id}` });
      }
      return reply.code(204).send();
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/pilots/:id/keypair
  // Generate a fresh Ed25519 key pair (or rotate if one already exists).
  // On rotation, appends a KeyRotated entry to all crafts where the pilot
  // currently holds a seat (RULE-BBOX-9).
  // -------------------------------------------------------------------------

  app.post<{ Params: PilotParams }>(
    "/api/v1/projects/:name/pilots/:id/keypair",
    async (request, reply) => {
      const { name, id } = request.params;
      const pilot = app.pilotStore.get(name, id);
      if (!pilot) {
        return reply.code(404).send({ error: `Pilot not found: ${id}` });
      }

      const { privateKey, publicKey } = generateEd25519KeyPair();
      const rotatedAt = new Date().toISOString();

      const isRotation = pilot.publicKey !== null;
      let oldKeyFingerprint: string | null = null;

      if (isRotation) {
        oldKeyFingerprint = computeKeyFingerprint(pilot.publicKey!);
        // Close out the current key history entry
        pilot.keyHistory = pilot.keyHistory.map((entry) =>
          entry.validUntil === null ? { ...entry, validUntil: rotatedAt } : entry,
        );
      }

      const newKeyFingerprint = computeKeyFingerprint(publicKey);

      // Update the pilot record with the new public key
      const updated = {
        ...pilot,
        publicKey,
        keyHistory: [...pilot.keyHistory, { publicKey, validFrom: rotatedAt, validUntil: null }],
      };
      app.pilotStore.set(name, updated);
      app.pilotKeystore.set(name, id, privateKey, publicKey);

      // RULE-BBOX-9: append KeyRotated entry to every craft where the pilot holds a seat
      if (isRotation) {
        const payload: KeyRotatedPayload = {
          pilotIdentifier: id,
          oldKeyFingerprint: oldKeyFingerprint!,
          newKeyFingerprint,
          rotatedAt,
        };
        const content = JSON.stringify(payload);

        for (const craft of app.craftStore.listForProject(name)) {
          const isSeated =
            craft.captain === id ||
            craft.firstOfficers.includes(id) ||
            craft.jumpseaters.includes(id);

          if (isSeated) {
            appendBlackBoxEntry(app, name, craft, id, BlackBoxEntryType.KeyRotated, content);
            app.craftStore.set(name, craft);
          }
        }
      }

      return reply.code(200).send({
        publicKey,
        fingerprint: newKeyFingerprint,
        registeredAt: rotatedAt,
        rotated: isRotation,
      });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /api/v1/projects/:name/pilots/:id/keypair
  // Remove the Ed25519 key pair for a pilot. Future entries will be unsigned.
  // -------------------------------------------------------------------------

  app.delete<{ Params: PilotParams }>(
    "/api/v1/projects/:name/pilots/:id/keypair",
    async (request, reply) => {
      const { name, id } = request.params;
      const pilot = app.pilotStore.get(name, id);
      if (!pilot) {
        return reply.code(404).send({ error: `Pilot not found: ${id}` });
      }
      if (pilot.publicKey === null) {
        return reply.code(404).send({ error: `No key pair registered for pilot: ${id}` });
      }

      const removedAt = new Date().toISOString();
      const updated = {
        ...pilot,
        publicKey: null,
        keyHistory: pilot.keyHistory.map((entry) =>
          entry.validUntil === null ? { ...entry, validUntil: removedAt } : entry,
        ),
      };
      app.pilotStore.set(name, updated);
      app.pilotKeystore.remove(name, id);

      return reply.code(204).send();
    },
  );
}
