import { describe, it, expect } from "vitest";
import { ChecklistItemSeverity } from "./checklist.js";

describe("ChecklistItemSeverity", () => {
  it("defines required and advisory values", () => {
    expect(ChecklistItemSeverity.Required).toBe("required");
    expect(ChecklistItemSeverity.Advisory).toBe("advisory");
  });

  it("has exactly 2 values", () => {
    expect(Object.values(ChecklistItemSeverity)).toHaveLength(2);
  });
});
