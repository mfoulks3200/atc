import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { BlackBoxEntryType, CraftStatus } from "@airtrafficcontrol/types";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { ChannelRegistry } from "../websocket/channels.js";
import { appendBlackBoxEntry } from "./blackbox-helpers.js";
import type { CraftState, WsEvent } from "../../types.js";

const PROJECT = "test-project";

function newCraft(): CraftState {
  return {
    callsign: "alpha-1",
    createdAt: "2026-04-14T00:00:00.000Z",
    branch: "feat/alpha",
    cargo: "cargo",
    category: "backend",
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

describe("appendBlackBoxEntry", () => {
  let app: FastifyInstance;
  let channels: ChannelRegistry;
  let publishSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    channels = new ChannelRegistry();
    publishSpy = vi.spyOn(channels, "publish");
    app = createApp({
      craftStore: new CraftStore("/tmp/atc-bbox-helper"),
      agentStore: new AgentStore("/tmp/atc-bbox-helper"),
      towerStore: new TowerStore("/tmp/atc-bbox-helper"),
      channelRegistry: channels,
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("appends an entry to the craft's black box with ISO timestamp", () => {
    const craft = newCraft();
    const entry = appendBlackBoxEntry(
      app,
      PROJECT,
      craft,
      "pilot-1",
      BlackBoxEntryType.CraftCreated,
      "created",
    );

    expect(craft.blackBox).toHaveLength(1);
    expect(craft.blackBox[0]).toEqual(entry);
    expect(entry.author).toBe("pilot-1");
    expect(entry.type).toBe(BlackBoxEntryType.CraftCreated);
    expect(entry.content).toBe("created");
    expect(typeof entry.timestamp).toBe("string");
    // ISO-8601 format check
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("preserves existing entries when appending (RULE-BBOX-2)", () => {
    const craft = newCraft();
    craft.blackBox = [
      {
        timestamp: "2026-04-10T00:00:00.000Z",
        author: "system",
        type: BlackBoxEntryType.Observation,
        content: "seed",
      },
    ];

    appendBlackBoxEntry(app, PROJECT, craft, "pilot-1", BlackBoxEntryType.Launched, "launched");

    expect(craft.blackBox).toHaveLength(2);
    expect(craft.blackBox[0].content).toBe("seed");
    expect(craft.blackBox[1].content).toBe("launched");
  });

  it("broadcasts craft.blackbox.appended on both craft and project channels", () => {
    const craft = newCraft();
    appendBlackBoxEntry(
      app,
      PROJECT,
      craft,
      "pilot-1",
      BlackBoxEntryType.StateTransition,
      "taxiing -> inflight",
    );

    expect(publishSpy).toHaveBeenCalledTimes(2);
    const channelsPublished = publishSpy.mock.calls.map(([ch]) => ch as string);
    expect(channelsPublished).toContain("craft:alpha-1");
    expect(channelsPublished).toContain(`project:${PROJECT}`);

    const [, payload] = publishSpy.mock.calls[0];
    const evt = payload as WsEvent;
    expect(evt.type).toBe("event");
    expect(evt.event).toBe("craft.blackbox.appended");
    expect(evt.data.project).toBe(PROJECT);
    expect(evt.data.callsign).toBe("alpha-1");
    expect(evt.data.entry).toMatchObject({
      author: "pilot-1",
      type: BlackBoxEntryType.StateTransition,
      content: "taxiing -> inflight",
    });
  });
});
