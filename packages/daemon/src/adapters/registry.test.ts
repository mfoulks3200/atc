import { describe, expect, it, vi } from "vitest";
import type { AgentAdapter } from "./adapter.js";
import { AdapterRegistry } from "./registry.js";

/**
 * Builds a minimal vi.fn()-based AgentAdapter mock.
 * All methods are stubs — behaviour under test lives in the registry, not the adapter.
 */
function makeMockAdapter(): AgentAdapter {
  return {
    launch: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    terminate: vi.fn(),
    isAlive: vi.fn(),
    sendMessage: vi.fn(),
    onMessage: vi.fn(),
    onStatusChange: vi.fn(),
    onUsageReport: vi.fn(),
  };
}

describe("AdapterRegistry", () => {
  it("registers and retrieves an adapter by name", () => {
    const registry = new AdapterRegistry();
    const adapter = makeMockAdapter();

    registry.register("mock", adapter);

    expect(registry.get("mock")).toBe(adapter);
  });

  it("returns undefined for an unregistered adapter name", () => {
    const registry = new AdapterRegistry();

    expect(registry.get("does-not-exist")).toBeUndefined();
  });

  it("lists all registered adapter names", () => {
    const registry = new AdapterRegistry();

    registry.register("alpha", makeMockAdapter());
    registry.register("beta", makeMockAdapter());
    registry.register("gamma", makeMockAdapter());

    expect(registry.list()).toEqual(["alpha", "beta", "gamma"]);
  });

  it("throws when registering a duplicate adapter name", () => {
    const registry = new AdapterRegistry();
    const adapter = makeMockAdapter();

    registry.register("duplicate", adapter);

    expect(() => registry.register("duplicate", makeMockAdapter())).toThrowError(
      `Adapter "duplicate" is already registered.`,
    );
  });
});
