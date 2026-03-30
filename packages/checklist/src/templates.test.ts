import { describe, it, expect, beforeEach } from "vitest";
import { createTemplateRegistry } from "./templates.js";
import { ChecklistItemSeverity } from "@atc/types";
import type { ChecklistItemDef } from "@atc/types";

const testItem: ChecklistItemDef = {
  name: "Run Tests",
  severity: ChecklistItemSeverity.Required,
  executor: { type: "shell", command: "pnpm run test" },
};

describe("createTemplateRegistry", () => {
  let registry: ReturnType<typeof createTemplateRegistry>;

  beforeEach(() => {
    registry = createTemplateRegistry();
  });

  it("creates a template and returns it with an id", () => {
    const template = registry.create({ name: "Pre-Landing", items: [testItem] });
    expect(template.id).toBeDefined();
    expect(template.name).toBe("Pre-Landing");
    expect(template.items).toHaveLength(1);
    expect(template.items[0]!.name).toBe("Run Tests");
  });

  it("retrieves a template by id", () => {
    const created = registry.create({ name: "Pre-Landing", items: [testItem] });
    const fetched = registry.get(created.id);
    expect(fetched).toEqual(created);
  });

  it("returns undefined for unknown id", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("lists all templates", () => {
    registry.create({ name: "A", items: [testItem] });
    registry.create({ name: "B", items: [testItem] });
    expect(registry.list()).toHaveLength(2);
  });

  it("deletes a template by id", () => {
    const created = registry.create({ name: "A", items: [testItem] });
    const deleted = registry.delete(created.id);
    expect(deleted).toBe(true);
    expect(registry.get(created.id)).toBeUndefined();
    expect(registry.list()).toHaveLength(0);
  });

  it("returns false when deleting unknown id", () => {
    expect(registry.delete("nonexistent")).toBe(false);
  });

  it("updates a template", () => {
    const created = registry.create({ name: "A", items: [testItem] });
    const updated = registry.update(created.id, { name: "B" });
    expect(updated?.name).toBe("B");
    expect(updated?.items).toEqual(created.items);
    expect(registry.get(created.id)?.name).toBe("B");
  });

  it("returns undefined when updating unknown id", () => {
    expect(registry.update("nonexistent", { name: "B" })).toBeUndefined();
  });
});
