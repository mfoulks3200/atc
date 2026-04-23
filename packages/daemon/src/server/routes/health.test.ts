import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import type { CraftStatus } from "@airtrafficcontrol/types";

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

    it("reflects live craft count when crafts are present", async () => {
      const craftStore = new CraftStore("/tmp/atc-health-test");
      craftStore.set("proj", {
        callsign: "alpha-1",
        createdAt: new Date().toISOString(),
        branch: "feat/alpha",
        cargo: "test",
        category: "backend",
        status: "Taxiing" as CraftStatus,
        captain: "p1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "p1" },
        holdingPattern: false,
      });
      app = createApp({ craftStore });
      const response = await app.inject({ method: "GET", url: "/api/v1/status" });

      const body = response.json<{ crafts: number }>();
      expect(body.crafts).toBe(1);
    });

    it("reflects live agent count when agents are present", async () => {
      const agentStore = new AgentStore("/tmp/atc-health-test");
      agentStore.set({
        id: "agent-1",
        adapterType: "claude-agent-sdk",
        projectName: "proj",
        callsign: "alpha-1",
        status: "running",
        adapterMeta: {},
      });
      app = createApp({ agentStore });
      const response = await app.inject({ method: "GET", url: "/api/v1/status" });

      const body = response.json<{ agents: number }>();
      expect(body.agents).toBe(1);
    });

    it("reflects live project count when projects are registered", async () => {
      // Map.size is what /status reads — any entry counts as a registered project.
      const projectConfigStores = new Map<string, unknown>();
      projectConfigStores.set("my-project", {});
      app = createApp({ projectConfigStores: projectConfigStores as never });
      const response = await app.inject({ method: "GET", url: "/api/v1/status" });

      const body = response.json<{ projects: number }>();
      expect(body.projects).toBe(1);
    });
  });

  describe("GET /api/v1/about", () => {
    it("returns version string", async () => {
      app = createApp();
      const response = await app.inject({ method: "GET", url: "/api/v1/about" });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ version: string }>();
      expect(typeof body.version).toBe("string");
      expect(body.version.length).toBeGreaterThan(0);
    });
  });
});
