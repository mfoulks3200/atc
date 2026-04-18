import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import type { ControlState } from "../../types.js";

describe("controls routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  const PROJECT = "test-project";

  const validCraftBody = {
    callsign: "alpha-1",
    branch: "feat/alpha",
    cargo: "Implement feature alpha",
    category: "backend",
    captain: "captain-1",
    firstOfficers: ["fo-1", "fo-2"],
    jumpseaters: ["jump-1"],
    flightPlan: [{ name: "design", acceptanceCriteria: "Design doc exists" }],
  };

  beforeEach(async () => {
    craftStore = new CraftStore("/tmp/atc-controls-test");
    app = createApp({
      craftStore,
      agentStore: new AgentStore("/tmp/atc-controls-test"),
      towerStore: new TowerStore("/tmp/atc-controls-test"),
    });
    // Seed: every test gets a fresh craft where the captain holds exclusive.
    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts`,
      payload: validCraftBody,
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /controls
  // -------------------------------------------------------------------------

  describe("GET /api/v1/projects/:name/crafts/:callsign/controls", () => {
    it("returns the current control state", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls`,
      });
      expect(res.statusCode).toBe(200);
      const controls = res.json<ControlState>();
      expect(controls.mode).toBe("exclusive");
      expect(controls.holder).toBe("captain-1");
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/controls`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST /controls/claim
  // -------------------------------------------------------------------------

  describe("POST /api/v1/projects/:name/crafts/:callsign/controls/claim", () => {
    it("allows a first officer to claim exclusive controls", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls/claim`,
        payload: { pilotId: "fo-1" },
      });
      expect(res.statusCode).toBe(200);
      const controls = res.json<ControlState>();
      expect(controls.mode).toBe("exclusive");
      expect(controls.holder).toBe("fo-1");
    });

    it("allows the captain to reclaim exclusive controls (RULE-CTRL-6)", async () => {
      // First transfer to fo-1 so there's actually a transfer to observe.
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls/claim`,
        payload: { pilotId: "fo-1" },
      });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls/claim`,
        payload: { pilotId: "captain-1" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<ControlState>().holder).toBe("captain-1");
    });

    it("rejects a jumpseat pilot with 403 (RULE-CTRL-2)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls/claim`,
        payload: { pilotId: "jump-1" },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json<{ error: string; ruleId: string }>();
      expect(body.ruleId).toBe("RULE-CTRL-2");
      expect(body.error).toContain("Jumpseat");
    });

    it("rejects a pilot who is not on the craft manifest", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls/claim`,
        payload: { pilotId: "stranger" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("records a black box entry on successful transfer (RULE-CTRL-7)", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls/claim`,
        payload: { pilotId: "fo-1" },
      });
      const craft = craftStore.get(PROJECT, "alpha-1")!;
      const entry = craft.blackBox.find((e) =>
        e.content.includes("Controls transferred to exclusive holder fo-1"),
      );
      expect(entry).toBeDefined();
      expect(entry!.author).toBe("fo-1");
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/controls/claim`,
        payload: { pilotId: "captain-1" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST /controls/share
  // -------------------------------------------------------------------------

  describe("POST /api/v1/projects/:name/crafts/:callsign/controls/share", () => {
    it("establishes shared controls with non-overlapping areas", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls/share`,
        payload: {
          areas: [
            { pilotId: "captain-1", area: "src/api" },
            { pilotId: "fo-1", area: "src/web" },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const controls = res.json<ControlState>();
      expect(controls.mode).toBe("shared");
      expect(controls.sharedAreas).toEqual([
        { pilotId: "captain-1", area: "src/api" },
        { pilotId: "fo-1", area: "src/web" },
      ]);
    });

    it("rejects shared areas that include a jumpseat pilot (RULE-CTRL-2)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls/share`,
        payload: {
          areas: [
            { pilotId: "captain-1", area: "src/api" },
            { pilotId: "jump-1", area: "docs" },
          ],
        },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json<{ error: string; ruleId: string }>();
      expect(body.ruleId).toBe("RULE-CTRL-2");
    });

    it("rejects duplicate pilots in shared areas (RULE-CTRL-5)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls/share`,
        payload: {
          areas: [
            { pilotId: "fo-1", area: "src/a" },
            { pilotId: "fo-1", area: "src/b" },
          ],
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json<{ ruleId: string }>().ruleId).toBe("RULE-CTRL-5");
    });

    it("rejects a pilot who is not on the craft manifest", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls/share`,
        payload: {
          areas: [
            { pilotId: "captain-1", area: "src/a" },
            { pilotId: "stranger", area: "src/b" },
          ],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("records a black box entry on transition to shared mode (RULE-CTRL-7)", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/controls/share`,
        payload: {
          areas: [
            { pilotId: "captain-1", area: "src/api" },
            { pilotId: "fo-1", area: "src/web" },
          ],
        },
      });
      const craft = craftStore.get(PROJECT, "alpha-1")!;
      const entry = craft.blackBox.find((e) =>
        e.content.includes("Controls switched to shared mode"),
      );
      expect(entry).toBeDefined();
      expect(entry!.content).toContain("captain-1:src/api");
      expect(entry!.content).toContain("fo-1:src/web");
    });
  });
});
