import { describe, expect, it, vi } from "vitest";
import { ChannelRegistry, matchesChannel } from "./channels.js";

describe("matchesChannel", () => {
  it("firehose '*' matches any channel", () => {
    expect(matchesChannel("*", "crafts:alpha")).toBe(true);
    expect(matchesChannel("*", "tower:events")).toBe(true);
    expect(matchesChannel("*", "anything")).toBe(true);
  });

  it("prefix glob matches channels that start with the prefix", () => {
    expect(matchesChannel("crafts:*", "crafts:alpha-1")).toBe(true);
    expect(matchesChannel("crafts:my-app:*", "crafts:my-app:alpha-1")).toBe(true);
  });

  it("prefix glob does not match channels outside the prefix", () => {
    expect(matchesChannel("crafts:*", "tower:events")).toBe(false);
    expect(matchesChannel("crafts:my-app:*", "crafts:other-app:beta-2")).toBe(false);
  });

  it("exact pattern matches only that channel", () => {
    expect(matchesChannel("tower:events", "tower:events")).toBe(true);
    expect(matchesChannel("tower:events", "tower:eventsXYZ")).toBe(false);
  });
});

describe("ChannelRegistry", () => {
  it("delivers a published message to an exact-match subscriber", () => {
    const registry = new ChannelRegistry();
    const send = vi.fn();

    registry.subscribe("client-1", "tower:events", send);
    registry.publish("tower:events", { type: "LANDING_CLEARED" });

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ type: "LANDING_CLEARED" });
  });

  it("delivers to a prefix-glob subscriber", () => {
    const registry = new ChannelRegistry();
    const send = vi.fn();

    registry.subscribe("client-1", "crafts:my-app:*", send);
    registry.publish("crafts:my-app:alpha-1", { status: "IN_FLIGHT" });

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ status: "IN_FLIGHT" });
  });

  it("delivers to a firehose '*' subscriber", () => {
    const registry = new ChannelRegistry();
    const send = vi.fn();

    registry.subscribe("client-1", "*", send);
    registry.publish("completely:random:channel", 42);

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(42);
  });

  it("does not deliver to a non-matching subscriber", () => {
    const registry = new ChannelRegistry();
    const send = vi.fn();

    registry.subscribe("client-1", "tower:events", send);
    registry.publish("crafts:alpha-1", { status: "IN_FLIGHT" });

    expect(send).not.toHaveBeenCalled();
  });

  it("delivers to multiple subscribers matching the same channel", () => {
    const registry = new ChannelRegistry();
    const send1 = vi.fn();
    const send2 = vi.fn();

    registry.subscribe("client-1", "tower:events", send1);
    registry.subscribe("client-2", "tower:events", send2);
    registry.publish("tower:events", "payload");

    expect(send1).toHaveBeenCalledOnce();
    expect(send2).toHaveBeenCalledOnce();
  });

  it("stops delivery after unsubscribe", () => {
    const registry = new ChannelRegistry();
    const send = vi.fn();

    registry.subscribe("client-1", "tower:events", send);
    registry.unsubscribe("client-1", "tower:events");
    registry.publish("tower:events", "payload");

    expect(send).not.toHaveBeenCalled();
  });

  it("unsubscribe is a no-op for unknown client or pattern", () => {
    const registry = new ChannelRegistry();
    // Should not throw.
    expect(() => registry.unsubscribe("ghost", "tower:events")).not.toThrow();
  });

  it("removeClient clears all subscriptions for that client", () => {
    const registry = new ChannelRegistry();
    const send = vi.fn();

    registry.subscribe("client-1", "tower:events", send);
    registry.subscribe("client-1", "crafts:*", send);
    registry.removeClient("client-1");

    expect(registry.getSubscriptions("client-1")).toEqual([]);

    registry.publish("tower:events", "payload");
    registry.publish("crafts:alpha", "payload");

    expect(send).not.toHaveBeenCalled();
  });

  it("getSubscriptions returns all patterns for a client", () => {
    const registry = new ChannelRegistry();
    const send = vi.fn();

    registry.subscribe("client-1", "tower:events", send);
    registry.subscribe("client-1", "crafts:*", send);

    expect(registry.getSubscriptions("client-1")).toEqual(["tower:events", "crafts:*"]);
  });

  it("getSubscriptions returns empty array for unknown client", () => {
    const registry = new ChannelRegistry();
    expect(registry.getSubscriptions("ghost")).toEqual([]);
  });

  it("only delivers once per client even if multiple patterns match", () => {
    const registry = new ChannelRegistry();
    const send = vi.fn();

    // Both patterns match "crafts:alpha-1"
    registry.subscribe("client-1", "*", send);
    registry.subscribe("client-1", "crafts:*", send);
    registry.publish("crafts:alpha-1", "payload");

    // Delivery must happen exactly once — not once per matching pattern
    expect(send).toHaveBeenCalledOnce();
  });
});
