import { describe, it, expect } from "vitest";
import { firstRunTour } from "./first-run";

describe("firstRunTour", () => {
  it("has id 'first-run'", () => {
    expect(firstRunTour.id).toBe("first-run");
  });

  it("has at least one step", () => {
    expect(firstRunTour.steps.length).toBeGreaterThan(0);
  });

  it("all steps have non-empty title and body", () => {
    for (const step of firstRunTour.steps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it("has unique step ids", () => {
    const ids = firstRunTour.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references the expected target ids", () => {
    const targets = firstRunTour.steps
      .map((s) => s.targetId)
      .filter((t): t is string => t !== null);
    expect(targets).toEqual([
      "sidebar-projects",
      "projects-new-button",
      "project-new-craft-button",
    ]);
  });
});
