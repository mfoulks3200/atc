import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";

describe("project routes", () => {
  let app: FastifyInstance;
  let profileDir: string;
  let sourceRepo: string;

  beforeEach(async () => {
    // Create a temp profile dir and a real git source repo to clone from
    profileDir = await mkdtemp(join(tmpdir(), "atc-test-profile-"));
    sourceRepo = await mkdtemp(join(tmpdir(), "atc-test-source-"));

    execSync("git init", { cwd: sourceRepo });
    execSync(
      'git -c user.name="test" -c user.email="test@test.com" commit --allow-empty -m "initial"',
      { cwd: sourceRepo },
    );

    app = createApp({ profileDir });
  });

  afterEach(async () => {
    if (app) await app.close();
    await rm(profileDir, { recursive: true, force: true });
    await rm(sourceRepo, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/projects
  // -------------------------------------------------------------------------

  describe("POST /api/v1/projects", () => {
    it("creates a project and returns 201 with metadata", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        payload: {
          name: "my-project",
          remoteUrl: sourceRepo,
          categories: ["backend"],
          checklist: [{ name: "lint", command: "echo lint" }],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ name: string; remoteUrl: string; categories: string[] }>();
      expect(body.name).toBe("my-project");
      expect(body.remoteUrl).toBe(sourceRepo);
      expect(body.categories).toEqual(["backend"]);
    });

    it("accepts optional mcpServers field", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        payload: {
          name: "with-mcp",
          remoteUrl: sourceRepo,
          categories: [],
          checklist: [],
          mcpServers: {
            "my-server": { command: "node", args: ["server.js"] },
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ mcpServers: Record<string, unknown> }>();
      expect(body.mcpServers).toHaveProperty("my-server");
    });

    it("creates project even if clone fails (bad remoteUrl)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        payload: {
          name: "bad-remote",
          remoteUrl: "/nonexistent/path/to/repo",
          categories: [],
          checklist: [],
        },
      });

      // Should still succeed — clone failure is non-fatal
      expect(response.statusCode).toBe(201);
      const body = response.json<{ name: string }>();
      expect(body.name).toBe("bad-remote");
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects
  // -------------------------------------------------------------------------

  describe("GET /api/v1/projects", () => {
    it("returns empty array when no projects exist", async () => {
      const response = await app.inject({ method: "GET", url: "/api/v1/projects" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it("lists all created projects", async () => {
      // Create two projects
      await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        payload: { name: "alpha", remoteUrl: sourceRepo, categories: [], checklist: [] },
      });
      await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        payload: { name: "bravo", remoteUrl: sourceRepo, categories: [], checklist: [] },
      });

      const response = await app.inject({ method: "GET", url: "/api/v1/projects" });

      expect(response.statusCode).toBe(200);
      const projects = response.json<Array<{ name: string }>>();
      expect(projects).toHaveLength(2);
      const names = projects.map((p) => p.name).sort();
      expect(names).toEqual(["alpha", "bravo"]);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name
  // -------------------------------------------------------------------------

  describe("GET /api/v1/projects/:name", () => {
    it("returns project details for an existing project", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        payload: {
          name: "delta",
          remoteUrl: sourceRepo,
          categories: ["frontend"],
          checklist: [],
        },
      });

      const response = await app.inject({ method: "GET", url: "/api/v1/projects/delta" });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ name: string; categories: string[] }>();
      expect(body.name).toBe("delta");
      expect(body.categories).toEqual(["frontend"]);
    });

    it("returns 404 for an unknown project", async () => {
      const response = await app.inject({ method: "GET", url: "/api/v1/projects/ghost" });

      expect(response.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/projects/:name
  // -------------------------------------------------------------------------

  describe("DELETE /api/v1/projects/:name", () => {
    it("removes the project and returns 204", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        payload: { name: "to-delete", remoteUrl: sourceRepo, categories: [], checklist: [] },
      });

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: "/api/v1/projects/to-delete",
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Confirm it's gone
      const getResponse = await app.inject({
        method: "GET",
        url: "/api/v1/projects/to-delete",
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it("returns 204 even for a non-existent project (rm --force)", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/projects/never-existed",
      });

      expect(response.statusCode).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/v1/projects/:name
  // -------------------------------------------------------------------------

  describe("PATCH /api/v1/projects/:name", () => {
    it("merges body into existing metadata and preserves name", async () => {
      await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        payload: {
          name: "echo",
          remoteUrl: sourceRepo,
          categories: ["original"],
          checklist: [],
        },
      });

      const patch = await app.inject({
        method: "PATCH",
        url: "/api/v1/projects/echo",
        payload: { categories: ["updated"] },
      });

      expect(patch.statusCode).toBe(200);
      const body = patch.json<{ name: string; categories: string[] }>();
      expect(body.name).toBe("echo");
      expect(body.categories).toEqual(["updated"]);
    });

    it("returns 404 for an unknown project", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/projects/no-such-project",
        payload: { categories: ["x"] },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
