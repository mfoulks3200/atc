import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { CraftStatus, ChecklistItemSeverity, LifecycleEvent } from "@airtrafficcontrol/types";
import {
  createTemplateRegistry,
  createBindingRegistry,
  createOverrideStore,
} from "@airtrafficcontrol/checklist";
import type { CraftState } from "../../types.js";
import type { ProjectChecklistRegistries } from "../app.js";

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

    it("returns 404 for unknown craft callsign on report", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/vectors/design/report`,
        payload: { evidence: "should not matter" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Vector checklist integration (RULE-CHKL-10, RULE-VEC-2)
  // -------------------------------------------------------------------------

  describe("POST vector report — checklist integration (RULE-CHKL-10)", () => {
    function makeRegistries(): ProjectChecklistRegistries {
      return {
        templates: createTemplateRegistry(),
        bindings: createBindingRegistry(),
        overrides: createOverrideStore(),
      };
    }

    it("reports vector when no before:vector-complete bindings are registered", async () => {
      const registries = makeRegistries();
      const localApp = createApp({
        craftStore,
        agentStore: new AgentStore("/tmp/atc-vec-test"),
        towerStore: new TowerStore("/tmp/atc-vec-test"),
        projectChecklistRegistries: new Map([[PROJECT, registries]]),
      });

      try {
        const res = await localApp.inject({
          method: "POST",
          url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
          payload: { evidence: "Design reviewed" },
        });
        expect(res.statusCode).toBe(200);
        const plan = res.json<Array<{ status: string }>>();
        expect(plan[0].status).toBe("Passed");
      } finally {
        await localApp.close();
      }
    });

    it("allows vector report when before:vector-complete checklist passes (RULE-CHKL-10)", async () => {
      const registries = makeRegistries();
      const template = registries.templates.create({
        name: "Design gate",
        items: [
          {
            name: "ok",
            title: "Always passes",
            description: "Always passes",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "echo ok" },
          },
        ],
      });
      registries.bindings.create({
        templateId: template.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "backend",
        vectorName: "design",
      });

      const localApp = createApp({
        craftStore,
        agentStore: new AgentStore("/tmp/atc-vec-test"),
        towerStore: new TowerStore("/tmp/atc-vec-test"),
        projectChecklistRegistries: new Map([[PROJECT, registries]]),
      });

      try {
        const res = await localApp.inject({
          method: "POST",
          url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
          payload: { evidence: "Design reviewed" },
        });
        expect(res.statusCode).toBe(200);
        const plan = res.json<Array<{ status: string }>>();
        expect(plan[0].status).toBe("Passed");
      } finally {
        await localApp.close();
      }
    });

    it("blocks vector report and returns 422 when before:vector-complete checklist fails (RULE-CHKL-10)", async () => {
      const registries = makeRegistries();
      const template = registries.templates.create({
        name: "Blocking gate",
        items: [
          {
            name: "fail",
            title: "Always fails",
            description: "Always fails",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "exit 1" },
          },
        ],
      });
      registries.bindings.create({
        templateId: template.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "backend",
        vectorName: "design",
      });

      const localApp = createApp({
        craftStore,
        agentStore: new AgentStore("/tmp/atc-vec-test"),
        towerStore: new TowerStore("/tmp/atc-vec-test"),
        projectChecklistRegistries: new Map([[PROJECT, registries]]),
      });

      try {
        const res = await localApp.inject({
          method: "POST",
          url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
          payload: { evidence: "Attempted report" },
        });
        expect(res.statusCode).toBe(422);
        const body = res.json<{ code: string; checklistResults: unknown[] }>();
        expect(body.code).toBe("VECTOR_CHECKLIST_FAILED");
        expect(body.checklistResults).toHaveLength(1);

        // Vector must not have been marked as Passed.
        const craft = craftStore.get(PROJECT, "bravo-1")!;
        expect(craft.flightPlan[0].status).toBe("Pending");
      } finally {
        await localApp.close();
      }
    });

    it("does not block vector report when after:vector-complete checklist fails (advisory)", async () => {
      const registries = makeRegistries();
      const template = registries.templates.create({
        name: "Post-vector",
        items: [
          {
            name: "advisory",
            title: "Advisory check",
            description: "Advisory only",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "exit 1" },
          },
        ],
      });
      registries.bindings.create({
        templateId: template.id,
        event: LifecycleEvent.AfterVectorComplete,
        craftCategory: "backend",
        vectorName: "design",
      });

      const localApp = createApp({
        craftStore,
        agentStore: new AgentStore("/tmp/atc-vec-test"),
        towerStore: new TowerStore("/tmp/atc-vec-test"),
        projectChecklistRegistries: new Map([[PROJECT, registries]]),
      });

      try {
        const res = await localApp.inject({
          method: "POST",
          url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
          payload: { evidence: "Design reviewed" },
        });
        // After-checklist failure must not block the response.
        expect(res.statusCode).toBe(200);
        const plan = res.json<Array<{ status: string }>>();
        expect(plan[0].status).toBe("Passed");

        // ChecklistRun entry should still be recorded in the black box.
        const craft = craftStore.get(PROJECT, "bravo-1")!;
        const checklistEntries = craft.blackBox.filter((e) => e.type === "ChecklistRun");
        expect(checklistEntries).toHaveLength(1);
      } finally {
        await localApp.close();
      }
    });

    it("records 'passed' in the black box when after:vector-complete checklist passes (advisory)", async () => {
      const registries = makeRegistries();
      const template = registries.templates.create({
        name: "Post-vector passing",
        items: [
          {
            name: "ok",
            title: "Advisory passing check",
            description: "Always passes",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "echo ok" },
          },
        ],
      });
      registries.bindings.create({
        templateId: template.id,
        event: LifecycleEvent.AfterVectorComplete,
        craftCategory: "backend",
        vectorName: "design",
      });

      const localApp = createApp({
        craftStore,
        agentStore: new AgentStore("/tmp/atc-vec-test"),
        towerStore: new TowerStore("/tmp/atc-vec-test"),
        projectChecklistRegistries: new Map([[PROJECT, registries]]),
      });

      try {
        const res = await localApp.inject({
          method: "POST",
          url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
          payload: { evidence: "Design reviewed" },
        });
        expect(res.statusCode).toBe(200);

        const craft = craftStore.get(PROJECT, "bravo-1")!;
        const checklistEntries = craft.blackBox.filter((e) => e.type === "ChecklistRun");
        expect(checklistEntries).toHaveLength(1);
        expect(checklistEntries[0].content).toContain("passed");
      } finally {
        await localApp.close();
      }
    });

    it("runs all bound templates to completion even when one fails (RULE-CHKL-11)", async () => {
      const registries = makeRegistries();
      const failTemplate = registries.templates.create({
        name: "Security scan",
        items: [
          {
            name: "vuln-check",
            title: "Vulnerability check",
            description: "Always fails",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "exit 1" },
          },
        ],
      });
      const passTemplate = registries.templates.create({
        name: "Lint check",
        items: [
          {
            name: "lint",
            title: "Lint",
            description: "Always passes",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "echo ok" },
          },
        ],
      });
      registries.bindings.create({
        templateId: failTemplate.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "backend",
        vectorName: "design",
      });
      registries.bindings.create({
        templateId: passTemplate.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "backend",
        vectorName: "design",
      });

      const localApp = createApp({
        craftStore,
        agentStore: new AgentStore("/tmp/atc-vec-test"),
        towerStore: new TowerStore("/tmp/atc-vec-test"),
        projectChecklistRegistries: new Map([[PROJECT, registries]]),
      });

      try {
        const res = await localApp.inject({
          method: "POST",
          url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
          payload: { evidence: "Attempted report" },
        });
        expect(res.statusCode).toBe(422);
        const body = res.json<{
          code: string;
          checklistResults: Array<{ checklistName: string; passed: boolean }>;
        }>();
        expect(body.code).toBe("VECTOR_CHECKLIST_FAILED");

        // Both templates must have run — results include both.
        expect(body.checklistResults).toHaveLength(2);
        expect(body.checklistResults[0].checklistName).toBe("Security scan");
        expect(body.checklistResults[0].passed).toBe(false);
        expect(body.checklistResults[1].checklistName).toBe("Lint check");
        expect(body.checklistResults[1].passed).toBe(true);

        // Vector must not have been marked as Passed.
        const craft = craftStore.get(PROJECT, "bravo-1")!;
        expect(craft.flightPlan[0].status).toBe("Pending");

        // Both checklist runs should be recorded in the black box.
        const checklistEntries = craft.blackBox.filter((e) => e.type === "ChecklistRun");
        expect(checklistEntries).toHaveLength(2);
      } finally {
        await localApp.close();
      }
    });

    it("does not apply bindings for a different vector name (RULE-CHKL-10)", async () => {
      const registries = makeRegistries();
      const template = registries.templates.create({
        name: "Implement gate",
        items: [
          {
            name: "fail",
            title: "Always fails",
            description: "Always fails",
            severity: ChecklistItemSeverity.Required,
            executor: { type: "shell", command: "exit 1" },
          },
        ],
      });
      registries.bindings.create({
        templateId: template.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "backend",
        vectorName: "implement",
      });

      const localApp = createApp({
        craftStore,
        agentStore: new AgentStore("/tmp/atc-vec-test"),
        towerStore: new TowerStore("/tmp/atc-vec-test"),
        projectChecklistRegistries: new Map([[PROJECT, registries]]),
      });

      try {
        // Reporting "design" — the binding is scoped to "implement" and should not apply.
        const res = await localApp.inject({
          method: "POST",
          url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
          payload: { evidence: "Design reviewed" },
        });
        expect(res.statusCode).toBe(200);
        const plan = res.json<Array<{ status: string }>>();
        expect(plan[0].status).toBe("Passed");
      } finally {
        await localApp.close();
      }
    });
  });
});
