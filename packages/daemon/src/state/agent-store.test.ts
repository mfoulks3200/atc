/**
 * Tests for AgentStore.
 *
 * Uses real filesystem I/O (mkdtemp / rm) — no mocks.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentRecord } from "../types.js";
import { AgentStore } from "./agent-store.js";

function makeAgent(id: string, callsign: string): AgentRecord {
  return {
    id,
    adapterType: "mock",
    projectName: "my-project",
    callsign,
    status: "running",
    adapterMeta: {},
  };
}

describe("AgentStore", () => {
  let tmpDir: string;
  let store: AgentStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "atc-agent-store-test-"));
    store = new AgentStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined for an unknown id", () => {
    expect(store.get("not-real")).toBeUndefined();
  });

  it("stores and retrieves a record by id", () => {
    const agent = makeAgent("agent-1", "alpha-1");
    store.set(agent);
    expect(store.get("agent-1")).toEqual(agent);
  });

  it("list() returns all stored records", () => {
    store.set(makeAgent("a1", "alpha-1"));
    store.set(makeAgent("a2", "bravo-2"));
    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.id)).toEqual(expect.arrayContaining(["a1", "a2"]));
  });

  it("remove() deletes the record", () => {
    store.set(makeAgent("a1", "alpha-1"));
    store.remove("a1");
    expect(store.get("a1")).toBeUndefined();
    expect(store.list()).toHaveLength(0);
  });

  it("remove() is a no-op for unknown id", () => {
    expect(() => store.remove("ghost")).not.toThrow();
  });

  it("updateStatus() changes status in-place", () => {
    store.set(makeAgent("a1", "alpha-1"));
    store.updateStatus("a1", "paused");
    expect(store.get("a1")?.status).toBe("paused");
  });

  it("updateStatus() is a no-op for unknown id", () => {
    expect(() => store.updateStatus("ghost", "terminated")).not.toThrow();
  });

  it("persists and reloads records via save() + load()", async () => {
    store.set(makeAgent("a1", "alpha-1"));
    store.set(makeAgent("a2", "bravo-2"));
    await store.save();

    const store2 = new AgentStore(tmpDir);
    await store2.load();

    expect(store2.list()).toHaveLength(2);
    expect(store2.get("a1")?.callsign).toBe("alpha-1");
    expect(store2.get("a2")?.callsign).toBe("bravo-2");
  });

  it("load() succeeds with empty store when file does not exist", async () => {
    const freshStore = new AgentStore(join(tmpDir, "nonexistent"));
    await expect(freshStore.load()).resolves.not.toThrow();
    expect(freshStore.list()).toHaveLength(0);
  });
});
