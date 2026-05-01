import { describe, it, expect } from "vitest";
import {
  createTemplateRegistry,
  createBindingRegistry,
  createOverrideStore,
} from "@airtrafficcontrol/checklist";
import { ChecklistItemSeverity, LifecycleEvent } from "@airtrafficcontrol/types";
import { DaemonClearanceChecklistRunner } from "./clearance-checklist-runner.js";
import type { ProjectChecklistRegistries } from "./app.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegistries(): ProjectChecklistRegistries {
  return {
    templates: createTemplateRegistry(),
    bindings: createBindingRegistry(),
    overrides: createOverrideStore(),
  };
}

function addPassingTemplate(
  registries: ProjectChecklistRegistries,
  craftCategory: string,
): void {
  const template = registries.templates.create({
    name: "CI checks",
    items: [
      {
        name: "tests",
        title: "Tests pass",
        description: "All tests pass",
        severity: ChecklistItemSeverity.Required,
        executor: { type: "shell", command: "echo ok" },
      },
    ],
  });
  registries.bindings.create({
    templateId: template.id,
    event: LifecycleEvent.BeforeTowerClearance,
    craftCategory,
  });
}

function addFailingTemplate(
  registries: ProjectChecklistRegistries,
  craftCategory: string,
): void {
  const template = registries.templates.create({
    name: "Always fail",
    items: [
      {
        name: "fail",
        title: "Always failing check",
        description: "This always fails",
        severity: ChecklistItemSeverity.Required,
        executor: { type: "shell", command: "exit 1" },
      },
    ],
  });
  registries.bindings.create({
    templateId: template.id,
    event: LifecycleEvent.BeforeTowerClearance,
    craftCategory,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DaemonClearanceChecklistRunner", () => {
  it("returns empty array when no bindings are registered for the event", async () => {
    const registries = makeRegistries();
    const runner = new DaemonClearanceChecklistRunner(registries);

    const results = await runner.runClearanceChecklists("CRAFT-1", "Backend Engineering");
    expect(results).toEqual([]);
  });

  it("returns empty array when bindings exist for a different category", async () => {
    const registries = makeRegistries();
    addPassingTemplate(registries, "Frontend");
    const runner = new DaemonClearanceChecklistRunner(registries);

    const results = await runner.runClearanceChecklists("CRAFT-1", "Backend Engineering");
    expect(results).toEqual([]);
  });

  it("returns one result per matching template (RULE-CHKL-13)", async () => {
    const registries = makeRegistries();
    addPassingTemplate(registries, "Backend Engineering");
    const runner = new DaemonClearanceChecklistRunner(registries);

    const results = await runner.runClearanceChecklists("CRAFT-1", "Backend Engineering");
    expect(results).toHaveLength(1);
    expect(results[0].checklistName).toBe("CI checks");
    expect(results[0].event).toBe(LifecycleEvent.BeforeTowerClearance);
    expect(results[0].craftCallsign).toBe("CRAFT-1");
  });

  it("returns passed: true when shell command exits 0", async () => {
    const registries = makeRegistries();
    addPassingTemplate(registries, "Backend Engineering");
    const runner = new DaemonClearanceChecklistRunner(registries);

    const results = await runner.runClearanceChecklists("CRAFT-1", "Backend Engineering");
    expect(results[0].passed).toBe(true);
  });

  it("returns passed: false when shell command exits non-zero", async () => {
    const registries = makeRegistries();
    addFailingTemplate(registries, "Backend Engineering");
    const runner = new DaemonClearanceChecklistRunner(registries);

    const results = await runner.runClearanceChecklists("CRAFT-1", "Backend Engineering");
    expect(results[0].passed).toBe(false);
  });

  it("matches wildcard category bindings", async () => {
    const registries = makeRegistries();
    addPassingTemplate(registries, "*");
    const runner = new DaemonClearanceChecklistRunner(registries);

    const results = await runner.runClearanceChecklists("CRAFT-1", "Backend Engineering");
    expect(results).toHaveLength(1);
  });

  it("runs multiple bindings and returns all results in order (RULE-CHKL-13)", async () => {
    const registries = makeRegistries();
    addPassingTemplate(registries, "Backend Engineering");
    addFailingTemplate(registries, "Backend Engineering");
    const runner = new DaemonClearanceChecklistRunner(registries);

    const results = await runner.runClearanceChecklists("CRAFT-1", "Backend Engineering");
    expect(results).toHaveLength(2);
    expect(results[0].checklistName).toBe("CI checks");
    expect(results[1].checklistName).toBe("Always fail");
  });

  it("sets attempt to 1 on all checklist results", async () => {
    const registries = makeRegistries();
    addPassingTemplate(registries, "Backend Engineering");
    const runner = new DaemonClearanceChecklistRunner(registries);

    const results = await runner.runClearanceChecklists("CRAFT-1", "Backend Engineering");
    expect(results[0].attempt).toBe(1);
  });

  it("continues running subsequent templates even when the first fails (RULE-CHKL-11)", async () => {
    const registries = makeRegistries();
    addFailingTemplate(registries, "Backend Engineering");
    addPassingTemplate(registries, "Backend Engineering");
    const runner = new DaemonClearanceChecklistRunner(registries);

    const results = await runner.runClearanceChecklists("CRAFT-1", "Backend Engineering");
    expect(results).toHaveLength(2);
    expect(results[0].passed).toBe(false);
    expect(results[1].passed).toBe(true);
  });
});
