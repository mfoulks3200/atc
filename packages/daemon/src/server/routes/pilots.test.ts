import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { AgentStore } from "../../state/agent-store.js";
import { CraftStore } from "../../state/craft-store.js";
import { TowerStore } from "../../state/tower-store.js";
import type { PilotRecord } from "../../types.js";

describe("pilot routes", () => {
  let app: FastifyInstance;
  const PROJECT = "test-project";

  const pilotBody = {
    identifier: "pilot-1",
    certifications: ["captain", "firstOfficer"],
  };

  beforeEach(() => {
    app = createApp({
      agentStore: new AgentStore("/tmp/atc-pilot-test"),
      craftStore: new CraftStore("/tmp/atc-pilot-test"),
      towerStore: new TowerStore("/tmp/atc-pilot-test"),
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
});
