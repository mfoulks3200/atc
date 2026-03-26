import { describe, it, expect } from "vitest";
import { createDefaultChecklist } from "./defaults.js";
import { runChecklist } from "./runner.js";

describe("createDefaultChecklist", () => {
  it("returns exactly 4 default checklist items", () => {
    const items = createDefaultChecklist();

    expect(items).toHaveLength(4);
  });

  it("includes Tests, Lint, Documentation, and Build items (RULE-LCHK-4)", () => {
    const items = createDefaultChecklist();
    const names = items.map((i) => i.name);

    expect(names).toEqual(["Tests", "Lint", "Documentation", "Build"]);
  });

  it("all default items pass (placeholder validators)", async () => {
    const items = createDefaultChecklist();
    const result = await runChecklist(items);

    expect(result.passed).toBe(true);
    expect(result.failedItems).toHaveLength(0);
  });

  it("each item result name matches the item name", async () => {
    const items = createDefaultChecklist();

    for (const item of items) {
      const result = await item.validate();
      expect(result.name).toBe(item.name);
      expect(result.passed).toBe(true);
    }
  });

  it("returns a frozen array", () => {
    const items = createDefaultChecklist();

    expect(Object.isFrozen(items)).toBe(true);
  });
});
