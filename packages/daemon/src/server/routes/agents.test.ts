import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { AgentStore } from "../../state/agent-store.js";
import { CraftStore } from "../../state/craft-store.js";
import { TowerStore } from "../../state/tower-store.js";
import type { AgentRecord } from "../../types.js";

describe("agent routes", () => {
  let app: FastifyInstance;
  let agentStore: AgentStore;

  const agentBody = {
    id: "agent-1",
    adapterType: "mock",
    projectName: "proj",
    callsign: "alpha-1",
  };

  beforeEach(() => {
    agentStore = new AgentStore("/tmp/atc-agent-test");
    app = createApp({
      agentStore,
      craftStore: new CraftStore("/tmp/atc-agent-test"),
      towerStore: new TowerStore("/tmp/atc-agent-test"),
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe("POST /api/v1/agents", () => {
    it("creates an agent and returns 201", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/agents", payload: agentBody });
      expect(res.statusCode).toBe(201);
      const body = res.json<AgentRecord>();
      expect(body.id).toBe("agent-1");
      expect(body.status).toBe("running");
    });
  });

  describe("GET /api/v1/agents", () => {
    it("lists all agents", async () => {
      await app.inject({ method: "POST", url: "/api/v1/agents", payload: agentBody });
      const res = await app.inject({ method: "GET", url: "/api/v1/agents" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
    });
  });

  describe("GET /api/v1/agents/:id", () => {
    it("returns 404 for unknown agent", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/agents/ghost" });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/agents/:id/pause", () => {
    it("pauses a running agent", async () => {
      await app.inject({ method: "POST", url: "/api/v1/agents", payload: agentBody });
      const res = await app.inject({ method: "POST", url: "/api/v1/agents/agent-1/pause" });
      expect(res.statusCode).toBe(200);
      expect(res.json<AgentRecord>().status).toBe("paused");
    });
  });

  describe("POST /api/v1/agents/:id/resume", () => {
    it("resumes a paused agent", async () => {
      await app.inject({ method: "POST", url: "/api/v1/agents", payload: agentBody });
      await app.inject({ method: "POST", url: "/api/v1/agents/agent-1/pause" });
      const res = await app.inject({ method: "POST", url: "/api/v1/agents/agent-1/resume" });
      expect(res.statusCode).toBe(200);
      expect(res.json<AgentRecord>().status).toBe("running");
    });
  });

  describe("POST /api/v1/agents/recover", () => {
    it("recovers all suspended agents", async () => {
      // Seed a suspended agent directly
      agentStore.set({
        id: "sus-1",
        adapterType: "mock",
        projectName: "proj",
        callsign: "x",
        status: "suspended",
        adapterMeta: {},
      });
      agentStore.set({
        id: "ok-1",
        adapterType: "mock",
        projectName: "proj",
        callsign: "y",
        status: "running",
        adapterMeta: {},
      });

      const res = await app.inject({ method: "POST", url: "/api/v1/agents/recover" });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ recovered: number }>().recovered).toBe(1);
      expect(agentStore.get("sus-1")!.status).toBe("running");
      expect(agentStore.get("ok-1")!.status).toBe("running");
    });
  });

  describe("DELETE /api/v1/agents/:id", () => {
    it("terminates and removes the agent", async () => {
      await app.inject({ method: "POST", url: "/api/v1/agents", payload: agentBody });
      const res = await app.inject({ method: "DELETE", url: "/api/v1/agents/agent-1" });
      expect(res.statusCode).toBe(204);
      expect(agentStore.get("agent-1")).toBeUndefined();
    });
  });

  describe("GET /api/v1/agents/:id/usage", () => {
    it("returns empty array when no usage file exists", async () => {
      await app.inject({ method: "POST", url: "/api/v1/agents", payload: agentBody });
      const res = await app.inject({ method: "GET", url: "/api/v1/agents/agent-1/usage" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });
});
