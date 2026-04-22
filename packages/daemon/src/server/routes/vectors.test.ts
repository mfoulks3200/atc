import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { CraftStatus } from "@airtrafficcontrol/types";
import type { CraftState } from "../../types.js";

describe("vector routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  let profileDir: string;

  const PROJECT = "test-project";

  function ensureWorktree(callsign: string): void {
    const worktree = join(profileDir, "projects", PROJECT, "crafts", callsign, "worktree");
    mkdirSync(worktree, { recursive: true });
  }

  function seedCraft(overrides: Partial<CraftState> = {}): void {
    const craft: CraftState = {
      callsign: "bravo-1",
      createdAt: "2026-04-11T00:00:00.000Z",
      branch: "feat/bravo",
      cargo: "Build bravo",
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [
        { name: "design", criteria: ["Design done"], status: "Pending" },
        { name: "implement", criteria: ["Code done"], status: "Pending" },
        { name: "test", criteria: ["Tests pass"], status: "Pending" },
      ],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
      holdingPattern: false,
      ...overrides,
    };
    craftStore.set(PROJECT, craft);
  }

  function seedCraftWithCommand(): void {
    const craft: CraftState = {
      callsign: "cmd-craft",
      createdAt: "2026-04-11T00:00:00.000Z",
      branch: "feat/cmd",
      cargo: "Build with command gate",
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [
        {
          name: "setup",
          criteria: ["DB migrated"],
          command: { run: "exit 0", severity: "required" },
          gateType: "command",
          status: "Pending",
        },
        {
          name: "implement",
          criteria: ["Code done"],
          command: { run: "exit 1", severity: "required" },
          gateType: "command",
          status: "Pending",
        },
        {
          name: "lint",
          criteria: ["Lint clean"],
          command: { run: "exit 1", severity: "advisory" },
          gateType: "command",
          status: "Pending",
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
    profileDir = mkdtempSync(join(tmpdir(), "atc-vec-test-"));
    craftStore = new CraftStore(profileDir);
    app = createApp({
      craftStore,
      agentStore: new AgentStore(profileDir),
      towerStore: new TowerStore(profileDir),
      profileDir,
    });
    seedCraft();
    ensureWorktree("bravo-1");
    seedCraftWithCommand();
    ensureWorktree("cmd-craft");
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts/:callsign/vectors
  // -------------------------------------------------------------------------

  describe("GET vectors", () => {
    it("returns the flight plan", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(3);
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/vectors`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST vector report — NL-only vectors
  // -------------------------------------------------------------------------

  describe("POST vector report — NL-only", () => {
    it("marks the next pending vector as passed", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
        payload: { evidence: "Design doc reviewed and approved" },
      });
      expect(res.statusCode).toBe(200);
      const plan = res.json<Array<{ name: string; status: string }>>();
      expect(plan[0].status).toBe("Passed");
      expect(plan[1].status).toBe("Pending");
    });

    it("appends a VectorPassed black box entry on report", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
        payload: { evidence: "Design doc approved" },
      });
      const craft = craftStore.get(PROJECT, "bravo-1")!;
      const vectorEntries = craft.blackBox.filter((e) => e.type === "VectorPassed");
      expect(vectorEntries).toHaveLength(1);
      expect(vectorEntries[0].content).toContain("design");
      expect(vectorEntries[0].content).toContain("Design doc approved");
    });

    it("rejects out-of-order vector reports (RULE-VEC-2)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/implement/report`,
        payload: { evidence: "Tried to skip ahead" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/vectors/design/report`,
        payload: { evidence: "nope" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for unknown vector name", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/nonexistent/report`,
        payload: { evidence: "nope" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 400 when evidence is missing for NL-only vector (RULE-VRPT-2)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/report`,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST vector report — command gate (RULE-VCMD-5, RULE-VRPT-3)
  // -------------------------------------------------------------------------

  describe("POST vector report — command gate", () => {
    it("records report when required command exits 0 without evidence (RULE-VRPT-2)", async () => {
      // 'setup' vector has command: { run: "exit 0", severity: "required" }
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/cmd-craft/vectors/setup/report`,
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const plan = res.json<Array<{ name: string; status: string }>>();
      expect(plan[0].status).toBe("Passed");
    });

    it("records VectorCommandRun black box entry on every execution (RULE-VCMD-8)", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/cmd-craft/vectors/setup/report`,
        payload: {},
      });
      const craft = craftStore.get(PROJECT, "cmd-craft")!;
      const cmdEntries = craft.blackBox.filter((e) => e.type === "VectorCommandRun");
      expect(cmdEntries).toHaveLength(1);
      const payload = JSON.parse(cmdEntries[0].content) as Record<string, unknown>;
      expect(payload.vectorName).toBe("setup");
      expect(payload.outcome).toBe("passed");
      expect(payload.severity).toBe("required");
    });

    it("persists commandResult on the vector state after execution (RULE-VCMD-11)", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/cmd-craft/vectors/setup/report`,
        payload: {},
      });
      const craft = craftStore.get(PROJECT, "cmd-craft")!;
      const vector = craft.flightPlan[0];
      expect(vector.commandResult).toBeDefined();
      expect(vector.commandResult?.status).toBe("passed");
    });

    it("blocks report when required command exits non-zero (RULE-VCMD-5)", async () => {
      // Seed a craft where the FIRST vector has a failing required command
      const craft: CraftState = {
        callsign: "fail-cmd-craft",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/fail",
        cargo: "Fail cmd test",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [
          {
            name: "first-fail",
            criteria: ["should fail"],
            command: { run: "exit 1", severity: "required" },
            gateType: "command",
            status: "Pending",
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);
      ensureWorktree("fail-cmd-craft");

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/fail-cmd-craft/vectors/first-fail/report`,
        payload: { evidence: "I think it's done" },
      });
      expect(res.statusCode).toBe(422);
      const body = res.json<{ error: string }>();
      expect(body.error).toBe("VECTOR_COMMAND_FAILED");
    });

    it("does not update vector status when required command fails (RULE-VRPT-3)", async () => {
      const craft: CraftState = {
        callsign: "no-update-craft",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/no-update",
        cargo: "No update test",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [
          {
            name: "first",
            criteria: ["should fail"],
            command: { run: "exit 1", severity: "required" },
            gateType: "command",
            status: "Pending",
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);
      ensureWorktree("no-update-craft");

      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/no-update-craft/vectors/first/report`,
        payload: { evidence: "attempt" },
      });
      const stored = craftStore.get(PROJECT, "no-update-craft")!;
      expect(stored.flightPlan[0].status).toBe("Pending");
    });

    it("publishes timeout event and returns 422 when command times out (RULE-VCMD-12)", async () => {
      const craft: CraftState = {
        callsign: "timeout-craft",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/timeout",
        cargo: "Timeout test",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [
          {
            name: "slow-gate",
            criteria: ["slow"],
            command: { run: "sleep 5", severity: "required", timeout: 50 },
            gateType: "command",
            status: "Pending",
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);
      ensureWorktree("timeout-craft");

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/timeout-craft/vectors/slow-gate/report`,
        payload: {},
      });
      // Timed-out required command must block the report
      expect(res.statusCode).toBe(422);
      const stored = craftStore.get(PROJECT, "timeout-craft")!;
      const cmdEntry = stored.blackBox.find((e) => e.type === "VectorCommandRun");
      expect(cmdEntry).toBeDefined();
      const payload = JSON.parse(cmdEntry!.content) as Record<string, unknown>;
      expect(payload.timedOut).toBe(true);
    }, 10_000);

    it("records advisory failure but proceeds with report (RULE-VCMD-5)", async () => {
      // Pass 'setup' and 'implement' first so 'lint' becomes next
      // 'lint' has command: { run: "exit 1", severity: "advisory" }
      // But we can't easily test this without passing the earlier vectors...
      // Seed a simpler craft with advisory-only vector first
      const craft: CraftState = {
        callsign: "advisory-craft",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/advisory",
        cargo: "Advisory test",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [
          {
            name: "check",
            criteria: ["Check done"],
            command: { run: "exit 2", severity: "advisory" },
            gateType: "command",
            status: "Pending",
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);
      ensureWorktree("advisory-craft");

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/advisory-craft/vectors/check/report`,
        payload: { evidence: "Manually confirmed" },
      });
      expect(res.statusCode).toBe(200);
      const plan = res.json<Array<{ name: string; status: string }>>();
      expect(plan[0].status).toBe("Passed");

      const stored = craftStore.get(PROJECT, "advisory-craft")!;
      const cmdEntries = stored.blackBox.filter((e) => e.type === "VectorCommandRun");
      expect(cmdEntries).toHaveLength(1);
      const payload = JSON.parse(cmdEntries[0].content) as Record<string, unknown>;
      expect(payload.outcome).toBe("failed");
      expect(payload.severity).toBe("advisory");
    });
  });

  // -------------------------------------------------------------------------
  // POST override-command-gate (RULE-VCMD-10)
  // -------------------------------------------------------------------------

  describe("POST override-command-gate", () => {
    it("captain can override a failing required command gate", async () => {
      // Seed a craft where the first vector has a failing required command
      const craft: CraftState = {
        callsign: "override-craft",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/override",
        cargo: "Override test",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [
          {
            name: "gate",
            criteria: ["Gate passed"],
            command: { run: "exit 1", severity: "required" },
            gateType: "command",
            status: "Pending",
            commandResult: {
              status: "failed",
              exitCode: 1,
              stdout: "",
              stderr: "test failure",
              ranAt: new Date().toISOString(),
              durationMs: 100,
              timedOut: false,
            },
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/override-craft/vectors/gate/override-command-gate`,
        payload: { pilotId: "pilot-1", justification: "Manually verified the migration" },
      });
      expect(res.statusCode).toBe(200);
      const plan = res.json<Array<{ name: string; status: string }>>();
      expect(plan[0].status).toBe("Passed");
    });

    it("records VectorCommandGateOverridden black box entry (RULE-VCMD-8)", async () => {
      const craft: CraftState = {
        callsign: "override-bb-craft",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/override-bb",
        cargo: "Override BB test",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [
          {
            name: "gate",
            criteria: ["Gate passed"],
            command: { run: "exit 1", severity: "required" },
            gateType: "command",
            status: "Pending",
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);

      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/override-bb-craft/vectors/gate/override-command-gate`,
        payload: { pilotId: "pilot-1", justification: "Manually verified the command gate behavior" },
      });

      const stored = craftStore.get(PROJECT, "override-bb-craft")!;
      const overrideEntries = stored.blackBox.filter(
        (e) => e.type === "VectorCommandGateOverridden",
      );
      expect(overrideEntries).toHaveLength(1);
      const payload = JSON.parse(overrideEntries[0].content) as Record<string, unknown>;
      expect(payload.captainPilotId).toBe("pilot-1");
      expect(payload.justification).toBe("Manually verified the command gate behavior");
    });

    it("rejects override from non-captain (RULE-VCMD-10)", async () => {
      const craft: CraftState = {
        callsign: "override-reject-craft",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/override-reject",
        cargo: "Reject override",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: ["pilot-2"],
        jumpseaters: [],
        flightPlan: [
          {
            name: "gate",
            criteria: ["Gate passed"],
            command: { run: "exit 1", severity: "required" },
            gateType: "command",
            status: "Pending",
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/override-reject-craft/vectors/gate/override-command-gate`,
        payload: { pilotId: "pilot-2", justification: "FO trying to override" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects override with missing justification", async () => {
      const craft: CraftState = {
        callsign: "no-justification-craft",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/nj",
        cargo: "No justification",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [
          {
            name: "gate",
            criteria: ["Gate passed"],
            command: { run: "exit 1", severity: "required" },
            gateType: "command",
            status: "Pending",
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/no-justification-craft/vectors/gate/override-command-gate`,
        payload: { pilotId: "pilot-1", justification: "" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects override on a vector with no command gate", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/bravo-1/vectors/design/override-command-gate`,
        payload: { pilotId: "pilot-1", justification: "No command gate exists on this design vector" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/vectors/gate/override-command-gate`,
        payload: { pilotId: "pilot-1", justification: "Testing" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 404 when vector name is not found (craft exists)", async () => {
      const craft: CraftState = {
        callsign: "override-no-vec",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/override-no-vec",
        cargo: "Vector not found test",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [
          {
            name: "gate",
            criteria: ["Gate passed"],
            command: { run: "exit 1", severity: "required" },
            gateType: "command",
            status: "Pending",
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/override-no-vec/vectors/nonexistent/override-command-gate`,
        payload: {
          pilotId: "pilot-1",
          justification: "this justification is long enough to satisfy the minimum",
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 409 when target vector is not the next pending (RULE-VEC-2)", async () => {
      const craft: CraftState = {
        callsign: "override-wrong-order",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/override-wrong-order",
        cargo: "Out-of-order override test",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [
          {
            name: "first",
            criteria: ["First done"],
            status: "Pending",
          },
          {
            name: "second",
            criteria: ["Second done"],
            command: { run: "exit 1", severity: "required" },
            gateType: "command",
            status: "Pending",
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);

      // "second" has a command gate but "first" is the next pending — should be 409
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/override-wrong-order/vectors/second/override-command-gate`,
        payload: {
          pilotId: "pilot-1",
          justification: "this justification is long enough to satisfy the minimum",
        },
      });
      expect(res.statusCode).toBe(409);
    });

    it("rejects override when justification has fewer than 20 non-whitespace chars (RULE-VCMD-10)", async () => {
      const craft: CraftState = {
        callsign: "short-just-craft",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/short-just",
        cargo: "Short justification test",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [
          {
            name: "gate",
            criteria: ["Gate passed"],
            command: { run: "exit 1", severity: "required" },
            gateType: "command",
            status: "Pending",
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/short-just-craft/vectors/gate/override-command-gate`,
        payload: { pilotId: "pilot-1", justification: "short" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: string }>().error).toBe("SPEC_VALIDATION_ERROR");
    });
  });

  // -------------------------------------------------------------------------
  // 422 response output cap (RULE-VCMD-7)
  // -------------------------------------------------------------------------

  describe("POST vector report — 422 API output cap", () => {
    it("truncates stdout and stderr in 422 response to 4096 chars (RULE-VCMD-7)", async () => {
      const craft: CraftState = {
        callsign: "truncation-craft",
        createdAt: "2026-04-11T00:00:00.000Z",
        branch: "feat/truncation",
        cargo: "Output cap test",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-1",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [
          {
            name: "loud-failure",
            criteria: ["loud"],
            command: {
              run: `node -e "process.stdout.write('x'.repeat(5000)); process.stderr.write('e'.repeat(5000)); process.exit(1);"`,
              severity: "required",
            },
            gateType: "command",
            status: "Pending",
          },
        ],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-1" },
        holdingPattern: false,
      };
      craftStore.set(PROJECT, craft);
      ensureWorktree("truncation-craft");

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${PROJECT}/crafts/truncation-craft/vectors/loud-failure/report`,
        payload: {},
      });
      expect(res.statusCode).toBe(422);
      const body = res.json<{ commandResult: { stdout: string; stderr: string } }>();
      expect(body.commandResult.stdout.length).toBeLessThanOrEqual(4096);
      expect(body.commandResult.stderr.length).toBeLessThanOrEqual(4096);
    });
  });
});
