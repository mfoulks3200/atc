/**
 * Project CRUD routes for the ATC daemon.
 *
 * Manages project registration, listing, and synchronization. Each project
 * maps to a directory under `profileDir/projects/<name>` containing a
 * `metadata.json` file and a `crafts/` subdirectory. A bare git clone of
 * the remote is stored alongside for worktree-based craft isolation.
 *
 * @see RULE-CRAFT-1 for craft-to-branch and project correspondence.
 */

import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { loadProjectMetadata } from "../../config/loader.js";
import { atomicWriteJson } from "../../state/persistence.js";
import { cloneBareRepo, fetchBareRepo } from "../../git/bare-repo.js";
import type { ProjectMetadata } from "../../types.js";

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

interface CreateProjectBody {
  name: string;
  remoteUrl: string;
  categories: string[];
  checklist: Array<{ name: string; command: string; timeout?: number }>;
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
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
 * from `app.profileDir/projects/`. The bare git clone is attempted at
 * creation time but failures are tolerated — directory structure is always
 * created regardless.
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
   * Creates the project directory, writes metadata.json, initializes the
   * crafts/ subdirectory, and attempts to clone the bare repo from the
   * provided remoteUrl (clone failure is non-fatal).
   */
  app.post<{ Body: CreateProjectBody }>("/api/v1/projects", async (request, reply) => {
    const { name, remoteUrl, categories, checklist, mcpServers } = request.body;

    const projectDir = join(app.profileDir, "projects", name);
    const craftsDir = join(projectDir, "crafts");
    const bareDir = join(projectDir, "repo.git");

    await mkdir(craftsDir, { recursive: true });

    const metadata: ProjectMetadata = {
      name,
      remoteUrl,
      categories,
      checklist,
      mcpServers: mcpServers ?? {},
    };

    await atomicWriteJson(join(projectDir, "metadata.json"), metadata);

    // Clone is best-effort — local test paths and offline environments are ok
    try {
      await cloneBareRepo(remoteUrl, bareDir);
    } catch {
      // Non-fatal: directory structure is the important part
    }

    return reply.code(201).send(metadata);
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects
  // -------------------------------------------------------------------------

  /**
   * List all registered projects.
   *
   * Reads each subdirectory of `profileDir/projects/` and loads its
   * metadata.json. Directories without valid metadata are silently skipped.
   */
  app.get("/api/v1/projects", async (_request, reply) => {
    const projectsDir = join(app.profileDir, "projects");

    let entries: string[] = [];
    try {
      entries = await readdir(projectsDir);
    } catch {
      // No projects dir yet — return empty list
      return reply.send([]);
    }

    const projects: ProjectMetadata[] = [];
    for (const entry of entries) {
      try {
        const metadata = await loadProjectMetadata(join(projectsDir, entry));
        projects.push(metadata);
      } catch {
        // Skip dirs without valid metadata
      }
    }

    return reply.send(projects);
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name
  // -------------------------------------------------------------------------

  /**
   * Retrieve a single project by name.
   *
   * Returns 404 if the project directory does not exist or has no valid
   * metadata.json.
   */
  app.get<{ Params: { name: string } }>("/api/v1/projects/:name", async (request, reply) => {
    const { name } = request.params;
    const projectDir = join(app.profileDir, "projects", name);

    try {
      const metadata = await loadProjectMetadata(projectDir);
      return reply.send(metadata);
    } catch {
      return reply.code(404).send({ error: `Project not found: ${name}` });
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/projects/:name
  // -------------------------------------------------------------------------

  /**
   * Remove a project and all its stored state.
   *
   * Deletes the entire project directory recursively. Returns 204 on success.
   */
  app.delete<{ Params: { name: string } }>("/api/v1/projects/:name", async (request, reply) => {
    const { name } = request.params;
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
   * Merges the request body into the existing metadata, preserving the
   * project name. Returns 404 if the project does not exist.
   */
  app.patch<{ Params: { name: string }; Body: PatchProjectBody }>(
    "/api/v1/projects/:name",
    async (request, reply) => {
      const { name } = request.params;
      const projectDir = join(app.profileDir, "projects", name);

      let existing: ProjectMetadata;
      try {
        existing = await loadProjectMetadata(projectDir);
      } catch {
        return reply.code(404).send({ error: `Project not found: ${name}` });
      }

      const updated: ProjectMetadata = {
        ...existing,
        ...request.body,
        name, // always preserve name
      };

      await atomicWriteJson(join(projectDir, "metadata.json"), updated);

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
   * if the project does not exist.
   */
  app.post<{ Params: { name: string } }>(
    "/api/v1/projects/:name/sync",
    async (request, reply) => {
      const { name } = request.params;
      const projectDir = join(app.profileDir, "projects", name);

      try {
        await loadProjectMetadata(projectDir);
      } catch {
        return reply.code(404).send({ error: `Project not found: ${name}` });
      }

      const bareDir = join(projectDir, "repo.git");
      await fetchBareRepo(bareDir);

      return reply.send({ synced: true });
    },
  );
}
