import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { CraftStatus } from "@airtrafficcontrol/types";
import type { CraftState } from "../../types.js";

describe("tower routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  let towerStore: TowerStore;

  const PROJECT = "test-project";

  function seedCraft(allPassed: boolean): void {
    const craft: CraftState = {
      callsign: "charlie-1",
      createdAt: "2026-04-11T00:00:00.000Z",
      branch: "feat/charlie",
      cargo: "Build charlie",
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [
        {
          name: "v1",
          acceptanceCriteria: "Done",
          status: allPassed ? "Passed" : "Pending",
          ...(allPassed ? { evidence: "done", reportedAt: new Date().toISOString() } : {}),
        },
      ],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
      holdingPattern: false,
    };
    craftStore.set(PROJECT, craft);
  }

  beforeEach(() => {
    craftStore = new CraftStore("/tmp/atc-tower-test");
    towerStore = new TowerStore("/tmp/atc-tower-test");
    app = createApp({
      craftStore,
      towerStore,
      agentStore: new AgentStore("/tmp/atc-tower-test"),
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe("GET /api/v1/projects/:name/tower", () => {
    it("returns empty queue initially", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/tower`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });

  describe("POST /api/v1/projects/:name/tower/clearance", () => {
    it("grants clearance when all vectors passed (RULE-TOWER-2)", async () => {
      seedCraft(true);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/tower/clearance`,
        payload: { callsign: "charlie-1" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ granted: boolean }>().granted).toBe(true);

      // Verify it's in the queue
      const queue = towerStore.getQueue(PROJECT);
      expect(queue).toHaveLength(1);
      expect(queue[0].callsign).toBe("charlie-1");
    });

    it("rejects clearance when vectors are pending", async () => {
      seedCraft(false);
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/tower/clearance`,
        payload: { callsign: "charlie-1" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("appends ClearanceRequested and TowerEnqueued black box entries on success", async () => {
      seedCraft(true);
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/tower/clearance`,
        payload: { callsign: "charlie-1" },
      });

      const craft = craftStore.get(PROJECT, "charlie-1")!;
      const types = craft.blackBox.map((e) => e.type);
      expect(types).toContain("ClearanceRequested");
      expect(types).toContain("TowerEnqueued");
    });

    it("still appends ClearanceRequested even when vectors are pending", async () => {
      seedCraft(false);
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/tower/clearance`,
        payload: { callsign: "charlie-1" },
      });

      const craft = craftStore.get(PROJECT, "charlie-1")!;
      const types = craft.blackBox.map((e) => e.type);
      expect(types).toContain("ClearanceRequested");
      expect(types).not.toContain("TowerEnqueued");
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/tower/clearance`,
        payload: { callsign: "ghost" },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/projects/:name/tower/merge — real bare-repo execution
// (RULE-TOWER-3, RULE-TMRG-2, RULE-TMRG-3)
// ---------------------------------------------------------------------------

describe("tower merge route", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  let towerStore: TowerStore;
  let profileDir: string;
  let bareDir: string;

  const PROJECT = "merge-test";
  const CALLSIGN = "merge-craft-1";
  const BRANCH = "feat/merge-craft-1";

  /** Set up a real bare repo with a feature branch ready to merge. */
  async function seedBareRepo(branchContent: string): Promise<void> {
    const seed = await mkdtemp(join(tmpdir(), "atc-tower-route-seed-"));
    const sourceRepo = join(seed, "source");
    execFileSync("git", ["init", "-b", "main", sourceRepo]);
    execFileSync("git", ["config", "user.name", "test"], { cwd: sourceRepo });
    execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: sourceRepo });
    await writeFile(join(sourceRepo, "README.md"), "# scratch\n");
    execFileSync("git", ["add", "."], { cwd: sourceRepo });
    execFileSync("git", ["commit", "-m", "initial"], { cwd: sourceRepo });
    execFileSync("git", ["clone", "--bare", sourceRepo, bareDir]);
    await rm(seed, { recursive: true, force: true });

    // Create the craft branch via a temporary worktree.
    const wt = await mkdtemp(join(tmpdir(), "atc-tower-route-feat-"));
    const wtRepo = join(wt, "wt");
    try {
      execFileSync("git", ["--git-dir", bareDir, "worktree", "add", "-b", BRANCH, wtRepo, "main"]);
      execFileSync("git", ["config", "user.name", "test"], { cwd: wtRepo });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: wtRepo });
      await writeFile(join(wtRepo, "feature.txt"), branchContent);
      execFileSync("git", ["add", "."], { cwd: wtRepo });
      execFileSync("git", ["commit", "-m", "feat: feature"], { cwd: wtRepo });
    } finally {
      try {
        execFileSync("git", ["--git-dir", bareDir, "worktree", "remove", "--force", wtRepo]);
      } catch {
        // ignore
      }
      await rm(wt, { recursive: true, force: true });
    }
  }

  /** Advance main directly so the craft branch becomes stale. */
  async function advanceMain(file: string, content: string): Promise<void> {
    const wt = await mkdtemp(join(tmpdir(), "atc-tower-route-main-"));
    const wtRepo = join(wt, "wt");
    try {
      execFileSync("git", ["--git-dir", bareDir, "worktree", "add", wtRepo, "main"]);
      execFileSync("git", ["config", "user.name", "test"], { cwd: wtRepo });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: wtRepo });
      await writeFile(join(wtRepo, file), content);
      execFileSync("git", ["add", "."], { cwd: wtRepo });
      execFileSync("git", ["commit", "-m", `advance: ${file}`], { cwd: wtRepo });
    } finally {
      try {
        execFileSync("git", ["--git-dir", bareDir, "worktree", "remove", "--force", wtRepo]);
      } catch {
        // ignore
      }
      await rm(wt, { recursive: true, force: true });
    }
  }

  function seedCraftAndQueue(): void {
    const craft: CraftState = {
      callsign: CALLSIGN,
      createdAt: "2026-04-14T00:00:00.000Z",
      branch: BRANCH,
      cargo: "Add merge feature",
      category: "backend",
      status: CraftStatus.ClearedToLand,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [
        {
          name: "v1",
          acceptanceCriteria: "Done",
          status: "Passed",
          evidence: "done",
          reportedAt: new Date().toISOString(),
        },
      ],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
      holdingPattern: false,
    };
    craftStore.set(PROJECT, craft);
    towerStore.enqueue(PROJECT, CALLSIGN);
  }

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "atc-tower-route-profile-"));
    bareDir = join(profileDir, "projects", PROJECT, "repo.git");
    craftStore = new CraftStore(profileDir);
    towerStore = new TowerStore(profileDir);
    app = createApp({
      profileDir,
      craftStore,
      towerStore,
      agentStore: new AgentStore(profileDir),
    });
  });

  afterEach(async () => {
    if (app) await app.close();
    await rm(profileDir, { recursive: true, force: true });
  });

  it("merges a clean branch and transitions craft to Landed (RULE-TMRG-2)", async () => {
    await seedBareRepo("feature line\n");
    seedCraftAndQueue();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/tower/merge`,
      payload: { callsign: CALLSIGN },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ outcome: string; status: string }>();
    expect(body.outcome).toBe("landed");
    expect(body.status).toBe(CraftStatus.Landed);

    const craft = craftStore.get(PROJECT, CALLSIGN)!;
    expect(craft.status).toBe(CraftStatus.Landed);
    const types = craft.blackBox.map((e) => e.type);
    expect(types).toContain("Merge");
    expect(types).toContain("TowerDequeued");
    expect(types).toContain("StateTransition");

    expect(towerStore.getQueue(PROJECT)).toHaveLength(0);

    // Verify the merge is actually present on main in the bare repo.
    const log = execFileSync(
      "git",
      ["--git-dir", bareDir, "log", "--oneline", "main"],
      { encoding: "utf8" },
    );
    expect(log).toContain("Tower merge: land craft");
  });

  it("returns craft to GoAround when branch is stale (RULE-TMRG-2)", async () => {
    await seedBareRepo("feature line\n");
    await advanceMain("other.txt", "advanced\n");
    seedCraftAndQueue();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/tower/merge`,
      payload: { callsign: CALLSIGN },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ outcome: string; status: string }>();
    expect(body.outcome).toBe("stale");
    expect(body.status).toBe(CraftStatus.GoAround);

    const craft = craftStore.get(PROJECT, CALLSIGN)!;
    expect(craft.status).toBe(CraftStatus.GoAround);
    const types = craft.blackBox.map((e) => e.type);
    expect(types).toContain("MergeStale");
    expect(types).toContain("TowerDequeued");

    expect(towerStore.getQueue(PROJECT)).toHaveLength(0);
  });

  it("returns 409 when the craft is not in the queue", async () => {
    await seedBareRepo("feature line\n");
    // Seed the craft but DO NOT enqueue it.
    const craft: CraftState = {
      callsign: CALLSIGN,
      createdAt: "2026-04-14T00:00:00.000Z",
      branch: BRANCH,
      cargo: "x",
      category: "backend",
      status: CraftStatus.ClearedToLand,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
      holdingPattern: false,
    };
    craftStore.set(PROJECT, craft);

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/tower/merge`,
      payload: { callsign: CALLSIGN },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 404 for unknown craft", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/tower/merge`,
      payload: { callsign: "ghost" },
    });
    expect(res.statusCode).toBe(404);
  });
});
