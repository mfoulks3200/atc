/**
 * Craft CRUD and lifecycle routes for the ATC daemon.
 *
 * Manages craft creation, listing, deletion, launch transitions,
 * landing checklist execution, and emergency declarations.
 *
 * @see RULE-CRAFT-1 through RULE-CRAFT-8 for craft lifecycle rules.
 * @see RULE-LIFE-3 for launch prerequisites.
 * @see RULE-EMER-1 for emergency declaration rules.
 */

import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { CraftStatus, BlackBoxEntryType } from "@airtrafficcontrol/types";
import { createWorktree } from "../../git/worktree.js";
import { loadProjectMetadata } from "../../config/loader.js";
import { runChecklist } from "../../checklist/runner.js";
import { publishCraftEvent, publishCraftRemoved } from "./broadcast.js";
import { appendBlackBoxEntry } from "./blackbox-helpers.js";
import type { CraftState, VectorState } from "../../types.js";

// ---------------------------------------------------------------------------
// Request body / param types
// ---------------------------------------------------------------------------

interface CraftParams {
  name: string;
  callsign: string;
}

interface CreateCraftBody {
  callsign: string;
  branch: string;
  cargo: string;
  category: string;
  captain: string;
  firstOfficers?: string[];
  jumpseaters?: string[];
  flightPlan: Array<{ name: string; acceptanceCriteria: string }>;
}

interface EmergencyBody {
  pilotId: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers craft CRUD and lifecycle routes as a Fastify plugin.
 *
 * Routes:
 * - `POST   /api/v1/projects/:name/crafts`                — create a craft
 * - `GET    /api/v1/projects/:name/crafts`                — list crafts
 * - `GET    /api/v1/projects/:name/crafts/:callsign`      — get one craft
 * - `DELETE /api/v1/projects/:name/crafts/:callsign`      — remove a craft
 * - `POST   /api/v1/projects/:name/crafts/:callsign/launch`    — Taxiing -> InFlight
 * - `POST   /api/v1/projects/:name/crafts/:callsign/checklist` — run landing checklist
 * - `POST   /api/v1/projects/:name/crafts/:callsign/emergency` — declare emergency
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-CRAFT-1
 * @see RULE-LIFE-3
 * @see RULE-EMER-1
 */
export async function craftRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts
  // -------------------------------------------------------------------------

  app.post<{ Params: { name: string }; Body: CreateCraftBody }>(
    "/api/v1/projects/:name/crafts",
    async (request, reply) => {
      const { name } = request.params;
      const { callsign, branch, cargo, category, captain, firstOfficers, jumpseaters, flightPlan } =
        request.body;

      const vectors: VectorState[] = flightPlan.map((v) => ({
        name: v.name,
        acceptanceCriteria: v.acceptanceCriteria,
        status: "Pending" as const,
      }));

      const craft: CraftState = {
        callsign,
        createdAt: new Date().toISOString(),
        branch,
        cargo,
        category,
        status: CraftStatus.Taxiing,
        captain,
        firstOfficers: firstOfficers ?? [],
        jumpseaters: jumpseaters ?? [],
        flightPlan: vectors,
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: captain },
        holdingPattern: false,
      };

      // RULE-BBOX-1: black box is created at Taxiing — record the craft.created
      // event as the first entry so the log is non-empty for every craft from
      // the moment it exists.
      appendBlackBoxEntry(
        app,
        name,
        craft,
        captain,
        BlackBoxEntryType.CraftCreated,
        `Craft ${callsign} created on branch ${branch} with cargo: ${cargo}`,
      );
      app.craftStore.set(name, craft);
      publishCraftEvent(app, name, craft, "craft.created");

      // Attempt worktree creation — non-fatal in tests without a real bare repo
      try {
        const bareDir = join(app.profileDir, "projects", name, "repo.git");
        const worktreePath = join(app.profileDir, "projects", name, "crafts", callsign, "worktree");
        await createWorktree(bareDir, worktreePath, branch);
      } catch {
        // Non-fatal: tests and offline environments won't have a bare repo
      }

      return reply.code(201).send(craft);
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts
  // -------------------------------------------------------------------------

  app.get<{ Params: { name: string }; Querystring: { status?: string } }>(
    "/api/v1/projects/:name/crafts",
    async (request, reply) => {
      const { name } = request.params;
      const { status } = request.query;
      let crafts = app.craftStore.listForProject(name);

      if (status) {
        crafts = crafts.filter((c) => c.status === status);
      }

      return reply.send(crafts);
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts/:callsign
  // -------------------------------------------------------------------------

  app.get<{ Params: CraftParams }>(
    "/api/v1/projects/:name/crafts/:callsign",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      return reply.send(craft);
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /api/v1/projects/:name/crafts/:callsign
  // -------------------------------------------------------------------------

  app.delete<{ Params: CraftParams }>(
    "/api/v1/projects/:name/crafts/:callsign",
    async (request, reply) => {
      const { name, callsign } = request.params;
      app.craftStore.remove(name, callsign);
      publishCraftRemoved(app, name, callsign);
      return reply.code(204).send();
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts/:callsign/launch
  // -------------------------------------------------------------------------

  /**
   * Transition craft from Taxiing to InFlight.
   *
   * @see RULE-LIFE-3
   */
  app.post<{ Params: CraftParams }>(
    "/api/v1/projects/:name/crafts/:callsign/launch",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      if (craft.status !== CraftStatus.Taxiing) {
        return reply
          .code(409)
          .send({ error: `Craft is not Taxiing, current status: ${craft.status}` });
      }

      // RULE-LIFE-3: must have captain, cargo, and flightPlan
      if (!craft.captain || !craft.cargo || craft.flightPlan.length === 0) {
        return reply.code(400).send({
          error: "Launch requires captain, cargo, and at least one vector in flightPlan",
        });
      }

      craft.status = CraftStatus.InFlight;
      appendBlackBoxEntry(
        app,
        name,
        craft,
        craft.captain,
        BlackBoxEntryType.Launched,
        `Launched: ${CraftStatus.Taxiing} -> ${CraftStatus.InFlight}`,
      );
      appendBlackBoxEntry(
        app,
        name,
        craft,
        "system",
        BlackBoxEntryType.StateTransition,
        `State transition: ${CraftStatus.Taxiing} -> ${CraftStatus.InFlight}`,
      );
      app.craftStore.set(name, craft);
      publishCraftEvent(app, name, craft, "craft.launched", {
        from: CraftStatus.Taxiing,
        to: CraftStatus.InFlight,
      });

      // Spawn agent subprocesses via AgentManager when one is wired and an
      // adapter is registered. One agent is launched per crew member (captain
      // first, then each first officer). Unit tests without a manager skip
      // this path. Spawn failures are non-fatal and recorded in the black box.
      const manager = app.agentManager;
      const adapterType = "claude-agent-sdk";
      if (manager !== null && app.adapterRegistry.get(adapterType) !== undefined) {
        const worktreePath = join(
          app.profileDir,
          "projects",
          name,
          "crafts",
          callsign,
          "worktree",
        );
        mkdirSync(worktreePath, { recursive: true });

        const pilotsToSpawn = [craft.captain, ...craft.firstOfficers];
        for (const pilotId of pilotsToSpawn) {
          const pilot = app.pilotStore.get(name, pilotId);
          const agentId = randomUUID();
          try {
            await manager.launch({
              agentId,
              adapterType,
              projectName: name,
              callsign,
              pilotId,
              launchOptions: {
                agentId,
                worktreePath,
                craft,
                pilotId,
                systemPrompt: "",
                intercomHistory: craft.intercom,
                adapterConfig: {},
                mcpServers: pilot?.mcpServers ?? {},
              },
            });
            appendBlackBoxEntry(
              app,
              name,
              craft,
              "system",
              BlackBoxEntryType.Observation,
              `Agent launched for ${pilotId}: ${agentId}`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            appendBlackBoxEntry(
              app,
              name,
              craft,
              "system",
              BlackBoxEntryType.Observation,
              `Agent launch failed for ${pilotId}: ${msg}`,
            );
          }
        }
        app.craftStore.set(name, craft);
      }

      return reply.send(craft);
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts/:callsign/checklist
  // -------------------------------------------------------------------------

  /**
   * Run the landing checklist for a craft.
   *
   * Transitions the craft to `LandingChecklist` before running, then to
   * `GoAround` on failure or `ClearedToLand` on success per RULE-LCHK-3.
   *
   * Valid entry states: `InFlight`, `GoAround`.
   *
   * @see RULE-LCHK-1 through RULE-LCHK-4
   * @see RULE-LCHK-3
   */
  app.post<{ Params: CraftParams }>(
    "/api/v1/projects/:name/crafts/:callsign/checklist",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      // RULE-LCHK-3: only valid from InFlight or GoAround
      const validEntryStates: CraftStatus[] = [CraftStatus.InFlight, CraftStatus.GoAround];
      if (!validEntryStates.includes(craft.status)) {
        return reply.code(409).send({
          error: `Checklist requires InFlight or GoAround status, current status: ${craft.status}`,
        });
      }

      // Transition to LandingChecklist before running
      const entryStatus = craft.status;
      craft.status = CraftStatus.LandingChecklist;
      appendBlackBoxEntry(
        app,
        name,
        craft,
        "system",
        BlackBoxEntryType.StateTransition,
        `State transition: ${entryStatus} -> ${CraftStatus.LandingChecklist}`,
      );
      app.craftStore.set(name, craft);
      publishCraftEvent(app, name, craft, "craft.checklist.started", {
        from: entryStatus,
        to: CraftStatus.LandingChecklist,
      });

      let metadata;
      try {
        const projectDir = join(app.profileDir, "projects", name);
        metadata = await loadProjectMetadata(projectDir);
      } catch {
        return reply.code(404).send({ error: `Project not found: ${name}` });
      }

      const worktreePath = join(app.profileDir, "projects", name, "crafts", callsign, "worktree");
      const result = await runChecklist(metadata.checklist, worktreePath);

      // RULE-CHKL-5: per-item granularity in the black box.
      for (const item of result.items) {
        appendBlackBoxEntry(
          app,
          name,
          craft,
          "system",
          BlackBoxEntryType.ChecklistItem,
          `Checklist item "${item.name}" ${item.passed ? "passed" : "failed"} in ${item.durationMs}ms`,
        );
      }

      // RULE-CHKL-5: overall ChecklistRun entry records the aggregate result.
      appendBlackBoxEntry(
        app,
        name,
        craft,
        "system",
        BlackBoxEntryType.ChecklistRun,
        `Checklist ${result.passed ? "passed" : "failed"} (${result.items.length} items)`,
      );

      // RULE-LCHK-3: failure -> GoAround, success -> ClearedToLand
      const prevStatus = craft.status;
      craft.status = result.passed ? CraftStatus.ClearedToLand : CraftStatus.GoAround;

      if (!result.passed) {
        // RULE-BBOX entry types: dedicated GoAround marker for failure path.
        appendBlackBoxEntry(
          app,
          name,
          craft,
          "system",
          BlackBoxEntryType.GoAround,
          "Go-around initiated after checklist failure",
        );
      }
      appendBlackBoxEntry(
        app,
        name,
        craft,
        "system",
        BlackBoxEntryType.StateTransition,
        `State transition: ${prevStatus} -> ${craft.status}`,
      );

      app.craftStore.set(name, craft);
      publishCraftEvent(
        app,
        name,
        craft,
        result.passed ? "craft.checklist.passed" : "craft.checklist.failed",
        { from: CraftStatus.LandingChecklist, to: craft.status, result },
      );

      return reply.send({ ...result, status: craft.status });
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts/:callsign/emergency
  // -------------------------------------------------------------------------

  /**
   * Declare an emergency on a craft.
   *
   * Only valid from `GoAround` status (lifecycle transition 7).
   *
   * @see RULE-EMER-1 — only the captain may declare an emergency.
   */
  app.post<{ Params: CraftParams; Body: EmergencyBody }>(
    "/api/v1/projects/:name/crafts/:callsign/emergency",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const { pilotId, reason } = request.body;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      // RULE-EMER-1: only captain can declare emergency
      if (craft.captain !== pilotId) {
        return reply.code(403).send({ error: "Only the captain may declare an emergency" });
      }

      // Lifecycle transition 7: Emergency only reachable from GoAround
      if (craft.status !== CraftStatus.GoAround) {
        return reply.code(400).send({
          error: `Emergency can only be declared from GoAround status, current status: ${craft.status}`,
        });
      }

      const entry = appendBlackBoxEntry(
        app,
        name,
        craft,
        pilotId,
        BlackBoxEntryType.EmergencyDeclaration,
        reason,
      );
      craft.status = CraftStatus.Emergency;
      appendBlackBoxEntry(
        app,
        name,
        craft,
        "system",
        BlackBoxEntryType.StateTransition,
        `State transition: ${CraftStatus.GoAround} -> ${CraftStatus.Emergency}`,
      );
      app.craftStore.set(name, craft);
      publishCraftEvent(app, name, craft, "craft.emergency.declared", {
        from: CraftStatus.GoAround,
        to: CraftStatus.Emergency,
        entry,
      });

      return reply.send(craft);
    },
  );
}
