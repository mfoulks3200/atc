import { describe, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app.js";
import { createProjectConfigStore } from "../../config/project-store.js";
import { ChannelRegistry } from "../websocket/channels.js";
import { PROJECT_METADATA_DEFAULTS } from "../../config/schema.js";
import type { LayeredConfigStore } from "../../config/layered-store.js";
import type { ProjectMetadataConfig } from "../../config/schema.js";

const PROJECT_NAME = "my-project";

async function bootApp() {
  const profileDir = await mkdtemp(join(tmpdir(), "atc-proj-routes-"));
  const projectDir = join(profileDir, "projects", PROJECT_NAME);
  await mkdir(projectDir, { recursive: true });

  const channels = new ChannelRegistry();
  const publishSpy = vi.spyOn(channels, "publish");
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

  const store = createProjectConfigStore(
    PROJECT_NAME,
    projectDir,
    channels.publish.bind(channels),
    logger,
  );
  await store.load();

  const projectConfigStores = new Map<string, LayeredConfigStore<ProjectMetadataConfig>>();
  projectConfigStores.set(PROJECT_NAME, store);

  const app = createApp({
    channelRegistry: channels,
    projectConfigStores,
  });
  await app.ready();
  return { app, store, profileDir, publishSpy };
}

describe("GET /api/v1/projects/:name/config", () => {
  it("returns merged config and overrides", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${PROJECT_NAME}/config`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      config: { ...PROJECT_METADATA_DEFAULTS, name: PROJECT_NAME },
      overrides: {},
    });
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns 404 for unknown project", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/projects/nonexistent/config",
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});

describe("PUT /api/v1/projects/:name/config", () => {
  it("replaces config entirely", async () => {
    const { app, profileDir } = await bootApp();
    const payload = {
      name: PROJECT_NAME,
      remoteUrl: "https://github.com/org/repo.git",
      categories: ["backend"],
      checklist: [],
      mcpServers: {},
    };
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${PROJECT_NAME}/config`,
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { config: ProjectMetadataConfig };
    expect(body.config.remoteUrl).toBe("https://github.com/org/repo.git");
    expect(body.config.categories).toEqual(["backend"]);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns 404 for unknown project", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/projects/nonexistent/config",
      payload: {
        name: "nonexistent",
        remoteUrl: "",
        categories: [],
        checklist: [],
        mcpServers: {},
      },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});

describe("PATCH /api/v1/projects/:name/config", () => {
  it("merges partial config", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${PROJECT_NAME}/config`,
      payload: { remoteUrl: "https://github.com/org/repo.git" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { config: ProjectMetadataConfig };
    expect(body.config.remoteUrl).toBe("https://github.com/org/repo.git");
    expect(body.config.name).toBe(PROJECT_NAME);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns 404 for unknown project", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/projects/nonexistent/config",
      payload: { remoteUrl: "https://github.com/org/repo.git" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});

describe("DELETE /api/v1/projects/:name/config/:key", () => {
  it("reverts a known key to default", async () => {
    const { app, profileDir } = await bootApp();
    // First set a value
    await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${PROJECT_NAME}/config`,
      payload: { remoteUrl: "https://github.com/org/repo.git" },
    });
    // Then delete it
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${PROJECT_NAME}/config/remoteUrl`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { config: ProjectMetadataConfig };
    expect(body.config.remoteUrl).toBe(PROJECT_METADATA_DEFAULTS.remoteUrl);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns 404 UNKNOWN_CONFIG_KEY for a key not in the schema", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${PROJECT_NAME}/config/bogusKey`,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("UNKNOWN_CONFIG_KEY");
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns 404 for unknown project", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/projects/nonexistent/config/remoteUrl",
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});

describe("publishes on config:project:<name> channel", () => {
  it("publishes after a successful PATCH", async () => {
    const { app, profileDir, publishSpy } = await bootApp();
    publishSpy.mockClear();
    await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${PROJECT_NAME}/config`,
      payload: { remoteUrl: "https://github.com/org/repo.git" },
    });
    const channel = `config:project:${PROJECT_NAME}`;
    const call = publishSpy.mock.calls.find((c) => c[0] === channel);
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ source: "api" });
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});
