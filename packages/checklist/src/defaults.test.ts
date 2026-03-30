import { describe, it, expect } from "vitest";
import { DEFAULT_LANDING_TEMPLATE } from "./defaults.js";
import { ChecklistItemSeverity } from "@atc/types";

describe("DEFAULT_LANDING_TEMPLATE", () => {
  it("has a name and 4 items", () => {
    expect(DEFAULT_LANDING_TEMPLATE.name).toBe("Default Landing Checklist");
    expect(DEFAULT_LANDING_TEMPLATE.items).toHaveLength(4);
  });

  it("has Tests, Lint, Build as required and Documentation as advisory", () => {
    const names = DEFAULT_LANDING_TEMPLATE.items.map((i) => i.name);
    expect(names).toEqual(["Tests", "Lint", "Documentation", "Build"]);
    expect(DEFAULT_LANDING_TEMPLATE.items[0]!.severity).toBe(ChecklistItemSeverity.Required);
    expect(DEFAULT_LANDING_TEMPLATE.items[1]!.severity).toBe(ChecklistItemSeverity.Required);
    expect(DEFAULT_LANDING_TEMPLATE.items[2]!.severity).toBe(ChecklistItemSeverity.Advisory);
    expect(DEFAULT_LANDING_TEMPLATE.items[3]!.severity).toBe(ChecklistItemSeverity.Required);
  });

  it("all items use shell executors", () => {
    for (const item of DEFAULT_LANDING_TEMPLATE.items) {
      expect(item.executor.type).toBe("shell");
    }
  });

  it("has an id", () => {
    expect(DEFAULT_LANDING_TEMPLATE.id).toBeDefined();
    expect(DEFAULT_LANDING_TEMPLATE.id).toBe("default-landing-checklist");
  });
});
