import { describe, it, expect, vi } from "vitest";
import { createApp } from "../app.js";
import { ChannelRegistry } from "../websocket/channels.js";
import { PilotConfigStore } from "../../config/pilot-config-store.js";
import { PILOT_CONFIG_DEFAULTS } from "../../config/schema.js";
import type { PilotConfig } from "../../config/schema.js";

const PROJECT_NAME = "test-project";
const PILOT_ID = "pilot-abc";

function bootApp() {
  const channels = new ChannelRegistry();
  const publishSpy = vi.spyOn(channels, "publish");
  const pilotConfigStore = new PilotConfigStore(channels.publish.bind(channels));

  const app = createApp({
    channelRegistry: channels,
    pilotConfigStore,
  });
  return { app, pilotConfigStore, publishSpy };
}

describe("GET /api/v1/projects/:name/pilots/:id/config", () => {
  it("returns defaults for a pilot with no overrides (200)", async () => {
    const { app } = bootApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${PROJECT_NAME}/pilots/${PILOT_ID}/config`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      config: PILOT_CONFIG_DEFAULTS,
      overrides: {},
    });
    await app.close();
  });
});

describe("PATCH /api/v1/projects/:name/pilots/:id/config", () => {
  it("merges partial config and returns updated config (200)", async () => {
    const { app } = bootApp();
    await app.ready();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${PROJECT_NAME}/pilots/${PILOT_ID}/config`,
      payload: { certifications: ["captain"] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { config: PilotConfig };
    expect(body.config.certifications).toEqual(["captain"]);
    expect(body.config.skills).toEqual([]);
    expect(body.config.mcpServers).toEqual({});
    await app.close();
  });

  it("publishes on config:pilot:{id} channel after PATCH", async () => {
    const { app, publishSpy } = bootApp();
    await app.ready();
    publishSpy.mockClear();
    await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${PROJECT_NAME}/pilots/${PILOT_ID}/config`,
      payload: { skills: ["navigate"] },
    });
    const channel = `config:pilot:${PILOT_ID}`;
    const call = publishSpy.mock.calls.find((c) => c[0] === channel);
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ source: "api" });
    await app.close();
  });
});

describe("PUT /api/v1/projects/:name/pilots/:id/config", () => {
  it("replaces config entirely and returns merged config (200)", async () => {
    const { app } = bootApp();
    await app.ready();
    // Seed some data first
    await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${PROJECT_NAME}/pilots/${PILOT_ID}/config`,
      payload: { certifications: ["first-officer"], skills: ["navigate"] },
    });
    // Replace entirely
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${PROJECT_NAME}/pilots/${PILOT_ID}/config`,
      payload: {
        certifications: ["captain"],
        mcpServers: {},
        skills: [],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { config: PilotConfig };
    expect(body.config.certifications).toEqual(["captain"]);
    expect(body.config.skills).toEqual([]);
    await app.close();
  });

  it("returns 400 for invalid config", async () => {
    const { app } = bootApp();
    await app.ready();
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${PROJECT_NAME}/pilots/${PILOT_ID}/config`,
      payload: { certifications: "not-an-array" },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_CONFIG");
    await app.close();
  });
});

describe("DELETE /api/v1/projects/:name/pilots/:id/config/:key", () => {
  it("reverts a known key to its default and returns updated config (200)", async () => {
    const { app } = bootApp();
    await app.ready();
    // Seed certifications
    await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${PROJECT_NAME}/pilots/${PILOT_ID}/config`,
      payload: { certifications: ["captain"] },
    });
    // Delete it
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${PROJECT_NAME}/pilots/${PILOT_ID}/config/certifications`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { config: PilotConfig };
    expect(body.config.certifications).toEqual(PILOT_CONFIG_DEFAULTS.certifications);
    await app.close();
  });

  it("returns 404 for an unknown key", async () => {
    const { app } = bootApp();
    await app.ready();
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${PROJECT_NAME}/pilots/${PILOT_ID}/config/bogusKey`,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("UNKNOWN_CONFIG_KEY");
    await app.close();
  });
});
