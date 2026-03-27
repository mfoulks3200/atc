import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import type { CraftState } from "../../types.js";

// Mock filesystem-dependent modules so checklist route tests don't need real disk state
vi.mock("../../config/loader.js", () => ({
  loadProjectMetadata: vi.fn().mockResolvedValue({
    name: "test-project",
    repoPath: "/tmp/fake-repo",
    checklist: [{ name: "echo ok", command: "echo ok" }],
  }),
}));

vi.mock("../../checklist/runner.js", () => ({
  runChecklist: vi.fn(),
}));

import { runChecklist } from "../../checklist/runner.js";

describe("craft routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;

  const PROJECT = "test-project";

  const validCraftBody = {
    callsign: "alpha-1",
    branch: "feat/alpha",
    cargo: "Implement feature alpha",
    category: "backend",
    captain: "pilot-1",
    firstOfficers: ["pilot-2"],
    jumpseaters: [],
    flightPlan: [
      { name: "design", acceptanceCriteria: "Design doc exists" },
      { name: "implement", acceptanceCriteria: "Code written" },
    ],
  };

  beforeEach(() => {
    craftStore = new CraftStore("/tmp/atc-craft-test");
    app = createApp({
      craftStore,
      agentStore: new AgentStore("/tmp/atc-craft-test"),
      towerStore: new TowerStore("/tmp/atc-craft-test"),
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts
  // -------------------------------------------------------------------------

  describe("POST /api/v1/projects/:name/crafts", () => {
    it("creates a craft and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json<CraftState>();
      expect(body.callsign).toBe("alpha-1");
      expect(body.status).toBe("Taxiing");
      expect(body.controls.mode).toBe("exclusive");
      expect(body.controls.holder).toBe("pilot-1");
      expect(body.flightPlan).toHaveLength(2);
      expect(body.flightPlan[0].status).toBe("Pending");
    });

    it("stores the craft in the craftStore", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });

      const stored = craftStore.get(PROJECT, "alpha-1");
      expect(stored).toBeDefined();
      expect(stored!.cargo).toBe("Implement feature alpha");
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts
  // -------------------------------------------------------------------------

  describe("GET /api/v1/projects/:name/crafts", () => {
    it("returns empty array when no crafts exist", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("lists all crafts and filters by status", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });

      const allRes = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts`,
      });
      expect(allRes.json()).toHaveLength(1);

      const filteredRes = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts?status=InFlight`,
      });
      expect(filteredRes.json()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts/:callsign
  // -------------------------------------------------------------------------

  describe("GET /api/v1/projects/:name/crafts/:callsign", () => {
    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns craft details", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<CraftState>().callsign).toBe("alpha-1");
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/projects/:name/crafts/:callsign
  // -------------------------------------------------------------------------

  describe("DELETE /api/v1/projects/:name/crafts/:callsign", () => {
    it("removes the craft and returns 204", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1`,
      });
      expect(res.statusCode).toBe(204);
      expect(craftStore.get(PROJECT, "alpha-1")).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts/:callsign/launch
  // -------------------------------------------------------------------------

  describe("POST /api/v1/projects/:name/crafts/:callsign/launch", () => {
    it("transitions Taxiing to InFlight", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/launch`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<CraftState>().status).toBe("InFlight");
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/launch`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 409 if not Taxiing", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });
      // Launch once
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/launch`,
      });
      // Try to launch again
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/launch`,
      });
      expect(res.statusCode).toBe(409);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts/:callsign/checklist
  // -------------------------------------------------------------------------

  describe("POST /api/v1/projects/:name/crafts/:callsign/checklist", () => {
    /** Helper: seed a craft in InFlight status. */
    async function seedCraftInFlight(): Promise<void> {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/launch`,
      });
    }

    it("transitions to ClearedToLand when checklist passes", async () => {
      await seedCraftInFlight();
      vi.mocked(runChecklist).mockResolvedValueOnce({ passed: true, items: [] });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/checklist`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.passed).toBe(true);
      expect(body.status).toBe("ClearedToLand");
      // Verify store was updated
      expect(craftStore.get(PROJECT, "alpha-1")!.status).toBe("ClearedToLand");
    });

    it("transitions to GoAround when checklist fails", async () => {
      await seedCraftInFlight();
      vi.mocked(runChecklist).mockResolvedValueOnce({
        passed: false,
        items: [{ name: "lint", passed: false, stdout: "", stderr: "error", durationMs: 10 }],
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/checklist`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.passed).toBe(false);
      expect(body.status).toBe("GoAround");
      expect(craftStore.get(PROJECT, "alpha-1")!.status).toBe("GoAround");
    });

    it("also accepts GoAround as a valid entry state (re-attempt)", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });
      // Force GoAround directly
      const craft = craftStore.get(PROJECT, "alpha-1")!;
      craft.status = "GoAround" as CraftState["status"];
      craftStore.set(PROJECT, craft);

      vi.mocked(runChecklist).mockResolvedValueOnce({ passed: true, items: [] });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/checklist`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("ClearedToLand");
    });

    it("returns 409 when craft is not InFlight or GoAround", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });
      // Craft is Taxiing — invalid entry state

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/checklist`,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatch(/InFlight or GoAround/);
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/checklist`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts/:callsign/emergency
  // -------------------------------------------------------------------------

  describe("POST /api/v1/projects/:name/crafts/:callsign/emergency", () => {
    /** Helper: seed a craft directly in GoAround status (bypasses checklist). */
    async function seedCraftInGoAround(): Promise<void> {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });
      // Manually force status to GoAround in the store (lifecycle transition 7 requires it)
      const craft = craftStore.get(PROJECT, "alpha-1")!;
      craft.status = "GoAround" as CraftState["status"];
      craftStore.set(PROJECT, craft);
    }

    it("declares emergency when captain requests from GoAround", async () => {
      await seedCraftInGoAround();

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/emergency`,
        payload: { pilotId: "pilot-1", reason: "Engine failure" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<CraftState>();
      expect(body.status).toBe("Emergency");
      expect(body.blackBox).toHaveLength(1);
      expect(body.blackBox[0].type).toBe("EmergencyDeclaration");
    });

    it("returns 400 when craft is not in GoAround", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });
      // Craft is in Taxiing — not a valid state for emergency declaration

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/emergency`,
        payload: { pilotId: "pilot-1", reason: "Shouldn't work yet" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/GoAround/);
    });

    it("returns 400 when craft is InFlight (only GoAround allowed)", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: validCraftBody,
      });
      // Launch into InFlight
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/launch`,
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/emergency`,
        payload: { pilotId: "pilot-1", reason: "Can't jump to emergency from InFlight" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/GoAround/);
    });

    it("returns 403 when non-captain tries to declare", async () => {
      await seedCraftInGoAround();

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/emergency`,
        payload: { pilotId: "pilot-2", reason: "I'm not the captain" },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
