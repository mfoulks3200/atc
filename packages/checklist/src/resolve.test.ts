import { describe, it, expect, beforeEach } from "vitest";
import { resolveChecklist } from "./resolve.js";
import { createTemplateRegistry } from "./templates.js";
import { createBindingRegistry } from "./bindings.js";
import { createOverrideStore } from "./overrides.js";
import { LifecycleEvent, ChecklistItemSeverity } from "@atc/types";
import type { ChecklistItemDef } from "@atc/types";

const testItem: ChecklistItemDef = {
  name: "Tests",
  severity: ChecklistItemSeverity.Required,
  executor: { type: "shell", command: "pnpm run test" },
};

const lintItem: ChecklistItemDef = {
  name: "Lint",
  severity: ChecklistItemSeverity.Required,
  executor: { type: "shell", command: "pnpm run lint" },
};

const docsItem: ChecklistItemDef = {
  name: "Docs",
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
    bindings.create({ templateId: tpl.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    const result = resolveChecklist({
      craftCallsign: "ATC-1", craftCategory: "feature", event: LifecycleEvent.BeforeLandingCheck,
      templates, bindings, overrides,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.templateName).toBe("Pre-Landing");
    expect(result[0]!.items).toHaveLength(2);
    expect(result[0]!.items.map((i) => i.name)).toEqual(["Tests", "Lint"]);
  });

  it("includes wildcard category bindings", () => {
    const tpl = templates.create({ name: "Universal", items: [testItem] });
    bindings.create({ templateId: tpl.id, event: LifecycleEvent.BeforeTakeoff, craftCategory: "*" });
    const result = resolveChecklist({
      craftCallsign: "ATC-1", craftCategory: "hotfix", event: LifecycleEvent.BeforeTakeoff,
      templates, bindings, overrides,
    });
    expect(result).toHaveLength(1);
  });

  it("returns empty array when no bindings match", () => {
    const result = resolveChecklist({
      craftCallsign: "ATC-1", craftCategory: "feature", event: LifecycleEvent.BeforeTakeoff,
      templates, bindings, overrides,
    });
    expect(result).toHaveLength(0);
  });

  it("applies override: adds items after template items", () => {
    const tpl = templates.create({ name: "Pre-Landing", items: [testItem] });
    bindings.create({ templateId: tpl.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    overrides.set({
      craftCallsign: "ATC-1", templateId: tpl.id, event: LifecycleEvent.BeforeLandingCheck,
      addItems: [docsItem],
    });
    const result = resolveChecklist({
      craftCallsign: "ATC-1", craftCategory: "feature", event: LifecycleEvent.BeforeLandingCheck,
      templates, bindings, overrides,
    });
    expect(result[0]!.items).toHaveLength(2);
    expect(result[0]!.items.map((i) => i.name)).toEqual(["Tests", "Docs"]);
  });

  it("applies override: removes items by name", () => {
    const tpl = templates.create({ name: "Pre-Landing", items: [testItem, lintItem] });
    bindings.create({ templateId: tpl.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    overrides.set({
      craftCallsign: "ATC-1", templateId: tpl.id, event: LifecycleEvent.BeforeLandingCheck,
      removeItems: ["Lint"],
    });
    const result = resolveChecklist({
      craftCallsign: "ATC-1", craftCategory: "feature", event: LifecycleEvent.BeforeLandingCheck,
      templates, bindings, overrides,
    });
    expect(result[0]!.items).toHaveLength(1);
    expect(result[0]!.items[0]!.name).toBe("Tests");
  });

  it("applies override: disables template entirely", () => {
    const tpl = templates.create({ name: "Pre-Landing", items: [testItem] });
    bindings.create({ templateId: tpl.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    overrides.set({
      craftCallsign: "ATC-1", templateId: tpl.id, event: LifecycleEvent.BeforeLandingCheck,
      disableTemplate: true,
    });
    const result = resolveChecklist({
      craftCallsign: "ATC-1", craftCategory: "feature", event: LifecycleEvent.BeforeLandingCheck,
      templates, bindings, overrides,
    });
    expect(result).toHaveLength(0);
  });

  it("handles multiple templates bound to same event", () => {
    const tpl1 = templates.create({ name: "Tests", items: [testItem] });
    const tpl2 = templates.create({ name: "Lint", items: [lintItem] });
    bindings.create({ templateId: tpl1.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    bindings.create({ templateId: tpl2.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    const result = resolveChecklist({
      craftCallsign: "ATC-1", craftCategory: "feature", event: LifecycleEvent.BeforeLandingCheck,
      templates, bindings, overrides,
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.templateName).toBe("Tests");
    expect(result[1]!.templateName).toBe("Lint");
  });
});
