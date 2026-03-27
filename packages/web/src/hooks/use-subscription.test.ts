import { describe, it, expect } from "vitest";
import { mapEventToQueryUpdate } from "./use-subscription.js";

describe("mapEventToQueryUpdate", () => {
  it("maps craft status change to direct cache write", () => {
    const result = mapEventToQueryUpdate({
      type: "event",
      channel: "craft:fix-auth",
      event: "craft.status.changed",
      timestamp: "2026-03-26T14:32:01.000Z",
      data: {
        project: "acme",
        callsign: "fix-auth",
        craft: { callsign: "fix-auth", status: "InFlight" },
      },
    });

    expect(result).toEqual({
      strategy: "setData",
      keys: [["crafts", "acme", "fix-auth"]],
      data: { callsign: "fix-auth", status: "InFlight" },
    });
  });

  it("maps craft event without full entity to invalidation", () => {
    const result = mapEventToQueryUpdate({
      type: "event",
      channel: "craft:fix-auth",
      event: "craft.status.changed",
      timestamp: "2026-03-26T14:32:01.000Z",
      data: { project: "acme", callsign: "fix-auth" },
    });

    expect(result).toEqual({
      strategy: "invalidate",
      keys: [
        ["crafts", "acme", "fix-auth"],
        ["crafts", "acme"],
      ],
    });
  });

  it("maps agent event to agent key invalidation", () => {
    const result = mapEventToQueryUpdate({
      type: "event",
      channel: "agent:a-1",
      event: "agent.status.changed",
      timestamp: "2026-03-26T14:32:01.000Z",
      data: { agentId: "a-1" },
    });

    expect(result).toEqual({
      strategy: "invalidate",
      keys: [["agents", "a-1"], ["agents"]],
    });
  });

  it("maps tower event to tower key invalidation", () => {
    const result = mapEventToQueryUpdate({
      type: "event",
      channel: "tower",
      event: "tower.clearance.granted",
      timestamp: "2026-03-26T14:32:01.000Z",
      data: { project: "acme" },
    });

    expect(result).toEqual({
      strategy: "invalidate",
      keys: [["tower", "acme"]],
    });
  });
});
