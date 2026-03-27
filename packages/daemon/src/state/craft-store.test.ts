/**
 * Tests for CraftStore.
 *
 * Uses real filesystem I/O (mkdtemp / rm) — no mocks.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CraftStatus } from "@atc/types";
import type { AgentUsageReport, CraftState, IntercomMessage } from "../types.js";
import { CraftStore } from "./craft-store.js";

function makeCraft(callsign: string): CraftState {
  return {
    callsign,
    branch: callsign,
    cargo: "test cargo",
    category: "test",
    status: CraftStatus.Taxiing,
    captain: "pilot-1",
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "pilot-1" },
  };
}

function makeUsageReport(callsign: string): AgentUsageReport {
  return {
    agentId: "agent-1",
    callsign,
    timestamp: new Date().toISOString(),
    tokens: { input: 100, output: 50 },
    tools: [],
    skills: [],
    duration: 1000,
  };
}

describe("CraftStore", () => {
  let tmpDir: string;
  let store: CraftStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "atc-craft-store-test-"));
    store = new CraftStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined for unknown project/callsign", () => {
    expect(store.get("no-project", "no-callsign")).toBeUndefined();
  });

  it("stores and retrieves a craft by project and callsign", () => {
    const craft = makeCraft("alpha-1");
    store.set("my-project", craft);
    expect(store.get("my-project", "alpha-1")).toEqual(craft);
  });

  it("listForProject() returns all crafts for the project", () => {
    store.set("proj", makeCraft("alpha-1"));
    store.set("proj", makeCraft("bravo-2"));
    const list = store.listForProject("proj");
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.callsign)).toEqual(expect.arrayContaining(["alpha-1", "bravo-2"]));
  });

  it("listForProject() returns empty array for unknown project", () => {
    expect(store.listForProject("ghost-project")).toEqual([]);
  });

  it("remove() deletes the craft", () => {
    store.set("proj", makeCraft("alpha-1"));
    store.remove("proj", "alpha-1");
    expect(store.get("proj", "alpha-1")).toBeUndefined();
    expect(store.listForProject("proj")).toHaveLength(0);
  });

  it("remove() is a no-op for unknown craft", () => {
    expect(() => store.remove("proj", "ghost")).not.toThrow();
  });

  it("appendIntercom() pushes a message onto the intercom array", () => {
    store.set("proj", makeCraft("alpha-1"));
    const msg: IntercomMessage = {
      from: "pilot-1",
      seat: "captain",
      content: "hello",
      timestamp: new Date().toISOString(),
    };
    store.appendIntercom("proj", "alpha-1", msg);
    expect(store.get("proj", "alpha-1")?.intercom).toHaveLength(1);
    expect(store.get("proj", "alpha-1")?.intercom[0]).toEqual(msg);
  });

  it("appendIntercom() is a no-op for unknown craft", () => {
    const msg: IntercomMessage = {
      from: "pilot-1",
      seat: "captain",
      content: "hello",
      timestamp: new Date().toISOString(),
    };
    expect(() => store.appendIntercom("proj", "ghost", msg)).not.toThrow();
  });

  it("save() + loadProject() round-trips a craft", async () => {
    const craft = makeCraft("alpha-1");
    store.set("proj", craft);
    await store.save("proj", "alpha-1");

    const store2 = new CraftStore(tmpDir);
    await store2.loadProject("proj");

    expect(store2.get("proj", "alpha-1")).toEqual(craft);
  });

  it("saveAll() + loadProject() round-trips multiple crafts", async () => {
    store.set("proj", makeCraft("alpha-1"));
    store.set("proj", makeCraft("bravo-2"));
    await store.saveAll();

    const store2 = new CraftStore(tmpDir);
    await store2.loadProject("proj");

    expect(store2.listForProject("proj")).toHaveLength(2);
  });

  it("loadProject() succeeds when directory does not exist", async () => {
    const store2 = new CraftStore(join(tmpDir, "nonexistent"));
    await expect(store2.loadProject("proj")).resolves.not.toThrow();
    expect(store2.listForProject("proj")).toHaveLength(0);
  });

  it("appendUsageReport() writes a JSON line to usage.json", async () => {
    store.set("proj", makeCraft("alpha-1"));
    const report = makeUsageReport("alpha-1");
    await store.appendUsageReport("proj", "alpha-1", report);
    await store.appendUsageReport("proj", "alpha-1", report);

    const usagePath = join(tmpDir, "projects", "proj", "crafts", "alpha-1", "usage.json");
    const raw = await readFile(usagePath, "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(report);
  });
});
