import { describe, it, expect } from "vitest";
import { createChecklistItem, runChecklist } from "./runner.js";
import type { ChecklistItemResult } from "./types.js";

// ---------------------------------------------------------------------------
// createChecklistItem
// ---------------------------------------------------------------------------

describe("createChecklistItem", () => {
  it("returns a ChecklistItem with the given name and validate function", async () => {
    const result: ChecklistItemResult = { name: "Test", passed: true };
    const item = createChecklistItem("Test", async () => result);

    expect(item.name).toBe("Test");
    expect(await item.validate()).toBe(result);
  });
});

// ---------------------------------------------------------------------------
// runChecklist
// ---------------------------------------------------------------------------

describe("runChecklist", () => {
  it("returns passed: true when all items pass (RULE-LCHK-2)", async () => {
    const items = [
      createChecklistItem("A", async () => ({ name: "A", passed: true })),
      createChecklistItem("B", async () => ({ name: "B", passed: true })),
    ];

    const result = await runChecklist(items);

    expect(result.passed).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.failedItems).toHaveLength(0);
  });

  it("returns passed: false when any item fails (RULE-LCHK-2)", async () => {
    const items = [
      createChecklistItem("A", async () => ({ name: "A", passed: true })),
      createChecklistItem("B", async () => ({
        name: "B",
        passed: false,
        message: "lint errors found",
      })),
    ];

    const result = await runChecklist(items);

    expect(result.passed).toBe(false);
    expect(result.items).toHaveLength(2);
    expect(result.failedItems).toHaveLength(1);
    expect(result.failedItems[0]!.name).toBe("B");
    expect(result.failedItems[0]!.message).toBe("lint errors found");
  });

  it("returns passed: false when ALL items fail", async () => {
    const items = [
      createChecklistItem("A", async () => ({ name: "A", passed: false })),
      createChecklistItem("B", async () => ({ name: "B", passed: false })),
    ];

    const result = await runChecklist(items);

    expect(result.passed).toBe(false);
    expect(result.failedItems).toHaveLength(2);
  });

  it("preserves execution order in items array", async () => {
    const items = [
      createChecklistItem("First", async () => ({
        name: "First",
        passed: true,
      })),
      createChecklistItem("Second", async () => ({
        name: "Second",
        passed: true,
      })),
      createChecklistItem("Third", async () => ({
        name: "Third",
        passed: false,
      })),
    ];

    const result = await runChecklist(items);

    expect(result.items.map((i) => i.name)).toEqual(["First", "Second", "Third"]);
  });

  it("throws ChecklistError when items array is empty", async () => {
    await expect(runChecklist([])).rejects.toThrow("Checklist must contain at least one item");
  });

  it("runs all items even if early ones fail (collects all results)", async () => {
    const calls: string[] = [];
    const items = [
      createChecklistItem("A", async () => {
        calls.push("A");
        return { name: "A", passed: false };
      }),
      createChecklistItem("B", async () => {
        calls.push("B");
        return { name: "B", passed: true };
      }),
    ];

    const result = await runChecklist(items);

    expect(calls).toEqual(["A", "B"]);
    expect(result.items).toHaveLength(2);
    expect(result.failedItems).toHaveLength(1);
  });
});
