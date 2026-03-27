import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { CraftStatus } from "@atc/types";
import type { CraftState } from "../../types.js";

describe("vector routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;

  const PROJECT = "test-project";

  function seedCraft(): void {
    const craft: CraftState = {
      callsign: "bravo-1",
      branch: "feat/bravo",
      cargo: "Build bravo",
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [
        { name: "design", acceptanceCriteria: "Design done", status: "Pending" },
        { name: "implement", acceptanceCriteria: "Code done", status: "Pending" },
        { name: "test", acceptanceCriteria: "Tests pass", status: "Pending" },
      ],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
    };
    craftStore.set(PROJECT, craft);
  }

  beforeEach(() => {
    craftStore = new CraftStore("/tmp/atc-vec-test");
    app = createApp({
      craftStore,
      agentStore: new AgentStore("/tmp/atc-vec-test"),
      towerStore: new TowerStore("/tmp/atc-vec-test"),
    });
    seedCraft();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts/:callsign/vectors
  // -------------------------------------------------------------------------

  describe("GET vectors", () => {
    it("returns the flight plan", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(3);
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/vectors`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST vector report
  // -------------------------------------------------------------------------

  describe("POST vector report", () => {
    it("marks the next pending vector as passed", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
        payload: { evidence: "Design doc reviewed and approved" },
      });
      expect(res.statusCode).toBe(200);
      const plan = res.json<Array<{ name: string; status: string }>>();
      expect(plan[0].status).toBe("Passed");
      expect(plan[1].status).toBe("Pending");
    });

    it("rejects out-of-order vector reports (RULE-VEC-2)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/implement/report`,
        payload: { evidence: "Tried to skip ahead" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("returns 404 for unknown vector name", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/nonexistent/report`,
        payload: { evidence: "nope" },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
