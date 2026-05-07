/**
 * Route-level tests for the MergeConflict go-around path (RULE-TMRG-3).
 *
 * The conflict outcome from the git executor is structurally difficult to
 * reproduce with a real bare repo (the up-to-date check prevents it in
 * normal git operation), so this file isolates the route handler's conflict
 * branch by mocking the TowerMergeExecutor. The happy-path and stale-path
 * route tests live in tower.test.ts and use a real bare repo.
 *
 * @see RULE-TMRG-3 — Tower may send craft on go-around for merge conflicts.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { MergeExecutor, MergeOutcome } from "@airtrafficcontrol/tower";

// Must be hoisted before importing modules that transitively use the executor.
vi.mock("../../git/tower-merge-executor.js", () => ({
  createTowerMergeExecutor: vi.fn(
    (): MergeExecutor => ({
      getMainBranch: async () => "main",
      isBranchUpToDate: async () => true,
      merge: async (mainBranch: string): Promise<MergeOutcome> => ({
        kind: "conflict",
        mainBranch,
        reason: "CONFLICT in src/foo.ts — merge produced unresolvable overlap",
      }),
    }),
  ),
}));

import type { FastifyInstance } from "fastify";
import { CraftStatus } from "@airtrafficcontrol/types";
import type { CraftState } from "../../types.js";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT = "conflict-project";
const CALLSIGN = "conflict-craft-1";
const BRANCH = "feat/conflict-craft-1";

function makeCraft(): CraftState {
  return {
    callsign: CALLSIGN,
    createdAt: "2026-04-14T00:00:00.000Z",
    branch: BRANCH,
    cargo: "Implement conflict feature",
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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("tower merge route — conflict path (RULE-TMRG-3)", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  let towerStore: TowerStore;

  beforeEach(() => {
    craftStore = new CraftStore("/tmp/atc-conflict-route-test");
    towerStore = new TowerStore("/tmp/atc-conflict-route-test");
    app = createApp({
      profileDir: "/tmp/atc-conflict-route-test",
      craftStore,
      towerStore,
      agentStore: new AgentStore("/tmp/atc-conflict-route-test"),
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("returns GoAround and outcome 'conflict' when executor reports a conflict (RULE-TMRG-3)", async () => {
    craftStore.set(PROJECT, makeCraft());
    towerStore.enqueue(PROJECT, CALLSIGN);

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/tower/merge`,
      payload: { callsign: CALLSIGN },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ outcome: string; status: string }>();
    expect(body.outcome).toBe("conflict");
    expect(body.status).toBe(CraftStatus.GoAround);
  });

  it("appends MergeConflict, TowerDequeued, and StateTransition black box entries", async () => {
    craftStore.set(PROJECT, makeCraft());
    towerStore.enqueue(PROJECT, CALLSIGN);

    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/tower/merge`,
      payload: { callsign: CALLSIGN },
    });

    const craft = craftStore.get(PROJECT, CALLSIGN)!;
    const types = craft.blackBox.map((e) => e.type);
    expect(types).toContain("MergeConflict");
    expect(types).toContain("TowerDequeued");
    expect(types).toContain("StateTransition");
  });

  it("includes the conflict reason in the MergeConflict black box entry", async () => {
    craftStore.set(PROJECT, makeCraft());
    towerStore.enqueue(PROJECT, CALLSIGN);

    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/tower/merge`,
      payload: { callsign: CALLSIGN },
    });

    const craft = craftStore.get(PROJECT, CALLSIGN)!;
    const conflictEntry = craft.blackBox.find((e) => e.type === "MergeConflict");
    expect(conflictEntry).toBeDefined();
    expect(conflictEntry!.content).toContain("CONFLICT in src/foo.ts");
  });

  it("removes the craft from the merge queue after a conflict", async () => {
    craftStore.set(PROJECT, makeCraft());
    towerStore.enqueue(PROJECT, CALLSIGN);

    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/tower/merge`,
      payload: { callsign: CALLSIGN },
    });

    expect(towerStore.getQueue(PROJECT)).toHaveLength(0);
  });

  it("transitions the craft to GoAround status in persistent storage", async () => {
    craftStore.set(PROJECT, makeCraft());
    towerStore.enqueue(PROJECT, CALLSIGN);

    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${PROJECT}/tower/merge`,
      payload: { callsign: CALLSIGN },
    });

    const craft = craftStore.get(PROJECT, CALLSIGN)!;
    expect(craft.status).toBe(CraftStatus.GoAround);
  });
});
