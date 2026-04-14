import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentAdapter, AgentHandle, AgentLaunchOptions } from "../adapters/adapter.js";
import { AdapterRegistry } from "../adapters/registry.js";
import { AgentStore } from "../state/agent-store.js";
import type { AgentRecord } from "../types.js";
import { AgentManager } from "./agent-manager.js";

function makeAdapter(overrides: Partial<AgentAdapter> = {}): AgentAdapter {
  return {
    launch: vi.fn(async (opts: AgentLaunchOptions): Promise<AgentHandle> => ({
      agentId: opts.agentId,
      pid: 12345,
      adapterMeta: { session: "sess-1" },
    })),
    pause: vi.fn(),
    resume: vi.fn(),
    terminate: vi.fn(),
    isAlive: vi.fn(),
    sendMessage: vi.fn(),
    onMessage: vi.fn(),
    onStatusChange: vi.fn(),
    onUsageReport: vi.fn(),
    ...overrides,
  };
}

function baseLaunchOptions(agentId: string): AgentLaunchOptions {
  return {
    agentId,
    worktreePath: "/tmp/wt",
    craft: {
      callsign: "WHISKEY",
      createdAt: "2025-01-01T00:00:00Z",
      branch: "whiskey",
      cargo: "do the thing",
      category: "backend",
      status: "Taxiing" as never,
      captain: "alice",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "alice" },
      holdingPattern: false,
    },
    systemPrompt: "hi",
    intercomHistory: [],
    adapterConfig: {},
    mcpServers: {},
  };
}

describe("AgentManager", () => {
  let stateDir: string;
  let agentStore: AgentStore;
  let registry: AdapterRegistry;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "atc-agent-manager-"));
    agentStore = new AgentStore(stateDir);
    registry = new AdapterRegistry();
  });

  afterEach(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  describe("launch", () => {
    it("delegates to the adapter and stores the record", async () => {
      const adapter = makeAdapter();
      registry.register("claude-agent-sdk", adapter);
      const manager = new AgentManager({
        adapterRegistry: registry,
        agentStore,
        isProcessAlive: () => true,
      });

      const record = await manager.launch({
        agentId: "a1",
        adapterType: "claude-agent-sdk",
        projectName: "proj",
        callsign: "WHISKEY",
        launchOptions: baseLaunchOptions("a1"),
      });

      expect(adapter.launch).toHaveBeenCalledOnce();
      expect(record.id).toBe("a1");
      expect(record.pid).toBe(12345);
      expect(record.status).toBe("running");
      expect(record.adapterMeta).toEqual({ session: "sess-1" });
      expect(agentStore.get("a1")).toEqual(record);
      expect(manager.getHandle("a1")?.pid).toBe(12345);
    });

    it("throws when the adapter type is not registered", async () => {
      const manager = new AgentManager({ adapterRegistry: registry, agentStore });
      await expect(
        manager.launch({
          agentId: "a1",
          adapterType: "missing",
          projectName: "proj",
          callsign: "WHISKEY",
          launchOptions: baseLaunchOptions("a1"),
        }),
      ).rejects.toThrow(/No adapter registered/);
    });
  });

  describe("stop", () => {
    it("calls adapter.terminate and marks the record terminated", async () => {
      const adapter = makeAdapter();
      registry.register("claude-agent-sdk", adapter);
      const manager = new AgentManager({ adapterRegistry: registry, agentStore });

      await manager.launch({
        agentId: "a1",
        adapterType: "claude-agent-sdk",
        projectName: "proj",
        callsign: "WHISKEY",
        launchOptions: baseLaunchOptions("a1"),
      });
      await manager.stop("a1");

      expect(adapter.terminate).toHaveBeenCalledOnce();
      expect(agentStore.get("a1")?.status).toBe("terminated");
      expect(manager.getHandle("a1")).toBeUndefined();
    });

    it("no-ops when agent id is unknown", async () => {
      const manager = new AgentManager({ adapterRegistry: registry, agentStore });
      await expect(manager.stop("ghost")).resolves.toBeUndefined();
    });
  });

  describe("reap", () => {
    it("marks dead agents terminated and leaves live ones alone", async () => {
      const adapter = makeAdapter({
        launch: vi.fn(async (opts: AgentLaunchOptions) => ({
          agentId: opts.agentId,
          pid: opts.agentId === "alive" ? 1 : 2,
          adapterMeta: {},
        })),
      });
      registry.register("claude-agent-sdk", adapter);

      const manager = new AgentManager({
        adapterRegistry: registry,
        agentStore,
        isProcessAlive: (pid) => pid === 1,
      });

      await manager.launch({
        agentId: "alive",
        adapterType: "claude-agent-sdk",
        projectName: "proj",
        callsign: "ALPHA",
        launchOptions: baseLaunchOptions("alive"),
      });
      await manager.launch({
        agentId: "dead",
        adapterType: "claude-agent-sdk",
        projectName: "proj",
        callsign: "DELTA",
        launchOptions: baseLaunchOptions("dead"),
      });

      const reaped = manager.reap();
      expect(reaped).toEqual(["dead"]);
      expect(agentStore.get("alive")?.status).toBe("running");
      expect(agentStore.get("dead")?.status).toBe("terminated");
      expect(manager.getHandle("alive")).toBeDefined();
      expect(manager.getHandle("dead")).toBeUndefined();
    });

    it("skips agents with no PID", async () => {
      const adapter = makeAdapter({
        launch: vi.fn(async (opts: AgentLaunchOptions) => ({
          agentId: opts.agentId,
          adapterMeta: {},
        })),
      });
      registry.register("claude-agent-sdk", adapter);
      const manager = new AgentManager({
        adapterRegistry: registry,
        agentStore,
        isProcessAlive: () => false,
      });

      await manager.launch({
        agentId: "nopid",
        adapterType: "claude-agent-sdk",
        projectName: "proj",
        callsign: "NOPID",
        launchOptions: baseLaunchOptions("nopid"),
      });

      expect(manager.reap()).toEqual([]);
      expect(agentStore.get("nopid")?.status).toBe("running");
    });
  });

  describe("reattach", () => {
    it("rebuilds handles for live PIDs and terminates the rest after restart", async () => {
      const liveRecord: AgentRecord = {
        id: "survivor",
        adapterType: "claude-agent-sdk",
        pid: 100,
        projectName: "proj",
        callsign: "SURVIVOR",
        status: "running",
        adapterMeta: { token: "abc" },
      };
      const deadRecord: AgentRecord = {
        id: "casualty",
        adapterType: "claude-agent-sdk",
        pid: 200,
        projectName: "proj",
        callsign: "CASUALTY",
        status: "running",
        adapterMeta: {},
      };
      const noPidRecord: AgentRecord = {
        id: "zombie",
        adapterType: "claude-agent-sdk",
        projectName: "proj",
        callsign: "ZOMBIE",
        status: "running",
        adapterMeta: {},
      };
      const alreadyTerminated: AgentRecord = {
        id: "historical",
        adapterType: "claude-agent-sdk",
        pid: 300,
        projectName: "proj",
        callsign: "HISTORY",
        status: "terminated",
        adapterMeta: {},
      };
      agentStore.set(liveRecord);
      agentStore.set(deadRecord);
      agentStore.set(noPidRecord);
      agentStore.set(alreadyTerminated);
      await agentStore.save();

      const freshStore = new AgentStore(stateDir);
      await freshStore.load();
      const manager = new AgentManager({
        adapterRegistry: registry,
        agentStore: freshStore,
        isProcessAlive: (pid) => pid === 100,
      });

      const result = manager.reattach();

      expect(result.reattached).toEqual(["survivor"]);
      expect(result.terminated.sort()).toEqual(["casualty", "zombie"]);
      expect(manager.getHandle("survivor")?.pid).toBe(100);
      expect(manager.getHandle("survivor")?.adapterMeta).toEqual({ token: "abc" });
      expect(freshStore.get("casualty")?.status).toBe("terminated");
      expect(freshStore.get("zombie")?.status).toBe("terminated");
      expect(freshStore.get("historical")?.status).toBe("terminated");
    });

    it("can subsequently stop a reattached agent through the adapter", async () => {
      const adapter = makeAdapter();
      registry.register("claude-agent-sdk", adapter);
      agentStore.set({
        id: "a1",
        adapterType: "claude-agent-sdk",
        pid: 42,
        projectName: "proj",
        callsign: "ALPHA",
        status: "running",
        adapterMeta: {},
      });
      const manager = new AgentManager({
        adapterRegistry: registry,
        agentStore,
        isProcessAlive: () => true,
      });

      manager.reattach();
      await manager.stop("a1");

      expect(adapter.terminate).toHaveBeenCalledOnce();
      expect(agentStore.get("a1")?.status).toBe("terminated");
    });
  });

  describe("setStatus", () => {
    it("updates the store and drops the handle on terminate", async () => {
      const adapter = makeAdapter();
      registry.register("claude-agent-sdk", adapter);
      const manager = new AgentManager({ adapterRegistry: registry, agentStore });

      await manager.launch({
        agentId: "a1",
        adapterType: "claude-agent-sdk",
        projectName: "proj",
        callsign: "WHISKEY",
        launchOptions: baseLaunchOptions("a1"),
      });

      manager.setStatus("a1", "paused");
      expect(agentStore.get("a1")?.status).toBe("paused");
      expect(manager.getHandle("a1")).toBeDefined();

      manager.setStatus("a1", "terminated");
      expect(agentStore.get("a1")?.status).toBe("terminated");
      expect(manager.getHandle("a1")).toBeUndefined();
    });
  });
});
