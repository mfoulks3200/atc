import { describe, it, expect, beforeEach } from "vitest";
import { createBindingRegistry } from "./bindings.js";
import { LifecycleEvent } from "@atc/types";

describe("createBindingRegistry", () => {
  let registry: ReturnType<typeof createBindingRegistry>;

  beforeEach(() => {
    registry = createBindingRegistry();
  });

  it("creates a binding", () => {
    const binding = registry.create({
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });
    expect(binding.templateId).toBe("tpl-1");
    expect(binding.event).toBe(LifecycleEvent.BeforeLandingCheck);
    expect(binding.craftCategory).toBe("feature");
  });

  it("finds bindings by event and category (exact match)", () => {
    registry.create({
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });
    registry.create({
      templateId: "tpl-2",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "hotfix",
    });
    registry.create({
      templateId: "tpl-3",
      event: LifecycleEvent.BeforeTakeoff,
      craftCategory: "feature",
    });
    const results = registry.findByEventAndCategory(LifecycleEvent.BeforeLandingCheck, "feature");
    expect(results).toHaveLength(1);
    expect(results[0]!.templateId).toBe("tpl-1");
  });

  it("includes wildcard category bindings", () => {
    registry.create({
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "*",
    });
    registry.create({
      templateId: "tpl-2",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });
    const results = registry.findByEventAndCategory(LifecycleEvent.BeforeLandingCheck, "feature");
    expect(results).toHaveLength(2);
  });

  it("returns empty array when no bindings match", () => {
    const results = registry.findByEventAndCategory(LifecycleEvent.BeforeTakeoff, "feature");
    expect(results).toHaveLength(0);
  });

  it("lists all bindings", () => {
    registry.create({
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });
    registry.create({
      templateId: "tpl-2",
      event: LifecycleEvent.BeforeTakeoff,
      craftCategory: "*",
    });
    expect(registry.list()).toHaveLength(2);
  });

  it("deletes a binding", () => {
    registry.create({
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });
    const deleted = registry.delete("tpl-1", LifecycleEvent.BeforeLandingCheck, "feature");
    expect(deleted).toBe(true);
    expect(registry.list()).toHaveLength(0);
  });

  it("returns false when deleting nonexistent binding", () => {
    expect(registry.delete("tpl-1", LifecycleEvent.BeforeTakeoff, "feature")).toBe(false);
  });
});
