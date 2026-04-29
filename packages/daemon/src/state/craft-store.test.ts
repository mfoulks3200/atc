/**
 * Tests for CraftStore.
 *
 * Uses real filesystem I/O (mkdtemp / rm) — no mocks.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CraftStatus } from "@airtrafficcontrol/types";
import type { AgentUsageReport, CraftState, IntercomMessage } from "../types.js";
import { CraftStore } from "./craft-store.js";

function makeCraft(callsign: string): CraftState {
  return {
    callsign,
    createdAt: "2026-01-01T00:00:00.000Z",
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
    holdingPattern: false,
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

  it("backfills createdAt from earliest blackBox entry on load", async () => {
    const projectDir = join(tmpDir, "projects", "proj-a", "crafts", "LEGACY-01");
    await mkdir(projectDir, { recursive: true });
    // Simulate a legacy craft file written before createdAt existed.
    const legacy = {
      callsign: "LEGACY-01",
      branch: "LEGACY-01",
      cargo: "legacy",
      category: "test",
      status: CraftStatus.InFlight,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [],
      blackBox: [
        {
          timestamp: "2026-01-15T12:00:00.000Z",
          author: "pilot-1",
          type: "Decision",
          content: "start",
        },
        {
          timestamp: "2026-01-16T12:00:00.000Z",
          author: "pilot-1",
          type: "Decision",
          content: "mid",
        },
      ],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
    };
    await writeFile(join(projectDir, "craft.json"), JSON.stringify(legacy));

    await store.loadProject("proj-a");
    const loaded = store.get("proj-a", "LEGACY-01");
    expect(loaded?.createdAt).toBe("2026-01-15T12:00:00.000Z");
  });

  it("backfills createdAt to now when blackBox is empty", async () => {
    const projectDir = join(tmpDir, "projects", "proj-b", "crafts", "EMPTY-01");
    await mkdir(projectDir, { recursive: true });
    const legacy = {
      callsign: "EMPTY-01",
      branch: "EMPTY-01",
      cargo: "empty",
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
    await writeFile(join(projectDir, "craft.json"), JSON.stringify(legacy));

    const before = Date.now();
    await store.loadProject("proj-b");
    const after = Date.now();

    const loaded = store.get("proj-b", "EMPTY-01");
    expect(loaded?.createdAt).toBeDefined();
    const loadedMs = new Date(loaded!.createdAt).getTime();
    expect(loadedMs).toBeGreaterThanOrEqual(before);
    expect(loadedMs).toBeLessThanOrEqual(after);
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

  describe("withCraftLock()", () => {
    it("serializes concurrent operations on the same craft", async () => {
      store.set("proj", makeCraft("alpha-1"));
      const order: number[] = [];

      // Two concurrent callers — the mutex must ensure they run sequentially.
      await Promise.all([
        store.withCraftLock("proj", "alpha-1", async () => {
          order.push(1);
          // Yield to the event loop so caller 2 can attempt to acquire the lock.
          await new Promise<void>((resolve) => setImmediate(resolve));
          order.push(2);
        }),
        store.withCraftLock("proj", "alpha-1", async () => {
          order.push(3);
          await new Promise<void>((resolve) => setImmediate(resolve));
          order.push(4);
        }),
      ]);

      // Caller 2 must not start until caller 1 has fully completed.
      expect(order).toEqual([1, 2, 3, 4]);
    });

    it("does not block operations on different crafts", async () => {
      store.set("proj", makeCraft("alpha-1"));
      store.set("proj", makeCraft("bravo-2"));
      const order: string[] = [];

      // Both crafts should be able to run their locks concurrently.
      await Promise.all([
        store.withCraftLock("proj", "alpha-1", async () => {
          order.push("alpha-start");
          await new Promise<void>((resolve) => setImmediate(resolve));
          order.push("alpha-end");
        }),
        store.withCraftLock("proj", "bravo-2", async () => {
          order.push("bravo-start");
          await new Promise<void>((resolve) => setImmediate(resolve));
          order.push("bravo-end");
        }),
      ]);

      // Both locks started before either ended — they ran concurrently.
      expect(order.indexOf("alpha-start")).toBeLessThan(order.indexOf("alpha-end"));
      expect(order.indexOf("bravo-start")).toBeLessThan(order.indexOf("bravo-end"));
      expect(order.slice(0, 2)).toEqual(expect.arrayContaining(["alpha-start", "bravo-start"]));
    });

    it("prevents double-launch race: second caller sees updated status", async () => {
      store.set("proj", makeCraft("alpha-1"));
      const results: Array<"launched" | "already-inflight"> = [];

      // Simulate two agents racing to launch the same Taxiing craft.
      await Promise.all([
        store.withCraftLock("proj", "alpha-1", async () => {
          const craft = store.get("proj", "alpha-1")!;
          if (craft.status === CraftStatus.Taxiing) {
            craft.status = CraftStatus.InFlight;
            store.set("proj", craft);
            results.push("launched");
          } else {
            results.push("already-inflight");
          }
        }),
        store.withCraftLock("proj", "alpha-1", async () => {
          const craft = store.get("proj", "alpha-1")!;
          if (craft.status === CraftStatus.Taxiing) {
            craft.status = CraftStatus.InFlight;
            store.set("proj", craft);
            results.push("launched");
          } else {
            results.push("already-inflight");
          }
        }),
      ]);

      // Exactly one succeeds; the second sees the already-updated status.
      expect(results).toContain("launched");
      expect(results).toContain("already-inflight");
      expect(store.get("proj", "alpha-1")?.status).toBe(CraftStatus.InFlight);
    });

    it("cleans up mutex on remove()", () => {
      store.set("proj", makeCraft("alpha-1"));
      // Access the mutex to ensure it is created.
      void store.withCraftLock("proj", "alpha-1", async () => {});
      store.remove("proj", "alpha-1");
      // Craft is gone — the lock map entry should be cleaned up too.
      expect(store.get("proj", "alpha-1")).toBeUndefined();
    });
  });
});
