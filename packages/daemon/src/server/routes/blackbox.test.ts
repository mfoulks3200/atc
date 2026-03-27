import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { CraftStatus, BlackBoxEntryType } from "@atc/types";
import type { CraftState } from "../../types.js";

describe("blackbox routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  const PROJECT = "test-project";

  function seedCraft(): void {
    const craft: CraftState = {
      callsign: "echo-1",
      branch: "feat/echo",
      cargo: "Build echo",
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [],
      blackBox: [
        {
          timestamp: new Date().toISOString(),
          author: "pilot-1",
          type: BlackBoxEntryType.Decision,
          content: "Chose approach A over B",
        },
      ],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
    };
    craftStore.set(PROJECT, craft);
  }

  beforeEach(() => {
    craftStore = new CraftStore("/tmp/atc-bb-test");
    app = createApp({
      craftStore,
      agentStore: new AgentStore("/tmp/atc-bb-test"),
      towerStore: new TowerStore("/tmp/atc-bb-test"),
    });
    seedCraft();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe("GET /api/v1/projects/:name/crafts/:callsign/blackbox", () => {
    it("returns the black box entries", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox`,
      });
      expect(res.statusCode).toBe(200);
      const entries = res.json<Array<{ type: string; content: string }>>();
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("Decision");
      expect(entries[0].content).toBe("Chose approach A over B");
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/blackbox`,
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
