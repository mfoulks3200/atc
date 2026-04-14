# Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all Configuration roadmap items: project config LayeredConfigStore refactor + REST routes, pilot config routes (in-memory stub), daemon about endpoint, global/project/pilot settings UI, about page, and WebSocket broadcasting for config changes.

**Architecture:** The daemon's existing `LayeredConfigStore` pattern (sparse diffs, file-watching, Zod validation, pub/sub broadcasting) gets extended from global-only to per-project. Pilot config uses an in-memory store with the same API shape. The web UI adds a `/settings` route tree with sub-pages for global, profile, project, and pilot config, plus an about page with build-time data.

**Tech Stack:** TypeScript, Fastify, Zod, Vitest (daemon); React, React Router, TanStack Query, Vite, Tailwind CSS (web)

---

### Task 1: Add ProjectMetadata Zod Schema and Defaults

**Files:**
- Modify: `packages/daemon/src/config/schema.ts`
- Modify: `packages/daemon/src/config/schema.test.ts`

- [ ] **Step 1: Write the failing test for ProjectMetadata schema validation**

In `packages/daemon/src/config/schema.test.ts`, add:

```typescript
import {
  GLOBAL_CONFIG_SCHEMA,
  GLOBAL_CONFIG_DEFAULTS,
  PROJECT_METADATA_SCHEMA,
  PROJECT_METADATA_DEFAULTS,
} from "./schema.js";

describe("PROJECT_METADATA_SCHEMA", () => {
  it("validates a complete ProjectMetadata object", () => {
    const input = {
      name: "my-project",
      remoteUrl: "https://github.com/org/repo.git",
      categories: ["frontend"],
      checklist: [{ name: "Tests", command: "pnpm test" }],
      mcpServers: {},
    };
    const result = PROJECT_METADATA_SCHEMA.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects invalid checklist items", () => {
    const input = {
      ...PROJECT_METADATA_DEFAULTS,
      checklist: [{ name: 123 }],
    };
    const result = PROJECT_METADATA_SCHEMA.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("preserves unknown fields via passthrough", () => {
    const input = { ...PROJECT_METADATA_DEFAULTS, name: "test", remoteUrl: "x", customField: true };
    const result = PROJECT_METADATA_SCHEMA.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).customField).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/daemon/src/config/schema.test.ts`
Expected: FAIL — `PROJECT_METADATA_SCHEMA` and `PROJECT_METADATA_DEFAULTS` not exported

- [ ] **Step 3: Add the schema and defaults to schema.ts**

In `packages/daemon/src/config/schema.ts`, add after the `ADAPTER_CONFIG_SCHEMA` block (after line 29):

```typescript
/**
 * Schema for a single checklist step configuration.
 */
export const CHECKLIST_ITEM_CONFIG_SCHEMA = z.object({
  name: z.string(),
  command: z.string(),
  timeout: z.number().optional(),
});

/**
 * Schema for an MCP server configuration block.
 */
export const MCP_SERVER_CONFIG_SCHEMA = z.object({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string()).optional(),
});

/**
 * Schema for project-level metadata persisted at
 * `<profileDir>/projects/<name>/metadata.json`.
 *
 * @see RULE-CRAFT-1
 */
export const PROJECT_METADATA_SCHEMA = z
  .object({
    name: z.string(),
    remoteUrl: z.string(),
    categories: z.array(z.string()),
    checklist: z.array(CHECKLIST_ITEM_CONFIG_SCHEMA),
    mcpServers: z.record(MCP_SERVER_CONFIG_SCHEMA),
  })
  .passthrough();

/** Inferred TypeScript type for project metadata (from Zod). */
export type ProjectMetadataConfig = z.infer<typeof PROJECT_METADATA_SCHEMA>;

/**
 * Default project metadata. Used when a project's metadata.json is absent
 * or any field is omitted.
 */
export const PROJECT_METADATA_DEFAULTS: ProjectMetadataConfig = {
  name: "",
  remoteUrl: "",
  categories: [],
  checklist: [],
  mcpServers: {},
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/daemon/src/config/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/config/schema.ts packages/daemon/src/config/schema.test.ts
git commit -m "feat(daemon): add ProjectMetadata Zod schema and defaults"
```

---

### Task 2: Create Project Config Store Factory

**Files:**
- Create: `packages/daemon/src/config/project-store.ts`
- Create: `packages/daemon/src/config/project-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/daemon/src/config/project-store.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectConfigStore } from "./project-store.js";
import { PROJECT_METADATA_DEFAULTS } from "./schema.js";

describe("createProjectConfigStore", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    while (dirs.length > 0) {
      const d = dirs.pop()!;
      await rm(d, { recursive: true, force: true });
    }
  });

  it("wires the store to <projectDir>/metadata.json and channel 'config:project:<name>'", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "atc-project-"));
    dirs.push(projectDir);
    const publish = vi.fn();
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const store = createProjectConfigStore("my-project", projectDir, publish, logger);
    await store.load();

    const defaults = { ...PROJECT_METADATA_DEFAULTS, name: "my-project" };
    expect(store.get()).toEqual(defaults);

    await store.patch({ categories: ["frontend"] });
    const raw = JSON.parse(await readFile(join(projectDir, "metadata.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(raw).toEqual({ categories: ["frontend"] });
    expect(publish).toHaveBeenCalledWith(
      "config:project:my-project",
      expect.objectContaining({ source: "api" }),
    );
    await store.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/daemon/src/config/project-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the factory**

Create `packages/daemon/src/config/project-store.ts`:

```typescript
/**
 * Factory for a project-scoped configuration store.
 *
 * Wires a LayeredConfigStore<ProjectMetadataConfig> to the canonical project
 * schema, defaults, file path, and channel. The daemon creates one per
 * registered project.
 *
 * @see RULE-CRAFT-1
 */

import { join } from "node:path";
import { LayeredConfigStore, type ConfigLogger } from "./layered-store.js";
import {
  PROJECT_METADATA_DEFAULTS,
  PROJECT_METADATA_SCHEMA,
  type ProjectMetadataConfig,
} from "./schema.js";

/**
 * Creates a project config store rooted at `<projectDir>/metadata.json`.
 *
 * The store's defaults include the project name so that a fresh project
 * with no metadata.json still reports its name correctly.
 *
 * @param projectName - The project name (used in defaults and channel name).
 * @param projectDir - Absolute path to the project directory.
 * @param publish - Channel-publish function (typically `ChannelRegistry.publish` bound).
 * @param logger - Logger for warnings and error reports.
 * @returns A ready-to-use LayeredConfigStore for project metadata.
 */
export function createProjectConfigStore(
  projectName: string,
  projectDir: string,
  publish: (channel: string, data: unknown) => void,
  logger: ConfigLogger,
): LayeredConfigStore<ProjectMetadataConfig> {
  return new LayeredConfigStore<ProjectMetadataConfig>({
    schema: PROJECT_METADATA_SCHEMA,
    defaults: { ...PROJECT_METADATA_DEFAULTS, name: projectName },
    filePath: join(projectDir, "metadata.json"),
    channel: `config:project:${projectName}`,
    scope: "project",
    publish,
    logger,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/daemon/src/config/project-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/config/project-store.ts packages/daemon/src/config/project-store.test.ts
git commit -m "feat(daemon): add project config store factory"
```

---

### Task 3: Add Project Config Store Map to App and Daemon

**Files:**
- Modify: `packages/daemon/src/server/app.ts`
- Modify: `packages/daemon/src/daemon.ts`

- [ ] **Step 1: Add projectConfigStores to AppOptions and FastifyInstance declaration**

In `packages/daemon/src/server/app.ts`:

Add import at top:
```typescript
import type { ProjectMetadataConfig } from "../config/schema.js";
```

Add to `AppOptions` interface (after line 45):
```typescript
  /** Map of project name -> LayeredConfigStore for project config. */
  projectConfigStores?: Map<string, LayeredConfigStore<ProjectMetadataConfig>>;
```

Add decoration in `createApp` (after line 66):
```typescript
  app.decorate(
    "projectConfigStores",
    options.projectConfigStores ?? new Map<string, LayeredConfigStore<ProjectMetadataConfig>>(),
  );
```

Add to the `declare module "fastify"` block (after line 140):
```typescript
    /** Map of project name -> LayeredConfigStore for project config. */
    projectConfigStores: Map<string, LayeredConfigStore<ProjectMetadataConfig>>;
```

- [ ] **Step 2: Wire project config stores into Daemon.start()**

In `packages/daemon/src/daemon.ts`:

Add imports:
```typescript
import { createProjectConfigStore } from "./config/project-store.js";
import type { ProjectMetadataConfig } from "./config/schema.js";
```

Add a private field (after line 56):
```typescript
  private _projectConfigStores: Map<string, LayeredConfigStore<ProjectMetadataConfig>> = new Map();
```

After the global config store is loaded and started (after line 128), add project store initialization:
```typescript
    // Load project config stores for all existing projects
    const projectConfigStores = new Map<string, LayeredConfigStore<ProjectMetadataConfig>>();
    const projectsDir = join(this._profileDir, "projects");
    try {
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(projectsDir);
      for (const entry of entries) {
        const projectDir = join(projectsDir, entry);
        const store = createProjectConfigStore(
          entry,
          projectDir,
          channelRegistry.publish.bind(channelRegistry),
          logger,
        );
        try {
          await store.load();
          store.start();
          projectConfigStores.set(entry, store);
        } catch {
          // Skip projects without valid metadata
        }
      }
    } catch {
      // No projects dir yet — empty map is fine
    }
```

Pass `projectConfigStores` to `createApp` (update the call around line 130):
```typescript
    const app = createApp({
      profileDir: this._profileDir,
      agentStore,
      craftStore,
      towerStore,
      channelRegistry,
      globalConfigStore,
      projectConfigStores,
    });
```

Store the map:
```typescript
    this._projectConfigStores = projectConfigStores;
```

In `stop()`, stop all project config stores (before line 197):
```typescript
    for (const store of this._projectConfigStores.values()) {
      await store.stop();
    }
```

- [ ] **Step 3: Run the full test suite to verify nothing breaks**

Run: `pnpm run test -- packages/daemon`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/server/app.ts packages/daemon/src/daemon.ts
git commit -m "feat(daemon): wire project config stores into app and daemon lifecycle"
```

---

### Task 4: Refactor Project Routes to Use Config Store

**Files:**
- Modify: `packages/daemon/src/server/routes/projects.ts`
- Modify: `packages/daemon/src/server/routes/projects.test.ts`

- [ ] **Step 1: Update project routes to use LayeredConfigStore**

In `packages/daemon/src/server/routes/projects.ts`:

Replace the imports at the top:
```typescript
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { atomicWriteJson } from "../../state/persistence.js";
import { cloneBareRepo, fetchBareRepo } from "../../git/bare-repo.js";
import { createProjectConfigStore } from "../../config/project-store.js";
import type { ProjectMetadataConfig } from "../../config/schema.js";
import type { ConfigLogger } from "../../config/layered-store.js";
```

Remove the `loadProjectMetadata` import. Remove the `ProjectMetadata` import.

Update the `POST /api/v1/projects` handler to create a config store:

```typescript
  app.post<{ Body: CreateProjectBody }>("/api/v1/projects", async (request, reply) => {
    const { name, remoteUrl, categories, checklist, mcpServers } = request.body;

    const projectDir = join(app.profileDir, "projects", name);
    const craftsDir = join(projectDir, "crafts");
    const bareDir = join(projectDir, "repo.git");

    await mkdir(craftsDir, { recursive: true });

    const logger: ConfigLogger = {
      warn: (msg: string) => console.warn(msg),
      info: (msg: string) => console.info(msg),
      error: (msg: string, err?: unknown) => console.error(msg, err),
    };

    const store = createProjectConfigStore(
      name,
      projectDir,
      app.channelRegistry.publish.bind(app.channelRegistry),
      logger,
    );
    await store.load();
    await store.replace({
      name,
      remoteUrl,
      categories,
      checklist,
      mcpServers: mcpServers ?? {},
    });
    store.start();
    app.projectConfigStores.set(name, store);

    // Clone is best-effort — local test paths and offline environments are ok
    try {
      await cloneBareRepo(remoteUrl, bareDir);
    } catch {
      // Non-fatal: directory structure is the important part
    }

    return reply.code(201).send(store.get());
  });
```

Update `GET /api/v1/projects` to read from stores:

```typescript
  app.get("/api/v1/projects", async (_request, reply) => {
    const projects: ProjectMetadataConfig[] = [];
    for (const store of app.projectConfigStores.values()) {
      projects.push(store.get());
    }
    return reply.send(projects);
  });
```

Update `GET /api/v1/projects/:name`:

```typescript
  app.get<{ Params: { name: string } }>("/api/v1/projects/:name", async (request, reply) => {
    const { name } = request.params;
    const store = app.projectConfigStores.get(name);
    if (!store) {
      return reply.code(404).send({ error: `Project not found: ${name}` });
    }
    return reply.send(store.get());
  });
```

Update `DELETE /api/v1/projects/:name`:

```typescript
  app.delete<{ Params: { name: string } }>("/api/v1/projects/:name", async (request, reply) => {
    const { name } = request.params;
    const store = app.projectConfigStores.get(name);
    if (store) {
      await store.stop();
      app.projectConfigStores.delete(name);
    }

    const projectDir = join(app.profileDir, "projects", name);
    await rm(projectDir, { recursive: true, force: true });

    return reply.code(204).send();
  });
```

Update `PATCH /api/v1/projects/:name`:

```typescript
  app.patch<{ Params: { name: string }; Body: PatchProjectBody }>(
    "/api/v1/projects/:name",
    async (request, reply) => {
      const { name } = request.params;
      const store = app.projectConfigStores.get(name);
      if (!store) {
        return reply.code(404).send({ error: `Project not found: ${name}` });
      }

      const updated = await store.patch({ ...request.body, name });
      return reply.send(updated);
    },
  );
```

Update `POST /api/v1/projects/:name/sync` to use the store for existence check:

```typescript
  app.post<{ Params: { name: string } }>("/api/v1/projects/:name/sync", async (request, reply) => {
    const { name } = request.params;
    if (!app.projectConfigStores.has(name)) {
      return reply.code(404).send({ error: `Project not found: ${name}` });
    }

    const bareDir = join(app.profileDir, "projects", name, "repo.git");
    await fetchBareRepo(bareDir);

    return reply.send({ synced: true });
  });
```

- [ ] **Step 2: Update project route tests**

In `packages/daemon/src/server/routes/projects.test.ts`, update the `bootApp` helper to pass `projectConfigStores` to `createApp` if not already. The tests should work as-is since the store map is defaulted to empty in `createApp`, but verify by running them.

- [ ] **Step 3: Run project route tests**

Run: `pnpm run test -- packages/daemon/src/server/routes/projects.test.ts`
Expected: All PASS

- [ ] **Step 4: Run the full daemon test suite**

Run: `pnpm run test -- packages/daemon`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/server/routes/projects.ts packages/daemon/src/server/routes/projects.test.ts
git commit -m "refactor(daemon): migrate project routes to LayeredConfigStore"
```

---

### Task 5: Add Project Config REST Routes

**Files:**
- Create: `packages/daemon/src/server/routes/project-config.ts`
- Create: `packages/daemon/src/server/routes/project-config.test.ts`
- Modify: `packages/daemon/src/server/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/daemon/src/server/routes/project-config.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app.js";
import { ChannelRegistry } from "../websocket/channels.js";
import { createProjectConfigStore } from "../../config/project-store.js";

async function bootApp() {
  const profileDir = await mkdtemp(join(tmpdir(), "atc-projcfg-"));
  const projectDir = join(profileDir, "projects", "test-project");
  await mkdir(projectDir, { recursive: true });

  const channels = new ChannelRegistry();
  const publishSpy = vi.spyOn(channels, "publish");
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

  const store = createProjectConfigStore(
    "test-project",
    projectDir,
    channels.publish.bind(channels),
    logger,
  );
  await store.load();
  await store.replace({
    name: "test-project",
    remoteUrl: "https://github.com/org/repo.git",
    categories: ["backend"],
    checklist: [],
    mcpServers: {},
  });

  const projectConfigStores = new Map();
  projectConfigStores.set("test-project", store);

  const app = createApp({
    profileDir,
    channelRegistry: channels,
    projectConfigStores,
  });
  await app.ready();
  return { app, profileDir, publishSpy };
}

describe("GET /api/v1/projects/:name/config", () => {
  it("returns config and overrides", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/projects/test-project/config" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.config.name).toBe("test-project");
    expect(body.overrides).toBeDefined();
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns 404 for unknown project", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/projects/nope/config" });
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
      url: "/api/v1/projects/test-project/config",
      payload: { categories: ["frontend", "backend"] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.categories).toEqual(["frontend", "backend"]);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});

describe("PUT /api/v1/projects/:name/config", () => {
  it("replaces config entirely", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/projects/test-project/config",
      payload: {
        name: "test-project",
        remoteUrl: "https://new-url.git",
        categories: [],
        checklist: [],
        mcpServers: {},
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.remoteUrl).toBe("https://new-url.git");
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});

describe("DELETE /api/v1/projects/:name/config/:key", () => {
  it("reverts a key to default", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/projects/test-project/config/categories",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.categories).toEqual([]);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns 404 for unknown key", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/projects/test-project/config/bogus",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});

describe("publishes on config:project channel", () => {
  it("publishes after a successful PATCH", async () => {
    const { app, profileDir, publishSpy } = await bootApp();
    publishSpy.mockClear();
    await app.inject({
      method: "PATCH",
      url: "/api/v1/projects/test-project/config",
      payload: { categories: ["new"] },
    });
    const call = publishSpy.mock.calls.find((c) => c[0] === "config:project:test-project");
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ source: "api" });
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/daemon/src/server/routes/project-config.test.ts`
Expected: FAIL — route not found (404 for all endpoints)

- [ ] **Step 3: Implement the route file**

Create `packages/daemon/src/server/routes/project-config.ts`:

```typescript
/**
 * REST routes for project-level configuration management.
 *
 * All mutations funnel through the project's LayeredConfigStore, which
 * atomically persists the sparse diff against defaults and broadcasts
 * change events on the `config:project:<name>` channel.
 *
 * @see RULE-CRAFT-1
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { ConfigValidationError, UnknownConfigKeyError } from "@airtrafficcontrol/errors";
import type { LayeredConfigStore } from "../../config/layered-store.js";
import type { ProjectMetadataConfig } from "../../config/schema.js";

/**
 * Registers `/api/v1/projects/:name/config` routes on the Fastify instance.
 *
 * Returns 404 if the project has no config store registered.
 */
export async function projectConfigRoutes(app: FastifyInstance): Promise<void> {
  const requireStore = (
    name: string,
    reply: FastifyReply,
  ): LayeredConfigStore<ProjectMetadataConfig> | null => {
    const store = app.projectConfigStores.get(name);
    if (!store) {
      void reply.code(404).send({
        error: { code: "PROJECT_NOT_FOUND", message: `Project not found: ${name}` },
      });
      return null;
    }
    return store;
  };

  const mapError = (err: unknown): { statusCode: number; body: unknown } => {
    if (err instanceof ConfigValidationError) {
      return {
        statusCode: 400,
        body: {
          error: {
            code: "INVALID_CONFIG",
            message: err.message,
            issues: err.issues,
          },
        },
      };
    }
    if (err instanceof UnknownConfigKeyError) {
      return {
        statusCode: 404,
        body: {
          error: {
            code: "UNKNOWN_CONFIG_KEY",
            message: err.message,
          },
        },
      };
    }
    return {
      statusCode: 500,
      body: { error: { code: "INTERNAL", message: (err as Error).message } },
    };
  };

  app.get<{ Params: { name: string } }>(
    "/api/v1/projects/:name/config",
    async (request, reply) => {
      const store = requireStore(request.params.name, reply);
      if (store === null) return;
      return { config: store.get(), overrides: store.getOverrides() };
    },
  );

  app.put<{ Params: { name: string } }>(
    "/api/v1/projects/:name/config",
    async (request, reply) => {
      const store = requireStore(request.params.name, reply);
      if (store === null) return;
      try {
        const merged = await store.replace(request.body as ProjectMetadataConfig);
        return { config: merged };
      } catch (err) {
        const { statusCode, body } = mapError(err);
        return reply.code(statusCode).send(body);
      }
    },
  );

  app.patch<{ Params: { name: string } }>(
    "/api/v1/projects/:name/config",
    async (request, reply) => {
      const store = requireStore(request.params.name, reply);
      if (store === null) return;
      try {
        const merged = await store.patch(request.body as Partial<ProjectMetadataConfig>);
        return { config: merged };
      } catch (err) {
        const { statusCode, body } = mapError(err);
        return reply.code(statusCode).send(body);
      }
    },
  );

  app.delete<{ Params: { name: string; key: string } }>(
    "/api/v1/projects/:name/config/:key",
    async (request, reply) => {
      const store = requireStore(request.params.name, reply);
      if (store === null) return;
      try {
        const merged = await store.unset(
          request.params.key as keyof ProjectMetadataConfig & string,
        );
        return { config: merged };
      } catch (err) {
        const { statusCode, body } = mapError(err);
        return reply.code(statusCode).send(body);
      }
    },
  );
}
```

- [ ] **Step 4: Register the route plugin in app.ts**

In `packages/daemon/src/server/app.ts`, add import:
```typescript
import { projectConfigRoutes } from "./routes/project-config.js";
```

Add registration after `configRoutes` (after line 80):
```typescript
  void app.register(projectConfigRoutes);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm run test -- packages/daemon/src/server/routes/project-config.test.ts`
Expected: All PASS

- [ ] **Step 6: Run the full daemon test suite**

Run: `pnpm run test -- packages/daemon`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/server/routes/project-config.ts packages/daemon/src/server/routes/project-config.test.ts packages/daemon/src/server/app.ts
git commit -m "feat(daemon): add project config REST routes"
```

---

### Task 6: Add Pilot Config Schema and In-Memory Store

**Files:**
- Modify: `packages/daemon/src/config/schema.ts`
- Create: `packages/daemon/src/config/pilot-config-store.ts`
- Create: `packages/daemon/src/config/pilot-config-store.test.ts`

- [ ] **Step 1: Add PilotConfig schema and defaults to schema.ts**

In `packages/daemon/src/config/schema.ts`, add after the `PROJECT_METADATA_DEFAULTS`:

```typescript
/**
 * Schema for per-pilot configuration.
 *
 * Separate from the pilot identity record — this covers operational
 * configuration that can be modified independently.
 *
 * @see RULE-PILOT-1
 */
export const PILOT_CONFIG_SCHEMA = z
  .object({
    certifications: z.array(z.string()),
    mcpServers: z.record(MCP_SERVER_CONFIG_SCHEMA),
    skills: z.array(z.string()),
  })
  .passthrough();

/** Inferred TypeScript type for pilot config. */
export type PilotConfig = z.infer<typeof PILOT_CONFIG_SCHEMA>;

/**
 * Default pilot configuration. Used when a pilot has no config overrides.
 */
export const PILOT_CONFIG_DEFAULTS: PilotConfig = {
  certifications: [],
  mcpServers: {},
  skills: [],
};
```

- [ ] **Step 2: Write the failing test for the in-memory store**

Create `packages/daemon/src/config/pilot-config-store.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { PilotConfigStore } from "./pilot-config-store.js";
import { PILOT_CONFIG_DEFAULTS } from "./schema.js";

describe("PilotConfigStore", () => {
  it("returns defaults for an unknown pilot", () => {
    const publish = vi.fn();
    const store = new PilotConfigStore(publish);
    expect(store.get("pilot-1")).toEqual(PILOT_CONFIG_DEFAULTS);
    expect(store.getOverrides("pilot-1")).toEqual({});
  });

  it("patches a pilot config and publishes on the correct channel", () => {
    const publish = vi.fn();
    const store = new PilotConfigStore(publish);
    const merged = store.patch("pilot-1", { certifications: ["captain"] });
    expect(merged.certifications).toEqual(["captain"]);
    expect(merged.mcpServers).toEqual({});
    expect(publish).toHaveBeenCalledWith(
      "config:pilot:pilot-1",
      expect.objectContaining({ source: "api" }),
    );
  });

  it("replaces a pilot config entirely", () => {
    const publish = vi.fn();
    const store = new PilotConfigStore(publish);
    store.patch("pilot-1", { certifications: ["captain"] });
    const merged = store.replace("pilot-1", {
      certifications: ["first-officer"],
      mcpServers: {},
      skills: ["navigation"],
    });
    expect(merged.certifications).toEqual(["first-officer"]);
    expect(merged.skills).toEqual(["navigation"]);
  });

  it("unsets a key, reverting to default", () => {
    const publish = vi.fn();
    const store = new PilotConfigStore(publish);
    store.patch("pilot-1", { certifications: ["captain"] });
    const merged = store.unset("pilot-1", "certifications");
    expect(merged.certifications).toEqual([]);
  });

  it("throws on unset of unknown key", () => {
    const publish = vi.fn();
    const store = new PilotConfigStore(publish);
    expect(() => store.unset("pilot-1", "bogus")).toThrow();
  });

  it("removes a pilot config", () => {
    const publish = vi.fn();
    const store = new PilotConfigStore(publish);
    store.patch("pilot-1", { certifications: ["captain"] });
    store.remove("pilot-1");
    expect(store.get("pilot-1")).toEqual(PILOT_CONFIG_DEFAULTS);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm run test -- packages/daemon/src/config/pilot-config-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the in-memory pilot config store**

Create `packages/daemon/src/config/pilot-config-store.ts`:

```typescript
/**
 * In-memory pilot configuration store.
 *
 * Provides the same API shape as LayeredConfigStore (get, getOverrides,
 * patch, replace, unset) but backed by an in-memory Map. Will be upgraded
 * to LayeredConfigStore once pilot persistence is implemented.
 *
 * @see RULE-PILOT-1
 */

import { UnknownConfigKeyError } from "@airtrafficcontrol/errors";
import {
  PILOT_CONFIG_DEFAULTS,
  PILOT_CONFIG_SCHEMA,
  type PilotConfig,
} from "./schema.js";

/**
 * In-memory store for per-pilot configuration.
 *
 * Each pilot's config is tracked as a sparse overrides object. Reads merge
 * overrides with defaults. Mutations broadcast on `config:pilot:<id>`.
 */
export class PilotConfigStore {
  private readonly _overrides = new Map<string, Record<string, unknown>>();
  private readonly _publish: (channel: string, data: unknown) => void;

  constructor(publish: (channel: string, data: unknown) => void) {
    this._publish = publish;
  }

  /** Returns the merged config for a pilot (defaults + overrides). */
  get(pilotId: string): PilotConfig {
    const overrides = this._overrides.get(pilotId) ?? {};
    return { ...PILOT_CONFIG_DEFAULTS, ...overrides } as PilotConfig;
  }

  /** Returns only the sparse overrides for a pilot. */
  getOverrides(pilotId: string): Record<string, unknown> {
    return { ...(this._overrides.get(pilotId) ?? {}) };
  }

  /** Partially merge fields into a pilot's config. */
  patch(pilotId: string, partial: Partial<PilotConfig>): PilotConfig {
    const existing = this._overrides.get(pilotId) ?? {};
    const next = { ...existing, ...partial };
    this._overrides.set(pilotId, next);
    const merged = { ...PILOT_CONFIG_DEFAULTS, ...next } as PilotConfig;
    this._publish(`config:pilot:${pilotId}`, { config: merged, source: "api" });
    return merged;
  }

  /** Full replacement of a pilot's config. */
  replace(pilotId: string, config: PilotConfig): PilotConfig {
    const result = PILOT_CONFIG_SCHEMA.parse(config);
    const sparse: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) {
      if (JSON.stringify(value) !== JSON.stringify((PILOT_CONFIG_DEFAULTS as Record<string, unknown>)[key])) {
        sparse[key] = value;
      }
    }
    this._overrides.set(pilotId, sparse);
    const merged = { ...PILOT_CONFIG_DEFAULTS, ...sparse } as PilotConfig;
    this._publish(`config:pilot:${pilotId}`, { config: merged, source: "api" });
    return merged;
  }

  /** Revert a single key to its default value. */
  unset(pilotId: string, key: string): PilotConfig {
    if (!(key in PILOT_CONFIG_DEFAULTS)) {
      throw new UnknownConfigKeyError(key);
    }
    const existing = this._overrides.get(pilotId) ?? {};
    const next = { ...existing };
    delete next[key];
    this._overrides.set(pilotId, next);
    const merged = { ...PILOT_CONFIG_DEFAULTS, ...next } as PilotConfig;
    this._publish(`config:pilot:${pilotId}`, { config: merged, source: "api" });
    return merged;
  }

  /** Remove all config for a pilot. */
  remove(pilotId: string): void {
    this._overrides.delete(pilotId);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm run test -- packages/daemon/src/config/pilot-config-store.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/config/schema.ts packages/daemon/src/config/pilot-config-store.ts packages/daemon/src/config/pilot-config-store.test.ts
git commit -m "feat(daemon): add PilotConfig schema and in-memory pilot config store"
```

---

### Task 7: Add Pilot Config REST Routes

**Files:**
- Create: `packages/daemon/src/server/routes/pilot-config.ts`
- Create: `packages/daemon/src/server/routes/pilot-config.test.ts`
- Modify: `packages/daemon/src/server/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/daemon/src/server/routes/pilot-config.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app.js";
import { ChannelRegistry } from "../websocket/channels.js";
import { PilotConfigStore } from "../../config/pilot-config-store.js";
import { PILOT_CONFIG_DEFAULTS } from "../../config/schema.js";

async function bootApp() {
  const profileDir = await mkdtemp(join(tmpdir(), "atc-pilotcfg-"));
  const channels = new ChannelRegistry();
  const publishSpy = vi.spyOn(channels, "publish");
  const pilotConfigStore = new PilotConfigStore(channels.publish.bind(channels));

  const app = createApp({
    profileDir,
    channelRegistry: channels,
    pilotConfigStore,
  });
  await app.ready();
  return { app, profileDir, publishSpy, pilotConfigStore };
}

describe("GET /api/v1/projects/:name/pilots/:id/config", () => {
  it("returns defaults for a pilot with no overrides", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/projects/proj/pilots/pilot-1/config",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config).toEqual(PILOT_CONFIG_DEFAULTS);
    expect(res.json().overrides).toEqual({});
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});

describe("PATCH /api/v1/projects/:name/pilots/:id/config", () => {
  it("merges partial config", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/projects/proj/pilots/pilot-1/config",
      payload: { certifications: ["captain"] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.certifications).toEqual(["captain"]);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});

describe("PUT /api/v1/projects/:name/pilots/:id/config", () => {
  it("replaces config entirely", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/projects/proj/pilots/pilot-1/config",
      payload: { certifications: ["first-officer"], mcpServers: {}, skills: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.certifications).toEqual(["first-officer"]);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});

describe("DELETE /api/v1/projects/:name/pilots/:id/config/:key", () => {
  it("reverts a key to default", async () => {
    const { app, profileDir } = await bootApp();
    await app.inject({
      method: "PATCH",
      url: "/api/v1/projects/proj/pilots/pilot-1/config",
      payload: { certifications: ["captain"] },
    });
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/projects/proj/pilots/pilot-1/config/certifications",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.certifications).toEqual([]);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns 404 for unknown key", async () => {
    const { app, profileDir } = await bootApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/projects/proj/pilots/pilot-1/config/bogus",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});

describe("publishes on config:pilot channel", () => {
  it("publishes after a successful PATCH", async () => {
    const { app, profileDir, publishSpy } = await bootApp();
    publishSpy.mockClear();
    await app.inject({
      method: "PATCH",
      url: "/api/v1/projects/proj/pilots/pilot-1/config",
      payload: { certifications: ["captain"] },
    });
    const call = publishSpy.mock.calls.find((c) => c[0] === "config:pilot:pilot-1");
    expect(call).toBeDefined();
    await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/daemon/src/server/routes/pilot-config.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the pilot config routes**

Create `packages/daemon/src/server/routes/pilot-config.ts`:

```typescript
/**
 * REST routes for per-pilot configuration management.
 *
 * Backed by an in-memory PilotConfigStore. Broadcasts change events on
 * `config:pilot:<id>` channels.
 *
 * @see RULE-PILOT-1
 */

import type { FastifyInstance } from "fastify";
import { UnknownConfigKeyError } from "@airtrafficcontrol/errors";
import type { PilotConfig } from "../../config/schema.js";

interface PilotConfigParams {
  name: string;
  id: string;
}

interface PilotConfigKeyParams extends PilotConfigParams {
  key: string;
}

/**
 * Registers `/api/v1/projects/:name/pilots/:id/config` routes.
 */
export async function pilotConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: PilotConfigParams }>(
    "/api/v1/projects/:name/pilots/:id/config",
    async (request, _reply) => {
      const { id } = request.params;
      return {
        config: app.pilotConfigStore.get(id),
        overrides: app.pilotConfigStore.getOverrides(id),
      };
    },
  );

  app.put<{ Params: PilotConfigParams }>(
    "/api/v1/projects/:name/pilots/:id/config",
    async (request, reply) => {
      const { id } = request.params;
      try {
        const merged = app.pilotConfigStore.replace(id, request.body as PilotConfig);
        return { config: merged };
      } catch (err) {
        return reply.code(400).send({
          error: { code: "INVALID_CONFIG", message: (err as Error).message },
        });
      }
    },
  );

  app.patch<{ Params: PilotConfigParams }>(
    "/api/v1/projects/:name/pilots/:id/config",
    async (request, _reply) => {
      const { id } = request.params;
      const merged = app.pilotConfigStore.patch(id, request.body as Partial<PilotConfig>);
      return { config: merged };
    },
  );

  app.delete<{ Params: PilotConfigKeyParams }>(
    "/api/v1/projects/:name/pilots/:id/config/:key",
    async (request, reply) => {
      const { id, key } = request.params;
      try {
        const merged = app.pilotConfigStore.unset(id, key);
        return { config: merged };
      } catch (err) {
        if (err instanceof UnknownConfigKeyError) {
          return reply.code(404).send({
            error: { code: "UNKNOWN_CONFIG_KEY", message: err.message },
          });
        }
        return reply.code(500).send({
          error: { code: "INTERNAL", message: (err as Error).message },
        });
      }
    },
  );
}
```

- [ ] **Step 4: Wire into app.ts**

In `packages/daemon/src/server/app.ts`:

Add imports:
```typescript
import { pilotConfigRoutes } from "./routes/pilot-config.js";
import { PilotConfigStore } from "../config/pilot-config-store.js";
```

Add to `AppOptions` (after the `projectConfigStores` line):
```typescript
  /** Store for per-pilot configuration (in-memory). */
  pilotConfigStore?: PilotConfigStore;
```

Add decoration in `createApp` (after the `projectConfigStores` decoration):
```typescript
  app.decorate(
    "pilotConfigStore",
    options.pilotConfigStore ??
      new PilotConfigStore(
        (options.channelRegistry ?? new ChannelRegistry()).publish.bind(
          options.channelRegistry ?? new ChannelRegistry(),
        ),
      ),
  );
```

Register the route plugin:
```typescript
  void app.register(pilotConfigRoutes);
```

Add to `declare module "fastify"` block:
```typescript
    /** In-memory store for per-pilot config. */
    pilotConfigStore: PilotConfigStore;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm run test -- packages/daemon/src/server/routes/pilot-config.test.ts`
Expected: All PASS

- [ ] **Step 6: Run the full daemon test suite**

Run: `pnpm run test -- packages/daemon`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/server/routes/pilot-config.ts packages/daemon/src/server/routes/pilot-config.test.ts packages/daemon/src/server/app.ts
git commit -m "feat(daemon): add pilot config REST routes (in-memory)"
```

---

### Task 8: Extend WebSocket Handler for Project and Pilot Config

**Files:**
- Modify: `packages/daemon/src/types.ts`
- Modify: `packages/daemon/src/server/websocket/handler.ts`
- Modify: `packages/daemon/src/server/app.ts`
- Modify: `packages/daemon/src/server/websocket/handler.test.ts` (if it exists, else create)

- [ ] **Step 1: Extend WsClientMessage type**

In `packages/daemon/src/types.ts`, replace lines 242-249 with:

```typescript
export type WsClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string }
  | { type: "ping" }
  | { type: "pong" }
  | { type: "config.patch"; scope: "global"; body: Record<string, unknown>; requestId: string }
  | { type: "config.replace"; scope: "global"; body: Record<string, unknown>; requestId: string }
  | { type: "config.unset"; scope: "global"; key: string; requestId: string }
  | { type: "config.patch"; scope: "project"; project: string; body: Record<string, unknown>; requestId: string }
  | { type: "config.replace"; scope: "project"; project: string; body: Record<string, unknown>; requestId: string }
  | { type: "config.unset"; scope: "project"; project: string; key: string; requestId: string }
  | { type: "config.patch"; scope: "pilot"; pilotId: string; body: Record<string, unknown>; requestId: string }
  | { type: "config.replace"; scope: "pilot"; pilotId: string; body: Record<string, unknown>; requestId: string }
  | { type: "config.unset"; scope: "pilot"; pilotId: string; key: string; requestId: string };
```

- [ ] **Step 2: Update WebSocket handler to dispatch project and pilot config**

In `packages/daemon/src/server/websocket/handler.ts`:

Add imports:
```typescript
import type { LayeredConfigStore } from "../../config/layered-store.js";
import type { ProjectMetadataConfig } from "../../config/schema.js";
import type { PilotConfigStore } from "../../config/pilot-config-store.js";
```

Update `handleWsMessage` signature to accept the new stores:
```typescript
export async function handleWsMessage(
  message: WsClientMessage,
  clientId: string,
  send: (data: WsServerMessage) => void,
  channels: ChannelRegistry,
  heartbeat: HeartbeatTracker,
  globalConfigStore: LayeredConfigStore<GlobalConfig> | null = null,
  projectConfigStores: Map<string, LayeredConfigStore<ProjectMetadataConfig>> = new Map(),
  pilotConfigStore: PilotConfigStore | null = null,
): Promise<void> {
```

Update the config dispatch call in the switch statement:
```typescript
    case "config.patch":
    case "config.replace":
    case "config.unset":
      await dispatchConfig(message, send, globalConfigStore, projectConfigStores, pilotConfigStore);
      return;
```

Replace the `dispatchConfig` function to handle all three scopes:

```typescript
async function dispatchConfig(
  message: Extract<WsClientMessage, { type: "config.patch" | "config.replace" | "config.unset" }>,
  send: (data: WsServerMessage) => void,
  globalConfigStore: LayeredConfigStore<GlobalConfig> | null,
  projectConfigStores: Map<string, LayeredConfigStore<ProjectMetadataConfig>>,
  pilotConfigStore: PilotConfigStore | null,
): Promise<void> {
  const { requestId } = message;

  if (message.scope === "global") {
    await dispatchGlobalConfig(message, send, globalConfigStore);
  } else if (message.scope === "project") {
    await dispatchProjectConfig(message as Extract<typeof message, { scope: "project" }>, send, projectConfigStores);
  } else if (message.scope === "pilot") {
    dispatchPilotConfig(message as Extract<typeof message, { scope: "pilot" }>, send, pilotConfigStore);
  } else {
    send({
      type: "config.ack",
      requestId,
      ok: false,
      error: { code: "UNKNOWN_SCOPE", message: `Unknown config scope: ${String((message as Record<string, unknown>).scope)}` },
    });
  }
}
```

Extract the existing global logic into `dispatchGlobalConfig` (keep the existing code, just rename the function). Add project and pilot dispatch functions:

```typescript
async function dispatchProjectConfig(
  message: Extract<WsClientMessage, { scope: "project" }> & { type: "config.patch" | "config.replace" | "config.unset" },
  send: (data: WsServerMessage) => void,
  projectConfigStores: Map<string, LayeredConfigStore<ProjectMetadataConfig>>,
): Promise<void> {
  const { requestId, project } = message as { requestId: string; project: string; type: string };
  const store = projectConfigStores.get(project);
  if (!store) {
    send({
      type: "config.ack",
      requestId,
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: `Project not found: ${project}` },
    });
    return;
  }

  try {
    let merged: ProjectMetadataConfig;
    if (message.type === "config.patch") {
      merged = await store.patch(message.body as Partial<ProjectMetadataConfig>);
    } else if (message.type === "config.replace") {
      merged = await store.replace(message.body as ProjectMetadataConfig);
    } else {
      merged = await store.unset((message as { key: string }).key as keyof ProjectMetadataConfig & string);
    }
    send({ type: "config.ack", requestId, ok: true, config: merged as unknown as Record<string, unknown> });
  } catch (err) {
    sendConfigError(err, requestId, send);
  }
}

function dispatchPilotConfig(
  message: Extract<WsClientMessage, { scope: "pilot" }> & { type: "config.patch" | "config.replace" | "config.unset" },
  send: (data: WsServerMessage) => void,
  pilotConfigStore: PilotConfigStore | null,
): void {
  const { requestId, pilotId } = message as { requestId: string; pilotId: string; type: string };
  if (!pilotConfigStore) {
    send({
      type: "config.ack",
      requestId,
      ok: false,
      error: { code: "UNAVAILABLE", message: "Pilot config store not available" },
    });
    return;
  }

  try {
    let merged: Record<string, unknown>;
    if (message.type === "config.patch") {
      merged = pilotConfigStore.patch(pilotId, message.body as Record<string, unknown>) as unknown as Record<string, unknown>;
    } else if (message.type === "config.replace") {
      merged = pilotConfigStore.replace(pilotId, message.body as Record<string, unknown> as never) as unknown as Record<string, unknown>;
    } else {
      merged = pilotConfigStore.unset(pilotId, (message as { key: string }).key) as unknown as Record<string, unknown>;
    }
    send({ type: "config.ack", requestId, ok: true, config: merged });
  } catch (err) {
    sendConfigError(err, requestId, send);
  }
}

function sendConfigError(err: unknown, requestId: string, send: (data: WsServerMessage) => void): void {
  if (err instanceof ConfigValidationError) {
    send({ type: "config.ack", requestId, ok: false, error: { code: "INVALID_CONFIG", message: err.message, issues: err.issues as unknown[] } });
    return;
  }
  if (err instanceof UnknownConfigKeyError) {
    send({ type: "config.ack", requestId, ok: false, error: { code: "UNKNOWN_CONFIG_KEY", message: err.message } });
    return;
  }
  send({ type: "config.ack", requestId, ok: false, error: { code: "INTERNAL", message: (err as Error).message } });
}
```

- [ ] **Step 3: Update the WebSocket wiring in app.ts**

In `packages/daemon/src/server/app.ts`, update the `handleWsMessage` call (around line 100) to pass the new stores:

```typescript
          void handleWsMessage(
            message,
            clientId,
            send,
            instance.channelRegistry,
            heartbeat,
            instance.globalConfigStore,
            instance.projectConfigStores,
            instance.pilotConfigStore,
          );
```

- [ ] **Step 4: Run the full daemon test suite**

Run: `pnpm run test -- packages/daemon`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/types.ts packages/daemon/src/server/websocket/handler.ts packages/daemon/src/server/app.ts
git commit -m "feat(daemon): extend WebSocket handler for project and pilot config scopes"
```

---

### Task 9: Add Daemon About Endpoint

**Files:**
- Modify: `packages/daemon/src/server/routes/health.ts`
- Modify: `packages/daemon/src/server/routes/health.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/daemon/src/server/routes/health.test.ts`, add (or create if it doesn't have one for `/about`):

```typescript
describe("GET /api/v1/about", () => {
  it("returns version string", async () => {
    const app = createApp({});
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/v1/about" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/daemon/src/server/routes/health.test.ts`
Expected: FAIL — 404 for `/api/v1/about`

- [ ] **Step 3: Add the about route**

In `packages/daemon/src/server/routes/health.ts`, add after the status route:

```typescript
  /**
   * About endpoint.
   *
   * Returns the daemon version. Consumers (CLI, other services) can
   * use this to check the running daemon version.
   */
  app.get("/api/v1/about", async (_request, _reply) => {
    return { version: VERSION };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/daemon/src/server/routes/health.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/server/routes/health.ts packages/daemon/src/server/routes/health.test.ts
git commit -m "feat(daemon): add GET /api/v1/about endpoint"
```

---

### Task 10: Add Settings Routes to Web Router and Sidebar

**Files:**
- Modify: `packages/web/src/main.tsx`
- Modify: `packages/web/src/components/layout/sidebar.tsx`
- Create: `packages/web/src/routes/settings/general.tsx`
- Create: `packages/web/src/routes/settings/profile.tsx`
- Create: `packages/web/src/routes/settings/about.tsx`

- [ ] **Step 1: Add settings routes to the router**

In `packages/web/src/main.tsx`, add inside the `children` array (after the checklists routes):

```typescript
      { path: "settings", lazy: () => import("@/routes/settings/general") },
      { path: "settings/general", lazy: () => import("@/routes/settings/general") },
      { path: "settings/profile", lazy: () => import("@/routes/settings/profile") },
      { path: "settings/about", lazy: () => import("@/routes/settings/about") },
      { path: "settings/project/:name", lazy: () => import("@/routes/settings/project-general") },
      { path: "settings/project/:name/general", lazy: () => import("@/routes/settings/project-general") },
      { path: "settings/project/:name/mcp-servers", lazy: () => import("@/routes/settings/project-mcp") },
      { path: "settings/pilot/:id", lazy: () => import("@/routes/settings/pilot-general") },
      { path: "settings/pilot/:id/general", lazy: () => import("@/routes/settings/pilot-general") },
      { path: "settings/pilot/:id/mcp-servers", lazy: () => import("@/routes/settings/pilot-mcp") },
```

- [ ] **Step 2: Add settings navigation to the sidebar**

In `packages/web/src/components/layout/sidebar.tsx`:

Add a `SettingsNav` component after `ProjectNav` and before the `Sidebar` export:

```typescript
const SETTINGS_NAV = [
  { to: "/settings/general", label: "General", icon: "+" },
  { to: "/settings/profile", label: "Profile", icon: "+" },
  { to: "/settings/about", label: "About", icon: "+" },
];

function SettingsNav() {
  return (
    <nav className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
      <div
        className="mb-2 text-[9px] uppercase tracking-widest"
        style={{ color: "var(--text-dim)" }}
      >
        SETTINGS
      </div>
      {SETTINGS_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
          style={({ isActive }) => ({
            color: isActive ? "var(--accent-green)" : "var(--text-muted)",
            backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
          })}
        >
          {item.icon} {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

Add `useMatch` for settings routes in the `Sidebar` component:
```typescript
  const settingsMatch = useMatch("/settings/*");
```

In NAV_ITEMS, add the settings entry:
```typescript
  { to: "/settings", label: "Settings", icon: "+" },
```

Render `SettingsNav` conditionally in the sidebar JSX (after the `ProjectNav` line):
```typescript
      {settingsMatch && <SettingsNav />}
```

- [ ] **Step 3: Create stub route files**

Create `packages/web/src/routes/settings/general.tsx`:

```typescript
import { PageHeader } from "@/components/base/page-header";

export function Component() {
  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings" }, { label: "General" }]} />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Global settings will be implemented in the next task.
          </div>
        </div>
      </div>
    </div>
  );
}
```

Create `packages/web/src/routes/settings/profile.tsx`:

```typescript
import { PageHeader } from "@/components/base/page-header";

export function Component() {
  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings" }, { label: "Profile" }]} />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Profile settings will be implemented in the next task.
          </div>
        </div>
      </div>
    </div>
  );
}
```

Create `packages/web/src/routes/settings/about.tsx`:

```typescript
import { PageHeader } from "@/components/base/page-header";

export function Component() {
  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings" }, { label: "About" }]} />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            About page will be implemented in the next task.
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify the build succeeds**

Run: `pnpm --filter @airtrafficcontrol/web build`
Expected: Build succeeds (or at minimum `tsc -b` passes)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/main.tsx packages/web/src/components/layout/sidebar.tsx packages/web/src/routes/settings/
git commit -m "feat(web): add settings route structure and sidebar navigation"
```

---

### Task 11: Add Config API Hooks and Query Keys

**Files:**
- Modify: `packages/web/src/lib/query-keys.ts`
- Modify: `packages/web/src/hooks/use-api.ts`
- Modify: `packages/web/src/types/api.ts`

- [ ] **Step 1: Add config types to api.ts**

In `packages/web/src/types/api.ts`, add:

```typescript
export interface GlobalConfig {
  defaultProfile: string;
}

export interface ProfileConfig {
  port: number;
  host: string;
  logLevel: "debug" | "info" | "warn" | "error";
  autoRecover: boolean;
  wsHeartbeatInterval: number;
  stateFlushInterval: number;
}

export interface PilotConfig {
  certifications: string[];
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  skills: string[];
}

export interface ConfigResponse<T> {
  config: T;
  overrides: Record<string, unknown>;
}
```

- [ ] **Step 2: Add query keys for config endpoints**

In `packages/web/src/lib/query-keys.ts`, add before the closing `}`:

```typescript
  config: {
    global: () => ["config", "global"] as const,
    project: (name: string) => ["config", "project", name] as const,
    pilot: (id: string) => ["config", "pilot", id] as const,
  },
```

- [ ] **Step 3: Add config hooks to use-api.ts**

In `packages/web/src/hooks/use-api.ts`, add the imports for the new types and add hooks:

```typescript
import type {
  // ...existing imports...
  GlobalConfig,
  ProfileConfig,
  PilotConfig,
  ConfigResponse,
} from "@/types/api";

// --- Config hooks ---

export function useGlobalConfig() {
  return useQuery({
    queryKey: queryKeys.config.global(),
    queryFn: () => apiClient.get<ConfigResponse<GlobalConfig>>("/api/v1/config/global"),
  });
}

export function usePatchGlobalConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<GlobalConfig>) =>
      apiClient.patch<{ config: GlobalConfig }>("/api/v1/config/global", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.global() });
    },
  });
}

export function useProjectConfig(name: string) {
  return useQuery({
    queryKey: queryKeys.config.project(name),
    queryFn: () =>
      apiClient.get<ConfigResponse<ProjectMetadata>>(`/api/v1/projects/${name}/config`),
  });
}

export function usePatchProjectConfig(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ProjectMetadata>) =>
      apiClient.patch<{ config: ProjectMetadata }>(`/api/v1/projects/${name}/config`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.project(name) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(name) });
    },
  });
}

export function usePilotConfig(id: string) {
  return useQuery({
    queryKey: queryKeys.config.pilot(id),
    queryFn: () =>
      apiClient.get<ConfigResponse<PilotConfig>>(
        `/api/v1/projects/_/pilots/${id}/config`,
      ),
  });
}

export function usePatchPilotConfig(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<PilotConfig>) =>
      apiClient.patch<{ config: PilotConfig }>(
        `/api/v1/projects/_/pilots/${id}/config`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.pilot(id) });
    },
  });
}
```

Note: Check if `apiClient` has a `patch` method. If not, add one following the same pattern as `post` and `put`. Inspect `packages/web/src/lib/api-client.ts` and add if missing:

```typescript
  async patch<T>(url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`PATCH ${url} failed: ${res.status}`);
    return res.json() as Promise<T>;
  },
```

- [ ] **Step 4: Verify the build succeeds**

Run: `pnpm --filter @airtrafficcontrol/web build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/query-keys.ts packages/web/src/hooks/use-api.ts packages/web/src/types/api.ts packages/web/src/lib/api-client.ts
git commit -m "feat(web): add config API hooks, query keys, and types"
```

---

### Task 12: Implement Global Settings General Page

**Files:**
- Modify: `packages/web/src/routes/settings/general.tsx`

- [ ] **Step 1: Implement the general settings page**

Replace `packages/web/src/routes/settings/general.tsx`:

```typescript
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/base/page-header";
import { useGlobalConfig, usePatchGlobalConfig } from "@/hooks/use-api";

export function Component() {
  const { data, isLoading } = useGlobalConfig();
  const patchConfig = usePatchGlobalConfig();
  const [defaultProfile, setDefaultProfile] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.config) {
      setDefaultProfile(data.config.defaultProfile);
    }
  }, [data]);

  const handleSave = () => {
    patchConfig.mutate(
      { defaultProfile },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: "General" }]} />
        <div className="mt-5 text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: "General" }]} />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div
            className="mb-4 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            GLOBAL CONFIGURATION
          </div>
          <div className="mb-3">
            <label
              className="mb-1 block text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              Default Profile
            </label>
            <input
              type="text"
              value={defaultProfile}
              onChange={(e) => setDefaultProfile(e.target.value)}
              className="w-full rounded-md border px-3 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={patchConfig.isPending}
              className="rounded-md px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
            >
              {patchConfig.isPending ? "Saving..." : "Save"}
            </button>
            {saved && (
              <span className="text-[11px]" style={{ color: "var(--accent-green)" }}>
                Saved
              </span>
            )}
            {patchConfig.isError && (
              <span className="text-[11px]" style={{ color: "var(--accent-red)" }}>
                Error: {patchConfig.error.message}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @airtrafficcontrol/web build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/settings/general.tsx
git commit -m "feat(web): implement global settings general page"
```

---

### Task 13: Implement Profile Settings Page

**Files:**
- Modify: `packages/web/src/routes/settings/profile.tsx`

- [ ] **Step 1: Implement the profile settings page**

Replace `packages/web/src/routes/settings/profile.tsx`:

```typescript
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/base/page-header";
import { useHealth } from "@/hooks/use-api";

/**
 * Profile settings page.
 *
 * Note: The daemon currently has no REST endpoint for reading/writing profile
 * config at runtime (profile config is loaded once at boot). This page displays
 * the current values from the health/status endpoint and will be wired to a
 * profile config store when one is added.
 */
export function Component() {
  const { data: health } = useHealth();

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: "Profile" }]} />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div
            className="mb-4 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            PROFILE CONFIGURATION
          </div>
          <div className="space-y-3">
            {[
              { label: "Port", field: "port", type: "number", placeholder: "7700" },
              { label: "Host", field: "host", type: "text", placeholder: "127.0.0.1" },
              { label: "Log Level", field: "logLevel", type: "select", options: ["debug", "info", "warn", "error"] },
              { label: "Auto-Recover", field: "autoRecover", type: "toggle" },
              { label: "WebSocket Heartbeat Interval (s)", field: "wsHeartbeatInterval", type: "number", placeholder: "15" },
              { label: "State Flush Interval (s)", field: "stateFlushInterval", type: "number", placeholder: "30" },
            ].map((item) => (
              <div key={item.field}>
                <label
                  className="mb-1 block text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {item.label}
                </label>
                {item.type === "select" ? (
                  <select
                    disabled
                    className="w-full rounded-md border px-3 py-1.5 text-xs"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {item.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : item.type === "toggle" ? (
                  <div
                    className="inline-block rounded-md border px-3 py-1.5 text-xs"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border)",
                      color: "var(--text-dim)",
                    }}
                  >
                    false (read-only)
                  </div>
                ) : (
                  <input
                    type={item.type}
                    disabled
                    placeholder={item.placeholder}
                    className="w-full rounded-md border px-3 py-1.5 text-xs"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 text-[11px]" style={{ color: "var(--text-dim)" }}>
            Profile configuration is currently read-only at boot. A runtime profile config endpoint is planned.
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @airtrafficcontrol/web build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/settings/profile.tsx
git commit -m "feat(web): implement profile settings page (read-only)"
```

---

### Task 14: Implement About Page with Build-Time Data

**Files:**
- Modify: `packages/web/vite.config.ts`
- Modify: `packages/web/src/routes/settings/about.tsx`
- Create: `packages/web/src/vite-env.d.ts` (if not present, for type declarations)

- [ ] **Step 1: Add build-time data injection to Vite config**

In `packages/web/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync } from "node:fs";

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function getChangelog(): string {
  try {
    return readFileSync(path.resolve(__dirname, "CHANGELOG.md"), "utf-8");
  } catch {
    return "# Changelog\n\nNo changelog available.";
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __ATC_VERSION__: JSON.stringify(getVersion()),
    __ATC_CHANGELOG__: JSON.stringify(getChangelog()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:7700",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:7700",
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 2: Add type declarations for the global constants**

Check if `packages/web/src/vite-env.d.ts` exists. If it does, add to it. If not, create it:

```typescript
/// <reference types="vite/client" />

declare const __ATC_VERSION__: string;
declare const __ATC_CHANGELOG__: string;
```

- [ ] **Step 3: Implement the about page**

Replace `packages/web/src/routes/settings/about.tsx`:

```typescript
import { PageHeader } from "@/components/base/page-header";

export function Component() {
  const version = __ATC_VERSION__;
  const changelog = __ATC_CHANGELOG__;

  // Parse changelog into sections (split on ## headers)
  const sections = changelog
    .split(/^## /m)
    .filter(Boolean)
    .slice(0, 5)
    .map((section) => {
      const [title, ...body] = section.split("\n");
      return { title: title.trim(), body: body.join("\n").trim() };
    });

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: "About" }]} />
      <div className="mt-5 space-y-4">
        {/* Version */}
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div
            className="mb-2 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            VERSION
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--accent-green)" }}>
            {version}
          </div>
        </div>

        {/* Changelog */}
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div
            className="mb-3 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            CHANGELOG
          </div>
          {sections.length === 0 ? (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              No changelog entries available.
            </div>
          ) : (
            <div className="space-y-3">
              {sections.map((section) => (
                <div key={section.title}>
                  <div
                    className="mb-1 text-xs font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {section.title}
                  </div>
                  <pre
                    className="whitespace-pre-wrap text-[11px] leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {section.body}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `pnpm --filter @airtrafficcontrol/web build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/web/vite.config.ts packages/web/src/vite-env.d.ts packages/web/src/routes/settings/about.tsx
git commit -m "feat(web): implement about page with build-time version and changelog"
```

---

### Task 15: Implement Project Settings Pages

**Files:**
- Create: `packages/web/src/routes/settings/project-general.tsx`
- Create: `packages/web/src/routes/settings/project-mcp.tsx`
- Modify: `packages/web/src/routes/projects/detail.tsx`
- Modify: `packages/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add project settings sidebar section**

In `packages/web/src/components/layout/sidebar.tsx`, add a `ProjectSettingsNav` component:

```typescript
function ProjectSettingsNav({ name }: { name: string }) {
  return (
    <nav className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
      <div
        className="mb-2 text-[9px] uppercase tracking-widest"
        style={{ color: "var(--text-dim)" }}
      >
        PROJECT SETTINGS: {name.toUpperCase()}
      </div>
      <NavLink
        to="/settings"
        className="mb-2 block px-2 py-1 text-xs no-underline opacity-50"
        style={{ color: "var(--text-muted)" }}
      >
        ← Back to Settings
      </NavLink>
      <NavLink
        to={`/settings/project/${name}/general`}
        className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
        style={({ isActive }) => ({
          color: isActive ? "var(--accent-green)" : "var(--text-muted)",
          backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
        })}
      >
        + General
      </NavLink>
      <NavLink
        to={`/settings/project/${name}/mcp-servers`}
        className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
        style={({ isActive }) => ({
          color: isActive ? "var(--accent-green)" : "var(--text-muted)",
          backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
        })}
      >
        + MCP Servers
      </NavLink>
    </nav>
  );
}
```

In the `Sidebar` component, add:
```typescript
  const projectSettingsMatch = useMatch("/settings/project/:name/*");
  const projectSettingsName = projectSettingsMatch?.params.name;
```

And render conditionally:
```typescript
      {projectSettingsName && <ProjectSettingsNav name={projectSettingsName} />}
```

- [ ] **Step 2: Implement project general settings page**

Create `packages/web/src/routes/settings/project-general.tsx`:

```typescript
import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { PageHeader } from "@/components/base/page-header";
import { useProjectConfig, usePatchProjectConfig } from "@/hooks/use-api";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const { data, isLoading } = useProjectConfig(name!);
  const patchConfig = usePatchProjectConfig(name!);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [checklist, setChecklist] = useState<{ name: string; command: string; timeout?: number }[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.config) {
      setCategories(data.config.categories);
      setChecklist(data.config.checklist);
    }
  }, [data]);

  const addCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()]);
      setNewCategory("");
    }
  };

  const removeCategory = (cat: string) => {
    setCategories(categories.filter((c) => c !== cat));
  };

  const addChecklistItem = () => {
    setChecklist([...checklist, { name: "", command: "" }]);
  };

  const updateChecklistItem = (index: number, field: string, value: string | number) => {
    const updated = [...checklist];
    updated[index] = { ...updated[index], [field]: value };
    setChecklist(updated);
  };

  const removeChecklistItem = (index: number) => {
    setChecklist(checklist.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    patchConfig.mutate(
      { categories, checklist },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: name! }, { label: "General" }]} />
        <div className="mt-5 text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: name! }, { label: "General" }]} />
      <div className="mt-5 space-y-4">
        {/* Categories */}
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            CATEGORIES
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <span
                key={cat}
                className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px]"
                style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}
              >
                {cat}
                <button
                  onClick={() => removeCategory(cat)}
                  className="ml-1 text-[10px]"
                  style={{ color: "var(--text-dim)" }}
                >
                  x
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              placeholder="Add category..."
              className="flex-1 rounded-md border px-3 py-1.5 text-xs"
              style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
            <button
              onClick={addCategory}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Checklist */}
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            CHECKLIST ITEMS
          </div>
          <div className="space-y-2">
            {checklist.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md p-2"
                style={{ backgroundColor: "var(--bg-elevated)" }}
              >
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateChecklistItem(i, "name", e.target.value)}
                  placeholder="Name"
                  className="w-1/3 rounded-md border px-2 py-1 text-[11px]"
                  style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
                <input
                  type="text"
                  value={item.command}
                  onChange={(e) => updateChecklistItem(i, "command", e.target.value)}
                  placeholder="Command"
                  className="flex-1 rounded-md border px-2 py-1 font-mono text-[11px]"
                  style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
                <button
                  onClick={() => removeChecklistItem(i)}
                  className="text-[11px]"
                  style={{ color: "var(--accent-red)" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addChecklistItem}
            className="mt-2 rounded-md px-3 py-1.5 text-xs"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            + Add Item
          </button>
        </div>

        {/* Save */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={patchConfig.isPending}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
          >
            {patchConfig.isPending ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-[11px]" style={{ color: "var(--accent-green)" }}>Saved</span>}
          {patchConfig.isError && <span className="text-[11px]" style={{ color: "var(--accent-red)" }}>Error: {patchConfig.error.message}</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement project MCP servers settings page**

Create `packages/web/src/routes/settings/project-mcp.tsx`:

```typescript
import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { PageHeader } from "@/components/base/page-header";
import { useProjectConfig, usePatchProjectConfig } from "@/hooks/use-api";

interface McpServerEntry {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function Component() {
  const { name } = useParams<{ name: string }>();
  const { data, isLoading } = useProjectConfig(name!);
  const patchConfig = usePatchProjectConfig(name!);
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.config?.mcpServers) {
      setServers(
        Object.entries(data.config.mcpServers).map(([serverName, config]) => ({
          name: serverName,
          command: config.command,
          args: config.args,
          env: config.env ?? {},
        })),
      );
    }
  }, [data]);

  const addServer = () => {
    setServers([...servers, { name: "", command: "", args: [], env: {} }]);
  };

  const updateServer = (index: number, field: string, value: string | string[]) => {
    const updated = [...servers];
    updated[index] = { ...updated[index], [field]: value };
    setServers(updated);
  };

  const removeServer = (index: number) => {
    setServers(servers.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {};
    for (const server of servers) {
      if (server.name.trim()) {
        mcpServers[server.name.trim()] = {
          command: server.command,
          args: server.args,
          ...(Object.keys(server.env).length > 0 ? { env: server.env } : {}),
        };
      }
    }
    patchConfig.mutate(
      { mcpServers },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: name! }, { label: "MCP Servers" }]} />
        <div className="mt-5 text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: name! }, { label: "MCP Servers" }]} />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            MCP SERVERS
          </div>
          <div className="space-y-3">
            {servers.map((server, i) => (
              <div
                key={i}
                className="rounded-md border p-3"
                style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border)" }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <input
                    type="text"
                    value={server.name}
                    onChange={(e) => updateServer(i, "name", e.target.value)}
                    placeholder="Server name"
                    className="rounded-md border px-2 py-1 text-[11px] font-semibold"
                    style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                  <button onClick={() => removeServer(i)} className="text-[11px]" style={{ color: "var(--accent-red)" }}>
                    Remove
                  </button>
                </div>
                <div className="mb-2">
                  <label className="mb-1 block text-[10px]" style={{ color: "var(--text-dim)" }}>Command</label>
                  <input
                    type="text"
                    value={server.command}
                    onChange={(e) => updateServer(i, "command", e.target.value)}
                    placeholder="e.g., npx"
                    className="w-full rounded-md border px-2 py-1 font-mono text-[11px]"
                    style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px]" style={{ color: "var(--text-dim)" }}>Args (comma-separated)</label>
                  <input
                    type="text"
                    value={server.args.join(", ")}
                    onChange={(e) => updateServer(i, "args", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    placeholder="e.g., -y, @modelcontextprotocol/server"
                    className="w-full rounded-md border px-2 py-1 font-mono text-[11px]"
                    style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={addServer}
            className="mt-3 rounded-md px-3 py-1.5 text-xs"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            + Add Server
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={patchConfig.isPending}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
          >
            {patchConfig.isPending ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-[11px]" style={{ color: "var(--accent-green)" }}>Saved</span>}
          {patchConfig.isError && <span className="text-[11px]" style={{ color: "var(--accent-red)" }}>Error: {patchConfig.error.message}</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add settings link to project detail page**

In `packages/web/src/routes/projects/detail.tsx`, add a settings button in the right header section (alongside "+ New Pilot" and "+ New Craft"):

```typescript
            <Link
              to={`/settings/project/${name}`}
              className="rounded-md px-3 py-1.5 text-xs no-underline"
              style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              Settings
            </Link>
```

- [ ] **Step 5: Verify build**

Run: `pnpm --filter @airtrafficcontrol/web build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/routes/settings/project-general.tsx packages/web/src/routes/settings/project-mcp.tsx packages/web/src/routes/projects/detail.tsx packages/web/src/components/layout/sidebar.tsx
git commit -m "feat(web): implement project settings pages"
```

---

### Task 16: Implement Pilot Settings Pages

**Files:**
- Create: `packages/web/src/routes/settings/pilot-general.tsx`
- Create: `packages/web/src/routes/settings/pilot-mcp.tsx`
- Modify: `packages/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add pilot settings sidebar section**

In `packages/web/src/components/layout/sidebar.tsx`, add a `PilotSettingsNav` component:

```typescript
function PilotSettingsNav({ id }: { id: string }) {
  return (
    <nav className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
      <div
        className="mb-2 text-[9px] uppercase tracking-widest"
        style={{ color: "var(--text-dim)" }}
      >
        PILOT SETTINGS: {id.toUpperCase()}
      </div>
      <NavLink
        to="/settings"
        className="mb-2 block px-2 py-1 text-xs no-underline opacity-50"
        style={{ color: "var(--text-muted)" }}
      >
        ← Back to Settings
      </NavLink>
      <NavLink
        to={`/settings/pilot/${id}/general`}
        className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
        style={({ isActive }) => ({
          color: isActive ? "var(--accent-green)" : "var(--text-muted)",
          backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
        })}
      >
        + General
      </NavLink>
      <NavLink
        to={`/settings/pilot/${id}/mcp-servers`}
        className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
        style={({ isActive }) => ({
          color: isActive ? "var(--accent-green)" : "var(--text-muted)",
          backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
        })}
      >
        + MCP Servers
      </NavLink>
    </nav>
  );
}
```

In the `Sidebar` component, add:
```typescript
  const pilotSettingsMatch = useMatch("/settings/pilot/:id/*");
  const pilotSettingsId = pilotSettingsMatch?.params.id;
```

And render:
```typescript
      {pilotSettingsId && <PilotSettingsNav id={pilotSettingsId} />}
```

- [ ] **Step 2: Implement pilot general settings page**

Create `packages/web/src/routes/settings/pilot-general.tsx`:

```typescript
import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { PageHeader } from "@/components/base/page-header";
import { usePilotConfig, usePatchPilotConfig } from "@/hooks/use-api";

const CERT_OPTIONS = ["captain", "first-officer", "jumpseat"];

export function Component() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = usePilotConfig(id!);
  const patchConfig = usePatchPilotConfig(id!);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.config) {
      setCertifications(data.config.certifications);
    }
  }, [data]);

  const toggleCert = (cert: string) => {
    if (certifications.includes(cert)) {
      setCertifications(certifications.filter((c) => c !== cert));
    } else {
      setCertifications([...certifications, cert]);
    }
  };

  const handleSave = () => {
    patchConfig.mutate(
      { certifications },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: id! }, { label: "General" }]} />
        <div className="mt-5 text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: id! }, { label: "General" }]} />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            CERTIFICATIONS
          </div>
          <div className="flex gap-2">
            {CERT_OPTIONS.map((cert) => (
              <button
                key={cert}
                onClick={() => toggleCert(cert)}
                className="rounded-md px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: certifications.includes(cert)
                    ? "rgba(0, 255, 136, 0.15)"
                    : "var(--bg-elevated)",
                  color: certifications.includes(cert) ? "var(--accent-green)" : "var(--text-muted)",
                  border: certifications.includes(cert)
                    ? "1px solid var(--accent-green)"
                    : "1px solid var(--border)",
                }}
              >
                {cert}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={patchConfig.isPending}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
          >
            {patchConfig.isPending ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-[11px]" style={{ color: "var(--accent-green)" }}>Saved</span>}
          {patchConfig.isError && <span className="text-[11px]" style={{ color: "var(--accent-red)" }}>Error: {patchConfig.error.message}</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement pilot MCP servers settings page**

Create `packages/web/src/routes/settings/pilot-mcp.tsx`:

```typescript
import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { PageHeader } from "@/components/base/page-header";
import { usePilotConfig, usePatchPilotConfig } from "@/hooks/use-api";

interface McpServerEntry {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function Component() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = usePilotConfig(id!);
  const patchConfig = usePatchPilotConfig(id!);
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.config?.mcpServers) {
      setServers(
        Object.entries(data.config.mcpServers).map(([serverName, config]) => ({
          name: serverName,
          command: config.command,
          args: config.args,
          env: config.env ?? {},
        })),
      );
    }
  }, [data]);

  const addServer = () => {
    setServers([...servers, { name: "", command: "", args: [], env: {} }]);
  };

  const updateServer = (index: number, field: string, value: string | string[]) => {
    const updated = [...servers];
    updated[index] = { ...updated[index], [field]: value };
    setServers(updated);
  };

  const removeServer = (index: number) => {
    setServers(servers.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {};
    for (const server of servers) {
      if (server.name.trim()) {
        mcpServers[server.name.trim()] = {
          command: server.command,
          args: server.args,
          ...(Object.keys(server.env).length > 0 ? { env: server.env } : {}),
        };
      }
    }
    patchConfig.mutate(
      { mcpServers },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: id! }, { label: "MCP Servers" }]} />
        <div className="mt-5 text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: id! }, { label: "MCP Servers" }]} />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            MCP SERVERS
          </div>
          <div className="space-y-3">
            {servers.map((server, i) => (
              <div
                key={i}
                className="rounded-md border p-3"
                style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border)" }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <input
                    type="text"
                    value={server.name}
                    onChange={(e) => updateServer(i, "name", e.target.value)}
                    placeholder="Server name"
                    className="rounded-md border px-2 py-1 text-[11px] font-semibold"
                    style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                  <button onClick={() => removeServer(i)} className="text-[11px]" style={{ color: "var(--accent-red)" }}>
                    Remove
                  </button>
                </div>
                <div className="mb-2">
                  <label className="mb-1 block text-[10px]" style={{ color: "var(--text-dim)" }}>Command</label>
                  <input
                    type="text"
                    value={server.command}
                    onChange={(e) => updateServer(i, "command", e.target.value)}
                    placeholder="e.g., npx"
                    className="w-full rounded-md border px-2 py-1 font-mono text-[11px]"
                    style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px]" style={{ color: "var(--text-dim)" }}>Args (comma-separated)</label>
                  <input
                    type="text"
                    value={server.args.join(", ")}
                    onChange={(e) => updateServer(i, "args", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    placeholder="e.g., -y, @modelcontextprotocol/server"
                    className="w-full rounded-md border px-2 py-1 font-mono text-[11px]"
                    style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={addServer}
            className="mt-3 rounded-md px-3 py-1.5 text-xs"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            + Add Server
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={patchConfig.isPending}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
          >
            {patchConfig.isPending ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-[11px]" style={{ color: "var(--accent-green)" }}>Saved</span>}
          {patchConfig.isError && <span className="text-[11px]" style={{ color: "var(--accent-red)" }}>Error: {patchConfig.error.message}</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `pnpm --filter @airtrafficcontrol/web build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/routes/settings/pilot-general.tsx packages/web/src/routes/settings/pilot-mcp.tsx packages/web/src/components/layout/sidebar.tsx
git commit -m "feat(web): implement pilot settings pages"
```

---

### Task 17: Add WebSocket Subscriptions to Settings Pages

**Files:**
- Modify: `packages/web/src/hooks/use-subscription.ts`
- Modify: `packages/web/src/routes/settings/general.tsx`
- Modify: `packages/web/src/routes/settings/project-general.tsx`
- Modify: `packages/web/src/routes/settings/project-mcp.tsx`
- Modify: `packages/web/src/routes/settings/pilot-general.tsx`
- Modify: `packages/web/src/routes/settings/pilot-mcp.tsx`

- [ ] **Step 1: Add config event mapping to use-subscription.ts**

In `packages/web/src/hooks/use-subscription.ts`, add config event handling in the `mapEventToQueryUpdate` function:

```typescript
  // Config events
  if (event.channel.startsWith("config:global")) {
    return { type: "invalidate", queryKey: queryKeys.config.global() };
  }
  if (event.channel.startsWith("config:project:")) {
    const projectName = event.channel.replace("config:project:", "");
    return { type: "invalidate", queryKey: queryKeys.config.project(projectName) };
  }
  if (event.channel.startsWith("config:pilot:")) {
    const pilotId = event.channel.replace("config:pilot:", "");
    return { type: "invalidate", queryKey: queryKeys.config.pilot(pilotId) };
  }
```

- [ ] **Step 2: Add WebSocket subscriptions to settings pages**

Add to each settings page component (after the hook calls):

For `general.tsx`:
```typescript
  const wsManager = useWsManager();
  useSubscription(wsManager, "config:global");
```

For `project-general.tsx` and `project-mcp.tsx`:
```typescript
  const wsManager = useWsManager();
  useSubscription(wsManager, `config:project:${name}`);
```

For `pilot-general.tsx` and `pilot-mcp.tsx`:
```typescript
  const wsManager = useWsManager();
  useSubscription(wsManager, `config:pilot:${id}`);
```

Add the necessary imports to each file:
```typescript
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @airtrafficcontrol/web build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/hooks/use-subscription.ts packages/web/src/routes/settings/
git commit -m "feat(web): add WebSocket subscriptions to settings pages for real-time updates"
```

---

### Task 18: Final Integration Test and Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run the full test suite**

Run: `pnpm run test`
Expected: All tests PASS

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`
Expected: No errors

- [ ] **Step 3: Run type check**

Run: `pnpm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Verify the web app builds**

Run: `pnpm --filter @airtrafficcontrol/web build`
Expected: Build succeeds

- [ ] **Step 5: Commit any fixes**

If any fixes were needed:
```bash
git add -A
git commit -m "fix: address lint and type issues from configuration implementation"
```
