import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";

describe("health routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  describe("GET /api/v1/health", () => {
    it("returns 200 with status ok", async () => {
      app = createApp();
      const response = await app.inject({ method: "GET", url: "/api/v1/health" });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ status: string; version: string; uptime: number }>();
      expect(body.status).toBe("ok");
    });

    it("returns the current version", async () => {
      app = createApp();
      const response = await app.inject({ method: "GET", url: "/api/v1/health" });

      const body = response.json<{ version: string }>();
      expect(body.version).toBe("0.0.1");
    });

    it("returns a non-negative uptime in seconds", async () => {
      app = createApp();
      const response = await app.inject({ method: "GET", url: "/api/v1/health" });

      const body = response.json<{ uptime: number }>();
      expect(typeof body.uptime).toBe("number");
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("GET /api/v1/status", () => {
    it("returns 200 with profile and counts", async () => {
      app = createApp();
      const response = await app.inject({ method: "GET", url: "/api/v1/status" });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        profile: string;
        projects: number;
        crafts: number;
        agents: number;
      }>();
      expect(body.profile).toBe("default");
      expect(body.projects).toBe(0);
      expect(body.crafts).toBe(0);
      expect(body.agents).toBe(0);
    });

    it("returns numeric counts for all entity types", async () => {
      app = createApp();
      const response = await app.inject({ method: "GET", url: "/api/v1/status" });

      const body = response.json<{ projects: number; crafts: number; agents: number }>();
      expect(typeof body.projects).toBe("number");
      expect(typeof body.crafts).toBe("number");
      expect(typeof body.agents).toBe("number");
    });
  });
});
