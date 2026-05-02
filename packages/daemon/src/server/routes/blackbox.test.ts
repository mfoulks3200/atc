import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { CraftStatus, BlackBoxEntryType } from "@airtrafficcontrol/types";
import type { CraftState } from "../../types.js";

describe("blackbox routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  const PROJECT = "test-project";

  function seedCraftBase(): CraftState {
    return {
      callsign: "echo-1",
      createdAt: "2026-04-11T00:00:00.000Z",
      branch: "feat/echo",
      cargo: "Build echo",
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
      holdingPattern: false,
    };
  }

  function seedCraft(): void {
    craftStore.set(PROJECT, {
      ...seedCraftBase(),
      blackBox: [
        {
          timestamp: new Date().toISOString(),
          author: "pilot-1",
          type: BlackBoxEntryType.Decision,
          content: "Chose approach A over B",
        },
      ],
    });
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

  describe("GET /api/v1/projects/:name/crafts/:callsign/blackbox/verify", () => {
    it("returns aggregate counts and per-entry verificationState", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox/verify`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        total: number;
        verified: number;
        unsigned: number;
        tampered: number;
        unresolvable: number;
        entries: Array<{ type: string; content: string; verificationState: string }>;
      }>();
      expect(body.total).toBe(1);
      expect(body.verified).toBe(0);
      expect(body.unsigned).toBe(1);
      expect(body.tampered).toBe(0);
      expect(body.unresolvable).toBe(0);
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].verificationState).toBe("unsigned");
      expect(body.entries[0].type).toBe("Decision");
      expect(body.entries[0].content).toBe("Chose approach A over B");
    });

    it("satisfies the invariant total === verified + unsigned + tampered + unresolvable", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox/verify`,
      });
      const body = res.json<{
        total: number;
        verified: number;
        unsigned: number;
        tampered: number;
        unresolvable: number;
      }>();
      expect(body.total).toBe(body.verified + body.unsigned + body.tampered + body.unresolvable);
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/blackbox/verify`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns empty aggregates for craft with no entries", async () => {
      craftStore.set(PROJECT, { ...seedCraftBase(), callsign: "echo-empty", blackBox: [] });
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-empty/blackbox/verify`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ total: number; entries: unknown[] }>();
      expect(body.total).toBe(0);
      expect(body.entries).toHaveLength(0);
    });
  });
});
