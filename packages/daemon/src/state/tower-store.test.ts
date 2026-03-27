/**
 * Tests for TowerStore.
 *
 * Uses real filesystem I/O (mkdtemp / rm) — no mocks.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TowerStore } from "./tower-store.js";

describe("TowerStore", () => {
  let tmpDir: string;
  let store: TowerStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "atc-tower-store-test-"));
    store = new TowerStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for unknown project", () => {
    expect(store.getQueue("ghost-project")).toEqual([]);
  });

  it("enqueue() adds an entry with a callsign and timestamp", () => {
    const before = Date.now();
    store.enqueue("proj", "alpha-1");
    const after = Date.now();

    const queue = store.getQueue("proj");
    expect(queue).toHaveLength(1);
    expect(queue[0].callsign).toBe("alpha-1");

    const ts = new Date(queue[0].requestedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("enqueue() preserves FCFS order", () => {
    store.enqueue("proj", "alpha-1");
    store.enqueue("proj", "bravo-2");
    store.enqueue("proj", "charlie-3");

    const queue = store.getQueue("proj");
    expect(queue.map((e) => e.callsign)).toEqual(["alpha-1", "bravo-2", "charlie-3"]);
  });

  it("dequeue() removes the entry by callsign", () => {
    store.enqueue("proj", "alpha-1");
    store.enqueue("proj", "bravo-2");
    store.dequeue("proj", "alpha-1");

    const queue = store.getQueue("proj");
    expect(queue).toHaveLength(1);
    expect(queue[0].callsign).toBe("bravo-2");
  });

  it("dequeue() is a no-op for unknown callsign", () => {
    store.enqueue("proj", "alpha-1");
    expect(() => store.dequeue("proj", "ghost")).not.toThrow();
    expect(store.getQueue("proj")).toHaveLength(1);
  });

  it("dequeue() is a no-op for unknown project", () => {
    expect(() => store.dequeue("ghost-project", "alpha-1")).not.toThrow();
  });

  it("save() + load() round-trips the queue", async () => {
    store.enqueue("proj", "alpha-1");
    store.enqueue("proj", "bravo-2");
    await store.save("proj");

    const store2 = new TowerStore(tmpDir);
    await store2.load("proj");

    const queue = store2.getQueue("proj");
    expect(queue).toHaveLength(2);
    expect(queue[0].callsign).toBe("alpha-1");
    expect(queue[1].callsign).toBe("bravo-2");
  });

  it("load() succeeds when file does not exist", async () => {
    const store2 = new TowerStore(join(tmpDir, "nonexistent"));
    await expect(store2.load("proj")).resolves.not.toThrow();
    expect(store2.getQueue("proj")).toEqual([]);
  });
});
