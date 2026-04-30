import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { ChannelRegistry } from "../websocket/channels.js";
import { CraftStatus } from "@airtrafficcontrol/types";
import { publishCraftEvent, publishCraftRemoved } from "./broadcast.js";
import type { CraftState, WsEvent } from "../../types.js";

vi.mock("../../config/loader.js", () => ({
  loadProjectMetadata: vi.fn().mockResolvedValue({
    name: "test-project",
    repoPath: "/tmp/fake-repo",
    checklist: [{ name: "echo ok", command: "echo ok" }],
  }),
}));

vi.mock("../../checklist/runner.js", () => ({
  runChecklist: vi.fn(),
}));

import { runChecklist } from "../../checklist/runner.js";

const PROJECT = "test-project";

function seedCraft(store: CraftStore, status: CraftStatus = CraftStatus.Taxiing): CraftState {
  const craft: CraftState = {
    callsign: "alpha-1",
    createdAt: "2026-04-11T00:00:00.000Z",
    branch: "feat/alpha",
    cargo: "Ship alpha",
    category: "backend",
    status,
    captain: "pilot-1",
    firstOfficers: ["pilot-2"],
    jumpseaters: [],
    flightPlan: [
      { name: "design", acceptanceCriteria: "Design done", status: "Pending" },
      { name: "implement", acceptanceCriteria: "Code done", status: "Pending" },
    ],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "pilot-1" },
    holdingPattern: false,
  };
  store.set(PROJECT, craft);
  return craft;
}

describe("publishCraftEvent / publishCraftRemoved helpers", () => {
  let app: FastifyInstance;
  let channels: ChannelRegistry;
  let publishSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    channels = new ChannelRegistry();
    publishSpy = vi.spyOn(channels, "publish");
    app = createApp({
      craftStore: new CraftStore("/tmp/atc-bcast-helper"),
      agentStore: new AgentStore("/tmp/atc-bcast-helper"),
      towerStore: new TowerStore("/tmp/atc-bcast-helper"),
      channelRegistry: channels,
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("publishes to both craft and project channels with a WsEvent payload", () => {
    const craft = seedCraft(app.craftStore);
    publishCraftEvent(app, PROJECT, craft, "craft.created");

    expect(publishSpy).toHaveBeenCalledTimes(2);
    const [craftCall, projectCall] = publishSpy.mock.calls;
    expect(craftCall[0]).toBe("craft:alpha-1");
    expect(projectCall[0]).toBe(`project:${PROJECT}`);

    const event = craftCall[1] as WsEvent;
    expect(event.type).toBe("event");
    expect(event.event).toBe("craft.created");
    expect(event.channel).toBe("craft:alpha-1");
    expect(event.data.project).toBe(PROJECT);
    expect(event.data.callsign).toBe("alpha-1");
    expect(event.data.craft).toBeDefined();
    expect(typeof event.timestamp).toBe("string");
  });

  it("merges extra fields into the event data", () => {
    const craft = seedCraft(app.craftStore);
    publishCraftEvent(app, PROJECT, craft, "craft.launched", {
      from: CraftStatus.Taxiing,
      to: CraftStatus.InFlight,
    });

    const event = publishSpy.mock.calls[0][1] as WsEvent;
    expect(event.data.from).toBe(CraftStatus.Taxiing);
    expect(event.data.to).toBe(CraftStatus.InFlight);
  });

  it("publishCraftRemoved emits a minimal payload without a craft body", () => {
    publishCraftRemoved(app, PROJECT, "alpha-1");

    expect(publishSpy).toHaveBeenCalledTimes(2);
    const event = publishSpy.mock.calls[0][1] as WsEvent;
    expect(event.event).toBe("craft.removed");
    expect(event.data.project).toBe(PROJECT);
    expect(event.data.callsign).toBe("alpha-1");
    expect(event.data.craft).toBeUndefined();
  });
});

describe("broadcast wiring on mutation routes", () => {
  let app: FastifyInstance;
  let channels: ChannelRegistry;
  let publishSpy: ReturnType<typeof vi.spyOn>;
  let craftStore: CraftStore;

  const validCraftBody = {
    callsign: "alpha-1",
    branch: "feat/alpha",
    cargo: "Ship alpha",
    category: "backend",
    captain: "pilot-1",
    firstOfficers: ["pilot-2"],
    jumpseaters: [],
    flightPlan: [
      { name: "design", acceptanceCriteria: "Design doc" },
      { name: "implement", acceptanceCriteria: "Code written" },
    ],
  };

  function eventsFor(channelPrefix: string): WsEvent[] {
    return publishSpy.mock.calls
      .filter(([channel]) => (channel as string).startsWith(channelPrefix))
      .map(([, data]) => data as WsEvent)
      .filter((e) => e.event !== "craft.blackbox.appended");
  }

  beforeEach(() => {
    channels = new ChannelRegistry();
    publishSpy = vi.spyOn(channels, "publish");
    craftStore = new CraftStore("/tmp/atc-bcast-routes");
    app = createApp({
      craftStore,
      agentStore: new AgentStore("/tmp/atc-bcast-routes"),
      towerStore: new TowerStore("/tmp/atc-bcast-routes"),
      channelRegistry: channels,
    });
  });

  afterEach(async () => {
    if (app) await app.close();
    vi.mocked(runChecklist).mockReset();
  });

  it("POST /crafts broadcasts craft.created on both channels", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts`,
      payload: validCraftBody,
    });
    expect(res.statusCode).toBe(201);

    const events = [...eventsFor("craft:"), ...eventsFor("project:")];
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.event === "craft.created")).toBe(true);
    expect(events.some((e) => e.channel === "craft:alpha-1")).toBe(true);
    expect(events.some((e) => e.channel === `project:${PROJECT}`)).toBe(true);
  });

  it("DELETE /crafts broadcasts craft.removed", async () => {
    seedCraft(craftStore);
    publishSpy.mockClear();

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${PROJECT}/crafts/alpha-1`,
    });
    expect(res.statusCode).toBe(204);

    const events = [...eventsFor("craft:"), ...eventsFor("project:")];
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.event === "craft.removed")).toBe(true);
  });

  it("POST /launch broadcasts craft.launched with from/to", async () => {
    seedCraft(craftStore);
    publishSpy.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/launch`,
    });
    expect(res.statusCode).toBe(200);

    const events = eventsFor("craft:");
    expect(events[0].event).toBe("craft.launched");
    expect(events[0].data.from).toBe(CraftStatus.Taxiing);
    expect(events[0].data.to).toBe(CraftStatus.InFlight);
  });

  it("POST /checklist broadcasts checklist.started and checklist.passed on success", async () => {
    seedCraft(craftStore, CraftStatus.InFlight);
    publishSpy.mockClear();
    vi.mocked(runChecklist).mockResolvedValueOnce({ passed: true, items: [] });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/checklist`,
      payload: { pilotId: "pilot-1" },
    });
    expect(res.statusCode).toBe(200);

    const craftEvents = eventsFor("craft:");
    const eventNames = craftEvents.map((e) => e.event);
    expect(eventNames).toContain("craft.checklist.started");
    expect(eventNames).toContain("craft.checklist.passed");
  });

  it("POST /checklist broadcasts checklist.failed on failure", async () => {
    seedCraft(craftStore, CraftStatus.InFlight);
    publishSpy.mockClear();
    vi.mocked(runChecklist).mockResolvedValueOnce({
      passed: false,
      items: [{ name: "lint", passed: false, stdout: "", stderr: "err", durationMs: 1 }],
    });

    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/checklist`,
      payload: { pilotId: "pilot-1" },
    });

    const eventNames = eventsFor("craft:").map((e) => e.event);
    expect(eventNames).toContain("craft.checklist.failed");
  });

  it("POST /emergency broadcasts craft.emergency.declared", async () => {
    seedCraft(craftStore, CraftStatus.GoAround);
    publishSpy.mockClear();

    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/emergency`,
      payload: { pilotId: "pilot-1", reason: "engine out" },
    });

    const events = eventsFor("craft:");
    expect(events[0].event).toBe("craft.emergency.declared");
    expect(events[0].data.entry).toMatchObject({ type: "EmergencyDeclaration" });
  });

  it("POST /vectors/:name/report broadcasts craft.vector.reported", async () => {
    seedCraft(craftStore, CraftStatus.InFlight);
    publishSpy.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/vectors/design/report`,
      payload: { evidence: "design doc approved" },
    });
    expect(res.statusCode).toBe(200);

    const events = eventsFor("craft:");
    expect(events[0].event).toBe("craft.vector.reported");
    expect((events[0].data.vector as { name: string }).name).toBe("design");
  });

  it("POST /intercom broadcasts craft.intercom.posted", async () => {
    seedCraft(craftStore, CraftStatus.InFlight);
    publishSpy.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/intercom`,
      payload: { from: "pilot-1", seat: "captain", content: "hello" },
    });
    expect(res.statusCode).toBe(200);

    const events = eventsFor("craft:");
    expect(events[0].event).toBe("craft.intercom.posted");
    expect(events[0].data.message).toMatchObject({ content: "hello" });
  });

  it("POST /tower/clearance broadcasts craft and tower events", async () => {
    const craft = seedCraft(craftStore, CraftStatus.InFlight);
    craft.flightPlan.forEach((v) => {
      v.status = "Passed";
    });
    craftStore.set(PROJECT, craft);
    publishSpy.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/tower/clearance`,
      payload: { callsign: "alpha-1" },
    });
    expect(res.statusCode).toBe(200);

    const craftEvents = eventsFor("craft:");
    expect(craftEvents[0].event).toBe("craft.clearance.granted");

    const towerEvents = eventsFor("tower:");
    expect(towerEvents[0].event).toBe("tower.queue.changed");
    expect(towerEvents[0].channel).toBe(`tower:${PROJECT}`);
  });

  it("does not broadcast when mutation route returns an error", async () => {
    // Launch on a craft that is already InFlight -> 409, no publish.
    seedCraft(craftStore, CraftStatus.InFlight);
    publishSpy.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/crafts/alpha-1/launch`,
    });
    expect(res.statusCode).toBe(409);
    expect(publishSpy).not.toHaveBeenCalled();
  });
});
