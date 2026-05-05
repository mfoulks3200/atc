/**
 * Project CRUD routes for the ATC daemon.
 *
 * Manages project registration, listing, and synchronization. Each project
 * maps to a directory under `profileDir/projects/<name>` containing a
 * `metadata.json` file and a `crafts/` subdirectory. A bare git clone of
 * the remote is stored alongside for worktree-based craft isolation.
 *
 * All reads and writes go through the {@link LayeredConfigStore} instances
 * registered on `app.projectConfigStores` — raw file I/O is only used for
 * directory creation and deletion.
 *
 * @see RULE-CRAFT-1 for craft-to-branch and project correspondence.
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { cloneBareRepo, fetchBareRepo } from "../../git/bare-repo.js";
import { createProjectConfigStore } from "../../config/project-store.js";
import { DEFAULT_PILOTS } from "../../default-pilots.js";
import type { ProjectMetadataConfig } from "../../config/schema.js";
import type { ConfigLogger } from "../../config/layered-store.js";

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

interface CreateProjectBody {
  name: string;
  remoteUrl: string;
  categories: string[];
  checklist: Array<{ name: string; command: string; timeout?: number }>;
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  /**
   * Absolute path to the developer's local checkout. When present, the daemon
   * derives the repo config path as `<workingDirectory>/.atc/config.yaml`.
   * @see RULE-RCFG-1
   */
  workingDirectory?: string;
}

interface PatchProjectBody {
  remoteUrl?: string;
  categories?: string[];
  checklist?: Array<{ name: string; command: string; timeout?: number }>;
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers project CRUD and sync routes as a Fastify plugin.
 *
 * All routes operate under `/api/v1/projects` and read/write project state
 * through the `LayeredConfigStore` instances in `app.projectConfigStores`.
 * The bare git clone is attempted at creation time but failures are tolerated
 * — directory structure and the config store are always created regardless.
 *
 * Routes:
 * - `POST   /api/v1/projects`             — create a new project
 * - `GET    /api/v1/projects`             — list all registered projects
 * - `GET    /api/v1/projects/:name`       — get one project by name
 * - `DELETE /api/v1/projects/:name`       — remove a project entirely
 * - `PATCH  /api/v1/projects/:name`       — update project metadata fields
 * - `POST   /api/v1/projects/:name/sync`  — fetch latest from remote
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-CRAFT-1
 */
export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /api/v1/projects
  // -------------------------------------------------------------------------

  /**
   * Create a new project.
   *
   * Creates the project directory, initializes the crafts/ subdirectory,
   * writes metadata through a LayeredConfigStore, and attempts to clone
   * the bare repo from the provided remoteUrl (clone failure is non-fatal).
   */
  app.post<{ Body: CreateProjectBody }>("/api/v1/projects", async (request, reply) => {
    const { name, remoteUrl, categories, checklist, mcpServers, workingDirectory } = request.body;

    const projectDir = join(app.profileDir, "projects", name);
    const craftsDir = join(projectDir, "crafts");
    const bareDir = join(projectDir, "repo.git");

    await mkdir(craftsDir, { recursive: true });

    const logger: ConfigLogger = {
      warn: (msg) => console.warn(msg),
      info: (msg) => console.info(msg),
      error: (msg, err) => console.error(msg, err),
    };

    const store = createProjectConfigStore(
      name,
      projectDir,
      (channel, data) => app.channelRegistry.publish(channel, data),
      logger,
    );

    await store.load();

    const metadata: ProjectMetadataConfig = {
      name,
      remoteUrl,
      categories,
      checklist,
      mcpServers: mcpServers ?? {},
      ...(workingDirectory !== undefined ? { workingDirectory } : {}),
    };

    await store.replace(metadata);
    store.start();

    app.projectConfigStores.set(name, store);

    // Clone is best-effort — local test paths and offline environments are ok
    try {
      await cloneBareRepo(remoteUrl, bareDir);
    } catch {
      // Non-fatal: directory structure and config store are the important parts
    }

    // Seed base pilots so every project starts with certified JS/TS specialists.
    for (const pilot of DEFAULT_PILOTS) {
      app.pilotStore.set(name, pilot);
    }

    return reply.code(201).send(store.get());
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects
  // -------------------------------------------------------------------------

  /**
   * List all registered projects.
   *
   * Reads from in-memory `app.projectConfigStores` — no disk I/O needed.
   */
  app.get("/api/v1/projects", async (_request, reply) => {
    const projects: ProjectMetadataConfig[] = [];
    for (const store of app.projectConfigStores.values()) {
      projects.push(store.get());
    }
    return reply.send(projects);
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name
  // -------------------------------------------------------------------------

  /**
   * Retrieve a single project by name.
   *
   * Returns 404 if no store is registered for the given name.
   */
  app.get<{ Params: { name: string } }>("/api/v1/projects/:name", async (request, reply) => {
    const { name } = request.params;
    const store = app.projectConfigStores.get(name);
    if (!store) {
      return reply.code(404).send({ error: `Project not found: ${name}` });
    }
    return reply.send(store.get());
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/projects/:name
  // -------------------------------------------------------------------------

  /**
   * Remove a project and all its stored state.
   *
   * Stops and deregisters the config store, then deletes the entire project
   * directory recursively. Returns 204 on success.
   */
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

  // -------------------------------------------------------------------------
  // PATCH /api/v1/projects/:name
  // -------------------------------------------------------------------------

  /**
   * Partially update a project's metadata.
   *
   * Merges the request body into the existing metadata via the store's
   * `patch()` method, always preserving the project name. Returns 404 if
   * no store is registered for the given name.
   */
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

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/sync
  // -------------------------------------------------------------------------

  /**
   * Synchronize a project's bare repo with its remote.
   *
   * Runs `git fetch --all` in the project's bare repo directory. Returns 404
   * if no store is registered for the given name.
   */
  app.post<{ Params: { name: string } }>("/api/v1/projects/:name/sync", async (request, reply) => {
    const { name } = request.params;

    if (!app.projectConfigStores.has(name)) {
      return reply.code(404).send({ error: `Project not found: ${name}` });
    }

    const projectDir = join(app.profileDir, "projects", name);
    const bareDir = join(projectDir, "repo.git");
    await fetchBareRepo(bareDir);

    return reply.send({ synced: true });
  });
}
