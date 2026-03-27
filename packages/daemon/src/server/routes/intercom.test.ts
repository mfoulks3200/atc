import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { CraftStatus } from "@atc/types";
import type { CraftState, IntercomMessage } from "../../types.js";

describe("intercom routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  const PROJECT = "test-project";

  function seedCraft(): void {
    const craft: CraftState = {
      callsign: "delta-1",
      branch: "feat/delta",
      cargo: "Build delta",
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
    };
    craftStore.set(PROJECT, craft);
  }

  beforeEach(() => {
    craftStore = new CraftStore("/tmp/atc-intercom-test");
    app = createApp({
      craftStore,
      agentStore: new AgentStore("/tmp/atc-intercom-test"),
      towerStore: new TowerStore("/tmp/atc-intercom-test"),
    });
    seedCraft();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe("GET intercom", () => {
    it("returns empty array initially", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/delta-1/intercom`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/intercom`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST intercom", () => {
    it("appends a message and returns it", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/delta-1/intercom`,
        payload: { from: "pilot-1", seat: "captain", content: "Starting approach" },
      });
      expect(res.statusCode).toBe(200);
      const msg = res.json<IntercomMessage>();
      expect(msg.from).toBe("pilot-1");
      expect(msg.content).toBe("Starting approach");
      expect(msg.timestamp).toBeDefined();
    });

    it("persists messages in craft state", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/delta-1/intercom`,
        payload: { from: "pilot-1", seat: "captain", content: "msg 1" },
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/delta-1/intercom`,
        payload: { from: "pilot-2", seat: "firstOfficer", content: "msg 2" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/delta-1/intercom`,
      });
      expect(res.json()).toHaveLength(2);
    });
  });
});
