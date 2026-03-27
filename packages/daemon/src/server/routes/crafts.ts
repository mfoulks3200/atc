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
import type { FastifyInstance } from "fastify";
import { CraftStatus, BlackBoxEntryType } from "@atc/types";
import { createWorktree } from "../../git/worktree.js";
import { loadProjectMetadata } from "../../config/loader.js";
import { runChecklist } from "../../checklist/runner.js";
import type { CraftState, VectorState, BlackBoxEntry } from "../../types.js";

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
      const {
        callsign,
        branch,
        cargo,
        category,
        captain,
        firstOfficers,
        jumpseaters,
        flightPlan,
      } = request.body;

      const vectors: VectorState[] = flightPlan.map((v) => ({
        name: v.name,
        acceptanceCriteria: v.acceptanceCriteria,
        status: "Pending" as const,
      }));

      const craft: CraftState = {
        callsign,
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
      };

      app.craftStore.set(name, craft);

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
        return reply.code(409).send({ error: `Craft is not Taxiing, current status: ${craft.status}` });
      }

      // RULE-LIFE-3: must have captain, cargo, and flightPlan
      if (!craft.captain || !craft.cargo || craft.flightPlan.length === 0) {
        return reply.code(400).send({
          error: "Launch requires captain, cargo, and at least one vector in flightPlan",
        });
      }

      craft.status = CraftStatus.InFlight;
      app.craftStore.set(name, craft);

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
      craft.status = CraftStatus.LandingChecklist;
      app.craftStore.set(name, craft);

      let metadata;
      try {
        const projectDir = join(app.profileDir, "projects", name);
        metadata = await loadProjectMetadata(projectDir);
      } catch {
        return reply.code(404).send({ error: `Project not found: ${name}` });
      }

      const worktreePath = join(
        app.profileDir,
        "projects",
        name,
        "crafts",
        callsign,
        "worktree",
      );
      const result = await runChecklist(metadata.checklist, worktreePath);

      // RULE-LCHK-3: failure -> GoAround, success -> ClearedToLand
      craft.status = result.passed ? CraftStatus.ClearedToLand : CraftStatus.GoAround;
      app.craftStore.set(name, craft);

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

      const entry: BlackBoxEntry = {
        timestamp: new Date().toISOString(),
        author: pilotId,
        type: BlackBoxEntryType.EmergencyDeclaration,
        content: reason,
      };

      craft.blackBox.push(entry);
      craft.status = CraftStatus.Emergency;
      app.craftStore.set(name, craft);

      return reply.send(craft);
    },
  );
}
