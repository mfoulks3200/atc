import { describe, it, expect, beforeEach } from "vitest";
import { resolveChecklist } from "./resolve.js";
import { createTemplateRegistry } from "./templates.js";
import { createBindingRegistry } from "./bindings.js";
import { createOverrideStore } from "./overrides.js";
import { LifecycleEvent, ChecklistItemSeverity } from "@airtrafficcontrol/types";
import type { ChecklistItemDef } from "@airtrafficcontrol/types";

const testItem: ChecklistItemDef = {
  name: "Tests",
  title: "Run Tests",
  severity: ChecklistItemSeverity.Required,
  executor: { type: "shell", command: "pnpm run test" },
};

const lintItem: ChecklistItemDef = {
  name: "Lint",
  title: "Lint Check",
  severity: ChecklistItemSeverity.Required,
  executor: { type: "shell", command: "pnpm run lint" },
};

const docsItem: ChecklistItemDef = {
  name: "Docs",
  title: "Documentation Check",
  severity: ChecklistItemSeverity.Advisory,
  executor: { type: "shell", command: "pnpm run docs:check" },
};

describe("resolveChecklist", () => {
  let templates: ReturnType<typeof createTemplateRegistry>;
  let bindings: ReturnType<typeof createBindingRegistry>;
  let overrides: ReturnType<typeof createOverrideStore>;

  beforeEach(() => {
    templates = createTemplateRegistry();
    bindings = createBindingRegistry();
    overrides = createOverrideStore();
  });

  it("resolves items from a bound template", () => {
    const tpl = templates.create({ name: "Pre-Landing", items: [testItem, lintItem] });
    bindings.create({
      templateId: tpl.id,
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });
    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeLandingCheck,
      templates,
      bindings,
      overrides,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.templateName).toBe("Pre-Landing");
    expect(result[0]!.items).toHaveLength(2);
    expect(result[0]!.items.map((i) => i.name)).toEqual(["Tests", "Lint"]);
  });

  it("includes wildcard category bindings", () => {
    const tpl = templates.create({ name: "Universal", items: [testItem] });
    bindings.create({
      templateId: tpl.id,
      event: LifecycleEvent.BeforeTakeoff,
      craftCategory: "*",
    });
    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "hotfix",
      event: LifecycleEvent.BeforeTakeoff,
      templates,
      bindings,
      overrides,
    });
    expect(result).toHaveLength(1);
  });

  it("returns empty array when no bindings match", () => {
    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeTakeoff,
      templates,
      bindings,
      overrides,
    });
    expect(result).toHaveLength(0);
  });

  it("applies override: adds items after template items", () => {
    const tpl = templates.create({ name: "Pre-Landing", items: [testItem] });
    bindings.create({
      templateId: tpl.id,
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });
    overrides.set({
      craftCallsign: "ATC-1",
      templateId: tpl.id,
      event: LifecycleEvent.BeforeLandingCheck,
      addItems: [docsItem],
    });
    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeLandingCheck,
      templates,
      bindings,
      overrides,
    });
    expect(result[0]!.items).toHaveLength(2);
    expect(result[0]!.items.map((i) => i.name)).toEqual(["Tests", "Docs"]);
  });

  it("applies override: removes items by name", () => {
    const tpl = templates.create({ name: "Pre-Landing", items: [testItem, lintItem] });
    bindings.create({
      templateId: tpl.id,
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });
    overrides.set({
      craftCallsign: "ATC-1",
      templateId: tpl.id,
      event: LifecycleEvent.BeforeLandingCheck,
      removeItems: ["Lint"],
    });
    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeLandingCheck,
      templates,
      bindings,
      overrides,
    });
    expect(result[0]!.items).toHaveLength(1);
    expect(result[0]!.items[0]!.name).toBe("Tests");
  });

  it("applies override: disables template entirely", () => {
    const tpl = templates.create({ name: "Pre-Landing", items: [testItem] });
    bindings.create({
      templateId: tpl.id,
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });
    overrides.set({
      craftCallsign: "ATC-1",
      templateId: tpl.id,
      event: LifecycleEvent.BeforeLandingCheck,
      disableTemplate: true,
    });
    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeLandingCheck,
      templates,
      bindings,
      overrides,
    });
    expect(result).toHaveLength(0);
  });

  it("handles multiple templates bound to same event", () => {
    const tpl1 = templates.create({ name: "Tests", items: [testItem] });
    const tpl2 = templates.create({ name: "Lint", items: [lintItem] });
    bindings.create({
      templateId: tpl1.id,
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });
    bindings.create({
      templateId: tpl2.id,
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });
    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeLandingCheck,
      templates,
      bindings,
      overrides,
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.templateName).toBe("Tests");
    expect(result[1]!.templateName).toBe("Lint");
  });

  describe("vector-scoped bindings (RULE-CHKL-10, RULE-CHKL-11)", () => {
    it("resolves only matching vector-scoped binding when vectorName provided", () => {
      const tpl1 = templates.create({ name: "Code Review Check", items: [testItem] });
      const tpl2 = templates.create({ name: "Deploy Check", items: [lintItem] });
      bindings.create({
        templateId: tpl1.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Code Review",
      });
      bindings.create({
        templateId: tpl2.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Deploy",
      });

      const result = resolveChecklist({
        craftCallsign: "ATC-1",
        craftCategory: "feature",
        event: LifecycleEvent.BeforeVectorComplete,
        vectorName: "Code Review",
        templates,
        bindings,
        overrides,
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.templateName).toBe("Code Review Check");
    });

    it("includes unscoped and matching scoped bindings together (RULE-CHKL-10)", () => {
      const tplGlobal = templates.create({ name: "Global", items: [testItem] });
      const tplScoped = templates.create({ name: "Code Review Specific", items: [lintItem] });
      bindings.create({
        templateId: tplGlobal.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
      });
      bindings.create({
        templateId: tplScoped.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Code Review",
      });

      const result = resolveChecklist({
        craftCallsign: "ATC-1",
        craftCategory: "feature",
        event: LifecycleEvent.BeforeVectorComplete,
        vectorName: "Code Review",
        templates,
        bindings,
        overrides,
      });
      expect(result).toHaveLength(2);
      const names = result.map((r) => r.templateName);
      expect(names).toContain("Global");
      expect(names).toContain("Code Review Specific");
    });

    it("multiple templates scoped to same vector run in registration order (RULE-CHKL-11)", () => {
      const tpl1 = templates.create({ name: "Security Scan", items: [testItem] });
      const tpl2 = templates.create({ name: "Lint", items: [lintItem] });
      bindings.create({
        templateId: tpl1.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Code Review",
      });
      bindings.create({
        templateId: tpl2.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Code Review",
      });

      const result = resolveChecklist({
        craftCallsign: "ATC-1",
        craftCategory: "feature",
        event: LifecycleEvent.BeforeVectorComplete,
        vectorName: "Code Review",
        templates,
        bindings,
        overrides,
      });
      expect(result).toHaveLength(2);
      expect(result[0]!.templateName).toBe("Security Scan");
      expect(result[1]!.templateName).toBe("Lint");
    });

    it("returns empty when no binding matches the vector name", () => {
      const tpl = templates.create({ name: "Code Review Check", items: [testItem] });
      bindings.create({
        templateId: tpl.id,
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Code Review",
      });

      const result = resolveChecklist({
        craftCallsign: "ATC-1",
        craftCategory: "feature",
        event: LifecycleEvent.BeforeVectorComplete,
        vectorName: "Integration Tests",
        templates,
        bindings,
        overrides,
      });
      expect(result).toHaveLength(0);
    });
  });
});
