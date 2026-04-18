import { describe, it, expect, beforeEach } from "vitest";
import { loadTours, saveTourRecord, clearTourRecord, STORAGE_KEY } from "./persistence";

describe("spotlight persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty object when no record exists", () => {
    expect(loadTours()).toEqual({});
  });

  it("returns empty object when JSON is malformed", () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    expect(loadTours()).toEqual({});
  });

  it("persists a tour record", () => {
    saveTourRecord("first-run", "completed");
    const tours = loadTours();
    expect(tours["first-run"]?.status).toBe("completed");
    expect(tours["first-run"]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("overwrites an existing record", () => {
    saveTourRecord("first-run", "dismissed");
    saveTourRecord("first-run", "completed");
    expect(loadTours()["first-run"]?.status).toBe("completed");
  });

  it("clears a specific tour", () => {
    saveTourRecord("first-run", "completed");
    saveTourRecord("intro-crafts", "dismissed");
    clearTourRecord("first-run");
    expect(loadTours()["first-run"]).toBeUndefined();
    expect(loadTours()["intro-crafts"]?.status).toBe("dismissed");
  });

  it("survives localStorage write failures without throwing", () => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => saveTourRecord("first-run", "completed")).not.toThrow();
    Storage.prototype.setItem = originalSetItem;
  });
});
