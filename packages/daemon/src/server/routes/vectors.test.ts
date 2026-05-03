import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { CraftStatus, LifecycleEvent } from "@airtrafficcontrol/types";
import {
  createTemplateRegistry,
  createBindingRegistry,
  createOverrideStore,
  ChecklistItemSeverity,
} from "@airtrafficcontrol/checklist";
import type { CraftState } from "../../types.js";

describe("vector routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;

  const PROJECT = "test-project";

  function seedCraft(): void {
    const craft: CraftState = {
      callsign: "bravo-1",
      createdAt: "2026-04-11T00:00:00.000Z",
      branch: "feat/bravo",
      cargo: "Build bravo",
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "pilot-1",
      firstOfficers: ["reviewer-1"],
      jumpseaters: [],
      flightPlan: [
        { name: "design", acceptanceCriteria: "Design done", status: "Pending" },
        { name: "implement", acceptanceCriteria: "Code done", status: "Pending" },
        { name: "test", acceptanceCriteria: "Tests pass", status: "Pending" },
      ],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
      holdingPattern: false,
    };
    craftStore.set(PROJECT, craft);
  }

  function seedAdversarialCraft(): void {
    const craft: CraftState = {
      callsign: "adv-1",
      createdAt: "2026-04-28T00:00:00.000Z",
      branch: "feat/adv",
      cargo: "Adversarial review craft",
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "builder-1",
      firstOfficers: ["reviewer-1"],
      jumpseaters: [],
      flightPlan: [
        { name: "implement", acceptanceCriteria: "Code done", status: "Pending" },
        {
          name: "adversarial-gate",
          acceptanceCriteria: "Review passed",
          status: "Pending",
          type: "adversarial_review",
          reviewerPilotId: "reviewer-1",
        },
      ],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "builder-1" },
      holdingPattern: false,
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
    seedAdversarialCraft();
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
  // POST vector report — standard vectors
  // -------------------------------------------------------------------------

  describe("POST vector report (standard)", () => {
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

    it("appends a VectorPassed black box entry on report", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
        payload: { evidence: "Design doc approved" },
      });
      const craft = craftStore.get(PROJECT, "bravo-1")!;
      const vectorEntries = craft.blackBox.filter((e) => e.type === "VectorPassed");
      expect(vectorEntries).toHaveLength(1);
      expect(vectorEntries[0].content).toContain("design");
      expect(vectorEntries[0].content).toContain("Design doc approved");
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

    it("returns 404 for unknown craft callsign", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost-99/vectors/design/report`,
        payload: { evidence: "nonexistent craft" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // before:vector-complete checklist enforcement (RULE-CHKL-9)
  // -------------------------------------------------------------------------

  describe("before:vector-complete checklists", () => {
    let templateRegistry: ReturnType<typeof createTemplateRegistry>;
    let bindingRegistry: ReturnType<typeof createBindingRegistry>;
    let overrideStore: ReturnType<typeof createOverrideStore>;

    beforeEach(() => {
      templateRegistry = createTemplateRegistry();
      bindingRegistry = createBindingRegistry();
      overrideStore = createOverrideStore();

      craftStore = new CraftStore("/tmp/atc-vec-chkl-test");
      app = createApp({
        craftStore,
        agentStore: new AgentStore("/tmp/atc-vec-chkl-test"),
        towerStore: new TowerStore("/tmp/atc-vec-chkl-test"),
        templateRegistry,
        bindingRegistry,
        overrideStore,
      });
      seedCraft();
    });

    it("allows vector report when all required checklist items pass", async () => {
      const template = templateRegistry.create({
        name: "always-pass",
        items: [
          {
            name: "pass step",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "echo ok" },
          },
        ],
      });
      bindingRegistry.create({
        templateId: template.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "*",
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
        payload: { evidence: "Checked and passed" },
      });

      expect(res.statusCode).toBe(200);
      const plan = res.json<Array<{ name: string; status: string }>>();
      expect(plan[0].status).toBe("Passed");
    });

    it("returns 422 when a required checklist item fails (RULE-CHKL-9)", async () => {
      const template = templateRegistry.create({
        name: "always-fail",
        items: [
          {
            name: "fail step",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "exit 1" },
          },
        ],
      });
      bindingRegistry.create({
        templateId: template.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "*",
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
        payload: { evidence: "Will fail" },
      });

      expect(res.statusCode).toBe(422);
      const body = res.json<{ error: string; checklists: unknown[] }>();
      expect(body.error).toContain("design");
      expect(body.checklists).toHaveLength(1);
    });

    it("does not block vector report when only advisory items fail (RULE-CHKL-4)", async () => {
      const template = templateRegistry.create({
        name: "advisory-fail",
        items: [
          {
            name: "advisory fail step",
            severity: ChecklistItemSeverity.Advisory,
            executor: { type: "shell", command: "exit 1" },
          },
        ],
      });
      bindingRegistry.create({
        templateId: template.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "*",
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
        payload: { evidence: "Advisory failure ok" },
      });

      expect(res.statusCode).toBe(200);
    });

    it("continues running subsequent templates even when the first fails (RULE-CHKL-9)", async () => {
      const failing = templateRegistry.create({
        name: "fail-template",
        items: [
          {
            name: "always fails",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "exit 1" },
          },
        ],
      });
      const passing = templateRegistry.create({
        name: "pass-template",
        items: [
          {
            name: "always passes",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "echo ok" },
          },
        ],
      });
      bindingRegistry.create({
        templateId: failing.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "*",
      });
      bindingRegistry.create({
        templateId: passing.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "*",
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
        payload: { evidence: "Will fail first template" },
      });

      expect(res.statusCode).toBe(422);
      const body = res.json<{ checklists: Array<{ checklistName: string; passed: boolean }> }>();
      // Both templates ran — RULE-CHKL-9 enforces run-to-completion
      expect(body.checklists).toHaveLength(2);
      expect(body.checklists.find((c) => c.checklistName === "fail-template")?.passed).toBe(false);
      expect(body.checklists.find((c) => c.checklistName === "pass-template")?.passed).toBe(true);
    });

    it("vector is not marked Passed when checklist blocks the report", async () => {
      const template = templateRegistry.create({
        name: "blocker",
        items: [
          {
            name: "fail step",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "exit 1" },
          },
        ],
      });
      bindingRegistry.create({
        templateId: template.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "*",
      });

      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
        payload: { evidence: "Blocked" },
      });

      const craft = craftStore.get(PROJECT, "bravo-1")!;
      expect(craft.flightPlan[0].status).toBe("Pending");
    });

    it("no-op when no bindings exist for before:vector-complete", async () => {
      // No templates bound — existing behavior unchanged
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
        payload: { evidence: "No checklist configured" },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // POST vector report — adversarial_review vectors (RULE-CTRL-3a)
  // -------------------------------------------------------------------------

  describe("POST vector report — adversarial_review (RULE-CTRL-3a)", () => {
    async function passImplementVector(): Promise<void> {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/adv-1/vectors/implement/report`,
        payload: { evidence: "Implementation complete" },
      });
    }

    it("rejects the report when the reviewer does not hold exclusive controls", async () => {
      await passImplementVector();
      // builder-1 still holds exclusive controls — reviewer has not taken over
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/adv-1/vectors/adversarial-gate/report`,
        payload: { evidence: "Review passed" },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json<{ error: string; ruleId: string }>();
      expect(body.ruleId).toBe("RULE-CTRL-3a");
      expect(body.error).toContain("reviewer-1");
    });

    it("rejects the report when controls are shared rather than exclusive to the reviewer", async () => {
      await passImplementVector();
      // put controls into shared mode — still not exclusive reviewer controls
      const craft = craftStore.get(PROJECT, "adv-1")!;
      craft.controls = {
        mode: "shared",
        sharedAreas: [
          { pilotId: "builder-1", area: "src" },
          { pilotId: "reviewer-1", area: "docs" },
        ],
      };
      craftStore.set(PROJECT, craft);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/adv-1/vectors/adversarial-gate/report`,
        payload: { evidence: "Review passed" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json<{ ruleId: string }>().ruleId).toBe("RULE-CTRL-3a");
    });

    it("accepts the report when the reviewer holds exclusive controls", async () => {
      await passImplementVector();
      // Hand controls to the reviewer
      const craft = craftStore.get(PROJECT, "adv-1")!;
      craft.controls = { mode: "exclusive", holder: "reviewer-1" };
      craftStore.set(PROJECT, craft);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/adv-1/vectors/adversarial-gate/report`,
        payload: { evidence: "Review passed — no issues found" },
      });
      expect(res.statusCode).toBe(200);
      const plan = res.json<Array<{ name: string; status: string }>>();
      const gate = plan.find((v) => v.name === "adversarial-gate");
      expect(gate?.status).toBe("Passed");
    });

    it("attributes the black box entry to the reviewer, not the captain (RULE-CTRL-7)", async () => {
      await passImplementVector();
      const craft = craftStore.get(PROJECT, "adv-1")!;
      craft.controls = { mode: "exclusive", holder: "reviewer-1" };
      craftStore.set(PROJECT, craft);

      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/adv-1/vectors/adversarial-gate/report`,
        payload: { evidence: "Reviewer sign-off" },
      });

      const updated = craftStore.get(PROJECT, "adv-1")!;
      const entry = updated.blackBox.find(
        (e) => e.type === "VectorPassed" && e.content.includes("adversarial-gate"),
      );
      expect(entry).toBeDefined();
      expect(entry!.author).toBe("reviewer-1");
    });

    it("rejects the report when the wrong pilot holds exclusive controls", async () => {
      await passImplementVector();
      // fo-2 (not the designated reviewer) holds controls
      const craft = craftStore.get(PROJECT, "adv-1")!;
      craft.controls = { mode: "exclusive", holder: "builder-1" };
      craftStore.set(PROJECT, craft);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/adv-1/vectors/adversarial-gate/report`,
        payload: { evidence: "Wrong pilot reporting" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json<{ ruleId: string }>().ruleId).toBe("RULE-CTRL-3a");
    });
  });

  // -------------------------------------------------------------------------
  // Craft creation — adversarial_review vector fields round-trip
  // -------------------------------------------------------------------------

  describe("craft creation with adversarial_review vector", () => {
    it("preserves type and reviewerPilotId fields when creating a craft", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts`,
        payload: {
          callsign: "adv-create-test",
          branch: "feat/adv-create",
          cargo: "Test adversarial vector creation",
          category: "backend",
          captain: "pilot-x",
          firstOfficers: ["reviewer-x"],
          flightPlan: [
            { name: "build", acceptanceCriteria: "Built" },
            {
              name: "review",
              acceptanceCriteria: "Reviewed",
              type: "adversarial_review",
              reviewerPilotId: "reviewer-x",
            },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const craft = craftStore.get(PROJECT, "adv-create-test")!;
      const reviewVector = craft.flightPlan.find((v) => v.name === "review");
      expect(reviewVector?.type).toBe("adversarial_review");
      expect(reviewVector?.reviewerPilotId).toBe("reviewer-x");
    });
  });
});
