import { describe, it, expect } from "vitest";
import { BlackBoxEntryType } from "@atc/types";
import { createBlackBoxEntry, appendToBlackBox } from "./black-box.js";

describe("createBlackBoxEntry", () => {
  it("creates an entry with the correct author, type, and content", () => {
    const entry = createBlackBoxEntry(
      "pilot-1",
      BlackBoxEntryType.Decision,
      "Chose REST over GraphQL for the API layer.",
    );

    expect(entry.author).toBe("pilot-1");
    expect(entry.type).toBe(BlackBoxEntryType.Decision);
    expect(entry.content).toBe("Chose REST over GraphQL for the API layer.");
  });

  it("sets a timestamp at creation time", () => {
    const before = new Date();
    const entry = createBlackBoxEntry(
      "pilot-1",
      BlackBoxEntryType.Observation,
      "Noted a potential race condition.",
    );
    const after = new Date();

    expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("creates entries for all BlackBoxEntryType values", () => {
    for (const entryType of Object.values(BlackBoxEntryType)) {
      const entry = createBlackBoxEntry("pilot-1", entryType, "test content");
      expect(entry.type).toBe(entryType);
    }
  });
});

describe("appendToBlackBox", () => {
  it("returns a new array with the entry appended", () => {
    const entry1 = createBlackBoxEntry("pilot-1", BlackBoxEntryType.Decision, "First entry.");
    const entry2 = createBlackBoxEntry("pilot-2", BlackBoxEntryType.Observation, "Second entry.");

    const box1 = appendToBlackBox([], entry1);
    expect(box1).toHaveLength(1);
    expect(box1[0]).toBe(entry1);

    const box2 = appendToBlackBox(box1, entry2);
    expect(box2).toHaveLength(2);
    expect(box2[0]).toBe(entry1);
    expect(box2[1]).toBe(entry2);
  });

  it("does not mutate the original black box array (RULE-BBOX-2)", () => {
    const entry = createBlackBoxEntry("pilot-1", BlackBoxEntryType.Decision, "Immutability check.");
    const original: readonly ReturnType<typeof createBlackBoxEntry>[] = [];
    const updated = appendToBlackBox(original, entry);

    expect(original).toHaveLength(0);
    expect(updated).toHaveLength(1);
    expect(updated).not.toBe(original);
  });

  it("preserves all existing entries in order (RULE-BBOX-2)", () => {
    const entries = [
      createBlackBoxEntry("p1", BlackBoxEntryType.Decision, "A"),
      createBlackBoxEntry("p2", BlackBoxEntryType.Observation, "B"),
      createBlackBoxEntry("p3", BlackBoxEntryType.Conflict, "C"),
    ];

    let box: readonly ReturnType<typeof createBlackBoxEntry>[] = [];
    for (const entry of entries) {
      box = appendToBlackBox(box, entry);
    }

    expect(box).toHaveLength(3);
    expect(box[0].content).toBe("A");
    expect(box[1].content).toBe("B");
    expect(box[2].content).toBe("C");
  });
});
