import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { CraftStatus } from "@atc/types";
import type { CraftState } from "../../types.js";

describe("tower routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  let towerStore: TowerStore;

  const PROJECT = "test-project";

  function seedCraft(allPassed: boolean): void {
    const craft: CraftState = {
      callsign: "charlie-1",
      branch: "feat/charlie",
      cargo: "Build charlie",
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [
        {
          name: "v1",
          acceptanceCriteria: "Done",
          status: allPassed ? "Passed" : "Pending",
          ...(allPassed ? { evidence: "done", reportedAt: new Date().toISOString() } : {}),
        },
      ],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
    };
    craftStore.set(PROJECT, craft);
  }

  beforeEach(() => {
    craftStore = new CraftStore("/tmp/atc-tower-test");
    towerStore = new TowerStore("/tmp/atc-tower-test");
    app = createApp({
      craftStore,
      towerStore,
      agentStore: new AgentStore("/tmp/atc-tower-test"),
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe("GET /api/v1/projects/:name/tower", () => {
    it("returns empty queue initially", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/tower`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });

  describe("POST /api/v1/projects/:name/tower/clearance", () => {
    it("grants clearance when all vectors passed (RULE-TOWER-2)", async () => {
      seedCraft(true);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/tower/clearance`,
        payload: { callsign: "charlie-1" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ granted: boolean }>().granted).toBe(true);

      // Verify it's in the queue
      const queue = towerStore.getQueue(PROJECT);
      expect(queue).toHaveLength(1);
      expect(queue[0].callsign).toBe("charlie-1");
    });

    it("rejects clearance when vectors are pending", async () => {
      seedCraft(false);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/tower/clearance`,
        payload: { callsign: "charlie-1" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/tower/clearance`,
        payload: { callsign: "ghost" },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
