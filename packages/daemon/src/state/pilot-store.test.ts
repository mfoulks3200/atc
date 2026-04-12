import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PilotStore } from "./pilot-store.js";

describe("PilotStore", () => {
  let stateDir: string;
  let store: PilotStore;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "atc-pilot-store-test-"));
    store = new PilotStore(stateDir);
  });

  afterEach(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  it("returns undefined for missing pilot", () => {
    expect(store.get("proj", "ghost")).toBeUndefined();
  });

  it("stores and retrieves a pilot", () => {
    const record = { identifier: "p1", certifications: ["backend"], mcpServers: {} };
    store.set("proj", record);
    expect(store.get("proj", "p1")).toEqual(record);
  });

  it("lists pilots for a project", () => {
    store.set("proj", { identifier: "p1", certifications: ["a"], mcpServers: {} });
    store.set("proj", { identifier: "p2", certifications: ["b"], mcpServers: {} });
    store.set("other", { identifier: "p3", certifications: ["c"], mcpServers: {} });

    expect(store.listForProject("proj")).toHaveLength(2);
    expect(store.listForProject("other")).toHaveLength(1);
    expect(store.listForProject("empty")).toEqual([]);
  });

  it("removes a pilot and returns true", () => {
    store.set("proj", { identifier: "p1", certifications: [], mcpServers: {} });
    expect(store.remove("proj", "p1")).toBe(true);
    expect(store.get("proj", "p1")).toBeUndefined();
  });

  it("returns false when removing a non-existent pilot", () => {
    expect(store.remove("proj", "ghost")).toBe(false);
  });

  it("returns false when removing from a non-existent project", () => {
    expect(store.remove("no-project", "ghost")).toBe(false);
  });

  it("persists and restores across save/load", async () => {
    store.set("proj-a", { identifier: "p1", certifications: ["x"], mcpServers: {} });
    store.set("proj-b", { identifier: "p2", certifications: ["y", "z"], mcpServers: {} });
    await store.save();

    const store2 = new PilotStore(stateDir);
    await store2.load();

    expect(store2.get("proj-a", "p1")?.certifications).toEqual(["x"]);
    expect(store2.get("proj-b", "p2")?.certifications).toEqual(["y", "z"]);
    expect(store2.listForProject("proj-a")).toHaveLength(1);
    expect(store2.listForProject("proj-b")).toHaveLength(1);
  });

  it("load on empty directory leaves store empty", async () => {
    await store.load();
    expect(store.listForProject("any")).toEqual([]);
  });

  it("overwrites a pilot on re-set", () => {
    store.set("proj", { identifier: "p1", certifications: ["a"], mcpServers: {} });
    store.set("proj", { identifier: "p1", certifications: ["b", "c"], mcpServers: {} });
    expect(store.get("proj", "p1")?.certifications).toEqual(["b", "c"]);
  });
});
