import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeartbeatTracker } from "./heartbeat.js";

describe("HeartbeatTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("new client starts with 0 missed pongs", () => {
    const tracker = new HeartbeatTracker(3);
    tracker.addClient("client-1");

    expect(tracker.getMissedPongs("client-1")).toBe(0);
  });

  it("unknown client reports 0 missed pongs", () => {
    const tracker = new HeartbeatTracker(3);

    expect(tracker.getMissedPongs("ghost")).toBe(0);
  });

  it("tick increments missed count for all tracked clients", () => {
    const tracker = new HeartbeatTracker(3);
    tracker.addClient("client-1");
    tracker.addClient("client-2");

    tracker.tick();

    expect(tracker.getMissedPongs("client-1")).toBe(1);
    expect(tracker.getMissedPongs("client-2")).toBe(1);
  });

  it("tick accumulates over multiple calls", () => {
    const tracker = new HeartbeatTracker(3);
    tracker.addClient("client-1");

    tracker.tick();
    tracker.tick();
    tracker.tick();

    expect(tracker.getMissedPongs("client-1")).toBe(3);
  });

  it("receivePong resets missed count to 0", () => {
    const tracker = new HeartbeatTracker(3);
    tracker.addClient("client-1");

    tracker.tick();
    tracker.tick();
    tracker.receivePong("client-1");

    expect(tracker.getMissedPongs("client-1")).toBe(0);
  });

  it("receivePong for an unknown client is a no-op", () => {
    const tracker = new HeartbeatTracker(3);
    // Should not throw and should not start tracking the client.
    expect(() => tracker.receivePong("ghost")).not.toThrow();
    expect(tracker.getMissedPongs("ghost")).toBe(0);
  });

  it("getStaleClients returns clients at exactly maxMissed", () => {
    const tracker = new HeartbeatTracker(2);
    tracker.addClient("client-1");

    tracker.tick();
    tracker.tick(); // missed === maxMissed === 2

    expect(tracker.getStaleClients()).toEqual(["client-1"]);
  });

  it("getStaleClients returns clients exceeding maxMissed", () => {
    const tracker = new HeartbeatTracker(2);
    tracker.addClient("client-1");

    tracker.tick();
    tracker.tick();
    tracker.tick(); // missed === 3 > 2

    expect(tracker.getStaleClients()).toEqual(["client-1"]);
  });

  it("getStaleClients excludes clients below the threshold", () => {
    const tracker = new HeartbeatTracker(3);
    tracker.addClient("client-1");

    tracker.tick(); // missed === 1 < 3

    expect(tracker.getStaleClients()).toEqual([]);
  });

  it("getStaleClients returns empty array when no clients are tracked", () => {
    const tracker = new HeartbeatTracker(1);
    expect(tracker.getStaleClients()).toEqual([]);
  });

  it("mixes stale and healthy clients correctly", () => {
    const tracker = new HeartbeatTracker(2);
    tracker.addClient("stale");
    tracker.addClient("healthy");

    tracker.tick();
    tracker.tick(); // both at 2

    tracker.receivePong("healthy"); // healthy resets to 0

    expect(tracker.getStaleClients()).toEqual(["stale"]);
    expect(tracker.getMissedPongs("healthy")).toBe(0);
  });

  it("removeClient stops tracking that client", () => {
    const tracker = new HeartbeatTracker(3);
    tracker.addClient("client-1");
    tracker.removeClient("client-1");

    tracker.tick();

    expect(tracker.getMissedPongs("client-1")).toBe(0); // unknown → 0
    expect(tracker.getStaleClients()).toEqual([]);
  });

  it("removeClient is a no-op for unknown clients", () => {
    const tracker = new HeartbeatTracker(3);
    expect(() => tracker.removeClient("ghost")).not.toThrow();
  });

  it("addClient resets count when called for an already-tracked client", () => {
    const tracker = new HeartbeatTracker(3);
    tracker.addClient("client-1");

    tracker.tick();
    tracker.tick(); // missed === 2

    tracker.addClient("client-1"); // re-add resets to 0

    expect(tracker.getMissedPongs("client-1")).toBe(0);
  });
});
