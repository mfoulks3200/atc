import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app.js";
import { createGlobalConfigStore } from "../../config/global-store.js";
import { ChannelRegistry } from "../websocket/channels.js";
import { GLOBAL_CONFIG_DEFAULTS } from "../../config/schema.js";

async function bootApp() {
  const atcDir = await mkdtemp(join(tmpdir(), "atc-routes-"));
  const channels = new ChannelRegistry();
  const publishSpy = vi.spyOn(channels, "publish");
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const store = createGlobalConfigStore(atcDir, channels.publish.bind(channels), logger);
  await store.load();
  const app = createApp({
    channelRegistry: channels,
    globalConfigStore: store,
  });
  await app.ready();
  return { app, store, atcDir, publishSpy };
}

describe("GET /api/v1/config/global", () => {
  it("returns merged config and overrides", async () => {
    const { app, atcDir } = await bootApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/config/global" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      config: GLOBAL_CONFIG_DEFAULTS,
      overrides: {},
    });
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });
});

describe("PUT /api/v1/config/global", () => {
  it("replaces config and persists only the diff", async () => {
    const { app, atcDir } = await bootApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/config/global",
      payload: { defaultProfile: "staging" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ config: { defaultProfile: "staging" } });
    const raw = JSON.parse(await readFile(join(atcDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(raw).toEqual({ defaultProfile: "staging" });
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });

  it("returns 400 INVALID_CONFIG with issues on bad input", async () => {
    const { app, atcDir } = await bootApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/config/global",
      payload: { defaultProfile: 42 },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; issues: unknown[] } };
    expect(body.error.code).toBe("INVALID_CONFIG");
    expect(Array.isArray(body.error.issues)).toBe(true);
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });
});

describe("PATCH /api/v1/config/global", () => {
  it("merges partial input", async () => {
    const { app, atcDir } = await bootApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/config/global",
      payload: { defaultProfile: "dev" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ config: { defaultProfile: "dev" } });
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });
});

describe("DELETE /api/v1/config/global/:key", () => {
  it("reverts a known key to default", async () => {
    const { app, atcDir } = await bootApp();
    await app.inject({
      method: "PATCH",
      url: "/api/v1/config/global",
      payload: { defaultProfile: "dev" },
    });
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/config/global/defaultProfile",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ config: GLOBAL_CONFIG_DEFAULTS });
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });

  it("returns 404 UNKNOWN_CONFIG_KEY for a key not in the schema", async () => {
    const { app, atcDir } = await bootApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/config/global/bogus",
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("UNKNOWN_CONFIG_KEY");
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });
});

describe("publishes on config:global channel", () => {
  it("publishes after a successful PATCH", async () => {
    const { app, atcDir, publishSpy } = await bootApp();
    publishSpy.mockClear();
    await app.inject({
      method: "PATCH",
      url: "/api/v1/config/global",
      payload: { defaultProfile: "dev" },
    });
    const call = publishSpy.mock.calls.find((c) => c[0] === "config:global");
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ source: "api" });
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });
});
