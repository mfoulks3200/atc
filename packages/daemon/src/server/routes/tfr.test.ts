import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { TfrStore } from "../../state/tfr-store.js";
import { CraftStatus, BlackBoxEntryType } from "@airtrafficcontrol/types";
import type { CraftState, TfrState } from "../../types.js";

describe("tfr routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  let tfrStore: TfrStore;

  const PROJECT = "test-project";

  function seedCraft(callsign: string): void {
    const craft: CraftState = {
      callsign,
      createdAt: "2026-04-11T00:00:00.000Z",
      branch: `feat/${callsign}`,
      cargo: `Build ${callsign}`,
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
    craftStore.set(PROJECT, craft);
  }

  beforeEach(() => {
    craftStore = new CraftStore("/tmp/atc-tfr-test");
    tfrStore = new TfrStore("/tmp/atc-tfr-test");
    app = createApp({
      craftStore,
      tfrStore,
      towerStore: new TowerStore("/tmp/atc-tfr-test"),
      agentStore: new AgentStore("/tmp/atc-tfr-test"),
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe("POST /api/v1/tfrs", () => {
    it("creates a global TFR (RULE-TFR-1, RULE-TFR-3)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "global",
          target: null,
          mode: "graceful",
          reason: "System maintenance",
          issuedBy: "user",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<TfrState>();
      expect(body.scope).toBe("global");
      expect(body.reason).toBe("System maintenance");
      expect(body.liftedAt).toBeNull();
    });

    it("rejects tower global TFR (RULE-TFR-4)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "global",
          target: null,
          mode: "graceful",
          reason: "test",
          issuedBy: "tower",
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects project TFR with no target (RULE-TFR-2)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "project",
          target: null,
          mode: "graceful",
          reason: "test",
          issuedBy: "user",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("sets holdingPattern on affected crafts (RULE-TFR-5)", async () => {
      seedCraft("alpha-1");
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "craft",
          target: "alpha-1",
          mode: "immediate",
          reason: "debugging",
          issuedBy: "user",
          projectName: PROJECT,
        },
      });
      expect(res.statusCode).toBe(201);
      const craft = craftStore.get(PROJECT, "alpha-1");
      expect(craft?.holdingPattern).toBe(true);
    });

    it("records TFRIssued in affected craft black box (RULE-TFRP-5)", async () => {
      seedCraft("alpha-1");
      await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "craft",
          target: "alpha-1",
          mode: "immediate",
          reason: "debugging",
          issuedBy: "user",
          projectName: PROJECT,
        },
      });
      const craft = craftStore.get(PROJECT, "alpha-1");
      const tfrEntry = craft?.blackBox.find((e) => e.type === BlackBoxEntryType.TFRIssued);
      expect(tfrEntry).toBeDefined();
      expect(tfrEntry?.content).toContain("debugging");
    });
  });

  describe("GET /api/v1/tfrs", () => {
    it("returns all TFRs", async () => {
      tfrStore.set({
        identifier: "tfr-1",
        scope: "global",
        target: null,
        mode: "graceful",
        reason: "test",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: null,
      });
      const res = await app.inject({ method: "GET", url: "/api/v1/tfrs" });
      expect(res.statusCode).toBe(200);
      expect(res.json<TfrState[]>()).toHaveLength(1);
    });

    it("filters to active only with ?active=true", async () => {
      tfrStore.set({
        identifier: "tfr-1",
        scope: "global",
        target: null,
        mode: "graceful",
        reason: "test",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: null,
      });
      tfrStore.set({
        identifier: "tfr-2",
        scope: "global",
        target: null,
        mode: "graceful",
        reason: "done",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: new Date().toISOString(),
      });
      const res = await app.inject({ method: "GET", url: "/api/v1/tfrs?active=true" });
      expect(res.statusCode).toBe(200);
      expect(res.json<TfrState[]>()).toHaveLength(1);
    });
  });

  describe("POST /api/v1/tfrs/:id/lift", () => {
    it("lifts an active TFR (RULE-TFRP-3)", async () => {
      tfrStore.set({
        identifier: "tfr-1",
        scope: "global",
        target: null,
        mode: "graceful",
        reason: "test",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: null,
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs/tfr-1/lift",
      });
      expect(res.statusCode).toBe(200);
      const lifted = tfrStore.get("tfr-1");
      expect(lifted?.liftedAt).not.toBeNull();
    });

    it("clears holdingPattern when TFR is lifted and no other TFR applies (RULE-TFR-8)", async () => {
      seedCraft("alpha-1");
      const craft = craftStore.get(PROJECT, "alpha-1")!;
      craft.holdingPattern = true;
      craftStore.set(PROJECT, craft);

      tfrStore.set({
        identifier: "tfr-1",
        scope: "craft",
        target: "alpha-1",
        mode: "immediate",
        reason: "test",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: null,
      });

      await app.inject({
        method: "POST",
        url: `/api/v1/tfrs/tfr-1/lift?projectName=${PROJECT}`,
      });

      const updated = craftStore.get(PROJECT, "alpha-1");
      expect(updated?.holdingPattern).toBe(false);
    });

    it("returns 404 for unknown TFR", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs/ghost/lift",
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 409 for already-lifted TFR", async () => {
      tfrStore.set({
        identifier: "tfr-1",
        scope: "global",
        target: null,
        mode: "graceful",
        reason: "test",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: new Date().toISOString(),
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs/tfr-1/lift",
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("WebSocket publish on tfr:global", () => {
    it("publishes tfr.issued on the tfr:global channel for global-scoped TFRs", async () => {
      const publish = vi.fn();
      (app as unknown as { channelRegistry: { publish: typeof publish } }).channelRegistry.publish = publish;

      await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "global",
          target: null,
          mode: "immediate",
          reason: "test",
          issuedBy: "user",
        },
      });

      expect(publish).toHaveBeenCalledWith(
        "tfr:global",
        expect.objectContaining({
          type: "event",
          channel: "tfr:global",
          event: "tfr.issued",
          data: expect.objectContaining({
            tfr: expect.objectContaining({ scope: "global" }),
          }),
        }),
      );
    });

    it("does not publish on tfr:global for project-scoped TFRs", async () => {
      const publish = vi.fn();
      (app as unknown as { channelRegistry: { publish: typeof publish } }).channelRegistry.publish = publish;

      await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "project",
          target: "some-project",
          mode: "immediate",
          reason: "test",
          issuedBy: "user",
        },
      });

      expect(publish).not.toHaveBeenCalledWith("tfr:global", expect.anything());
    });

    it("publishes tfr.lifted on the tfr:global channel when a global TFR is lifted", async () => {
      const publish = vi.fn();
      (app as unknown as { channelRegistry: { publish: typeof publish } }).channelRegistry.publish = publish;

      tfrStore.set({
        identifier: "tfr-global-1",
        scope: "global",
        target: null,
        mode: "immediate",
        reason: "test",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: null,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/tfrs/tfr-global-1/lift",
      });

      expect(publish).toHaveBeenCalledWith(
        "tfr:global",
        expect.objectContaining({
          type: "event",
          channel: "tfr:global",
          event: "tfr.lifted",
          data: expect.objectContaining({
            tfr: expect.objectContaining({ identifier: "tfr-global-1", scope: "global" }),
          }),
        }),
      );
    });
  });
});
