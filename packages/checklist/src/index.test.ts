import { describe, it, expect } from "vitest";
import {
  ChecklistItemSeverity,
  runChecklist,
  DEFAULT_LANDING_TEMPLATE,
  createTemplateRegistry,
  createBindingRegistry,
  createOverrideStore,
  resolveChecklist,
  executeShell,
  executeMcpTool,
} from "./index.js";

describe("@airtrafficcontrol/checklist package exports", () => {
  it("exports ChecklistItemSeverity enum", () => {
    expect(ChecklistItemSeverity.Required).toBe("required");
    expect(ChecklistItemSeverity.Advisory).toBe("advisory");
  });

  it("exports runChecklist as a function", () => {
    expect(typeof runChecklist).toBe("function");
  });

  it("exports DEFAULT_LANDING_TEMPLATE with items", () => {
    expect(DEFAULT_LANDING_TEMPLATE).toBeDefined();
    expect(typeof DEFAULT_LANDING_TEMPLATE.id).toBe("string");
    expect(DEFAULT_LANDING_TEMPLATE.items.length).toBeGreaterThan(0);
  });

  it("exports createTemplateRegistry as a factory function", () => {
    expect(typeof createTemplateRegistry).toBe("function");
    const registry = createTemplateRegistry();
    expect(typeof registry.get).toBe("function");
  });

  it("exports createBindingRegistry as a factory function", () => {
    expect(typeof createBindingRegistry).toBe("function");
    const registry = createBindingRegistry();
    expect(typeof registry.findByEventAndCategory).toBe("function");
  });

  it("exports createOverrideStore as a factory function", () => {
    expect(typeof createOverrideStore).toBe("function");
    const store = createOverrideStore();
    expect(typeof store.get).toBe("function");
  });

  it("exports resolveChecklist as a function", () => {
    expect(typeof resolveChecklist).toBe("function");
  });

  it("exports executeShell as a function", () => {
    expect(typeof executeShell).toBe("function");
  });

  it("exports executeMcpTool as a function", () => {
    expect(typeof executeMcpTool).toBe("function");
  });
});
