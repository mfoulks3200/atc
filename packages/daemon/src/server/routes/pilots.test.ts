import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { AgentStore } from "../../state/agent-store.js";
import { CraftStore } from "../../state/craft-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { PilotStore } from "../../state/pilot-store.js";
import { PilotKeystore } from "../../state/pilot-keystore.js";
import type { PilotRecord } from "../../types.js";

describe("pilot routes", () => {
  let app: FastifyInstance;
  let pilotStore: PilotStore;
  let pilotKeystore: PilotKeystore;
  const PROJECT = "test-project";

  const pilotBody = {
    identifier: "pilot-1",
    certifications: ["captain", "firstOfficer"],
  };

  beforeEach(() => {
    pilotStore = new PilotStore("/tmp/atc-pilot-test");
    pilotKeystore = new PilotKeystore("/tmp/atc-pilot-test");
    app = createApp({
      agentStore: new AgentStore("/tmp/atc-pilot-test"),
      craftStore: new CraftStore("/tmp/atc-pilot-test"),
      towerStore: new TowerStore("/tmp/atc-pilot-test"),
      pilotStore,
      pilotKeystore,
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe("POST /api/v1/projects/:name/pilots", () => {
    it("creates a pilot and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<PilotRecord>();
      expect(body.identifier).toBe("pilot-1");
      expect(body.certifications).toEqual(["captain", "firstOfficer"]);
      expect(body.publicKey).toBeNull();
      expect(body.keyHistory).toEqual([]);
    });
  });

  describe("GET /api/v1/projects/:name/pilots", () => {
    it("returns empty array initially", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/pilots`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("lists created pilots", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/pilots`,
      });
      expect(res.json()).toHaveLength(1);
    });
  });

  describe("GET /api/v1/projects/:name/pilots/:id", () => {
    it("returns 404 for unknown pilot", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/pilots/ghost`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/v1/projects/:name/pilots/:id", () => {
    it("updates pilot and preserves identifier", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1`,
        payload: { certifications: ["jumpseat"] },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<PilotRecord>();
      expect(body.identifier).toBe("pilot-1");
      expect(body.certifications).toEqual(["jumpseat"]);
    });

    it("returns 404 for unknown pilot", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${PROJECT}/pilots/ghost`,
        payload: { certifications: ["x"] },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/projects/:name/pilots/:id", () => {
    it("deletes a pilot and returns 204", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1`,
      });
      expect(res.statusCode).toBe(204);

      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1`,
      });
      expect(getRes.statusCode).toBe(404);
    });

    it("returns 404 for unknown pilot", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${PROJECT}/pilots/ghost`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/pilots/:id/keypair (RULE-PILOT-3, RULE-BBOX-9)
  // -------------------------------------------------------------------------

  describe("POST /api/v1/projects/:name/pilots/:id/keypair", () => {
    it("returns 404 for unknown pilot", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots/ghost/keypair`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("generates a key pair and returns 200 with fingerprint", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        publicKey: string;
        fingerprint: string;
        registeredAt: string;
        rotated: boolean;
      }>();
      expect(typeof body.publicKey).toBe("string");
      expect(body.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(body.rotated).toBe(false);
    });

    it("registers the public key on the pilot record", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });

      const pilot = pilotStore.get(PROJECT, "pilot-1");
      expect(pilot!.publicKey).not.toBeNull();
      expect(pilot!.keyHistory).toHaveLength(1);
      expect(pilot!.keyHistory[0].validUntil).toBeNull();
    });

    it("stores the private key in the keystore", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });

      const record = pilotKeystore.get(PROJECT, "pilot-1");
      expect(record).toBeDefined();
      expect(typeof record!.privateKey).toBe("string");
    });

    it("marks rotated:true on second keypair generation", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });
      const body = res.json<{ rotated: boolean }>();
      expect(body.rotated).toBe(true);
    });

    it("closes out the old key history entry on rotation", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });

      const pilot = pilotStore.get(PROJECT, "pilot-1");
      expect(pilot!.keyHistory).toHaveLength(2);
      expect(pilot!.keyHistory[0].validUntil).not.toBeNull();
      expect(pilot!.keyHistory[1].validUntil).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/projects/:name/pilots/:id/keypair (RULE-PILOT-3)
  // -------------------------------------------------------------------------

  describe("DELETE /api/v1/projects/:name/pilots/:id/keypair", () => {
    it("returns 404 for unknown pilot", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${PROJECT}/pilots/ghost/keypair`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 404 when pilot has no registered key pair", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("removes the key pair and returns 204", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });
      expect(res.statusCode).toBe(204);

      const pilot = pilotStore.get(PROJECT, "pilot-1");
      expect(pilot!.publicKey).toBeNull();
      expect(pilot!.keyHistory[0].validUntil).not.toBeNull();
    });

    it("removes the private key from the keystore", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots`,
        payload: pilotBody,
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });
      await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${PROJECT}/pilots/pilot-1/keypair`,
      });

      expect(pilotKeystore.get(PROJECT, "pilot-1")).toBeUndefined();
    });
  });
});
