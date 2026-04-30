import { describe, it, expect, beforeEach } from "vitest";
import { createBindingRegistry } from "./bindings.js";
import { LifecycleEvent } from "@airtrafficcontrol/types";

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

  describe("vectorName filtering (RULE-CHKL-10)", () => {
    it("returns vector-scoped binding when vectorName matches", () => {
      registry.create({
        templateId: "tpl-1",
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Code Review",
      });
      const results = registry.findByEventAndCategory(
        LifecycleEvent.BeforeVectorComplete,
        "feature",
        "Code Review",
      );
      expect(results).toHaveLength(1);
      expect(results[0]!.templateId).toBe("tpl-1");
    });

    it("excludes vector-scoped binding when vectorName does not match", () => {
      registry.create({
        templateId: "tpl-1",
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Code Review",
      });
      const results = registry.findByEventAndCategory(
        LifecycleEvent.BeforeVectorComplete,
        "feature",
        "Integration Tests",
      );
      expect(results).toHaveLength(0);
    });

    it("includes unscoped binding for any vectorName (RULE-CHKL-10)", () => {
      registry.create({
        templateId: "tpl-global",
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
      });
      registry.create({
        templateId: "tpl-scoped",
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Code Review",
      });
      const results = registry.findByEventAndCategory(
        LifecycleEvent.BeforeVectorComplete,
        "feature",
        "Code Review",
      );
      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.templateId);
      expect(ids).toContain("tpl-global");
      expect(ids).toContain("tpl-scoped");
    });

    it("unscoped query returns all bindings including scoped ones", () => {
      registry.create({
        templateId: "tpl-global",
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
      });
      registry.create({
        templateId: "tpl-scoped",
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Code Review",
      });
      // No vectorName in query — returns all
      const results = registry.findByEventAndCategory(
        LifecycleEvent.BeforeVectorComplete,
        "feature",
      );
      expect(results).toHaveLength(2);
    });

    it("vectorName is ignored for non-vector events (RULE-CHKL-10)", () => {
      registry.create({
        templateId: "tpl-1",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCategory: "feature",
        vectorName: "Code Review",
      });
      const results = registry.findByEventAndCategory(
        LifecycleEvent.BeforeLandingCheck,
        "feature",
        "anything",
      );
      // vectorName on a non-vector event binding is ignored — binding should be returned
      expect(results).toHaveLength(1);
    });

    it("multiple scoped bindings for the same vector (RULE-CHKL-11)", () => {
      registry.create({
        templateId: "security-scan",
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Code Review",
      });
      registry.create({
        templateId: "lint",
        event: LifecycleEvent.BeforeVectorComplete,
        craftCategory: "feature",
        vectorName: "Code Review",
      });
      const results = registry.findByEventAndCategory(
        LifecycleEvent.BeforeVectorComplete,
        "feature",
        "Code Review",
      );
      expect(results).toHaveLength(2);
    });

    it("works for after:vector-complete too (RULE-CHKL-10)", () => {
      registry.create({
        templateId: "tpl-1",
        event: LifecycleEvent.AfterVectorComplete,
        craftCategory: "feature",
        vectorName: "Deploy",
      });
      const hitResults = registry.findByEventAndCategory(
        LifecycleEvent.AfterVectorComplete,
        "feature",
        "Deploy",
      );
      const missResults = registry.findByEventAndCategory(
        LifecycleEvent.AfterVectorComplete,
        "feature",
        "Other",
      );
      expect(hitResults).toHaveLength(1);
      expect(missResults).toHaveLength(0);
    });
  });
});
