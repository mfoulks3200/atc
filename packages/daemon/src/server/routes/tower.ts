/**
 * Tower (merge queue) routes for the ATC daemon.
 *
 * Provides endpoints for viewing the tower landing queue and requesting
 * landing clearance after all vectors have passed.
 *
 * @see RULE-TOWER-1 for tower coordination rules.
 * @see RULE-TOWER-2 for clearance prerequisites.
 */

import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { BlackBoxEntryType, CraftStatus } from "@airtrafficcontrol/types";
import type { Craft } from "@airtrafficcontrol/types";
import { Tower } from "@airtrafficcontrol/tower";
import { publishCraftEvent } from "./broadcast.js";
import { appendBlackBoxEntry } from "./blackbox-helpers.js";
import { createTowerMergeExecutor } from "../../git/tower-merge-executor.js";
import type { CraftState, WsEvent } from "../../types.js";
import { DaemonClearanceChecklistRunner } from "../clearance-checklist-runner.js";
import { getOrCreateProjectChecklistRegistries } from "../app.js";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface ClearanceBody {
  callsign: string;
}

interface MergeBody {
  callsign: string;
}

/**
 * Build the minimal {@link Craft}-shaped object the tower package needs to
 * orchestrate a merge. The tower's `executeMerge` only consults `callsign`,
 * `branch`, and `cargo` on the craft, so we construct a thin facade rather
 * than converting the entire daemon `CraftState` shape.
 */
function craftFacade(state: CraftState): Craft {
  return {
    callsign: state.callsign,
    branch: state.branch,
    cargo: state.cargo,
    category: state.category,
    flightPlan: state.flightPlan,
  } as unknown as Craft;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers tower (merge queue) routes as a Fastify plugin.
 *
 * Routes:
 * - `GET  /api/v1/projects/:name/tower`           — view queue
 * - `POST /api/v1/projects/:name/tower/clearance`  — request clearance
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-TOWER-1
 * @see RULE-TOWER-2
 */
export async function towerRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/tower
  // -------------------------------------------------------------------------

  app.get<{ Params: { name: string } }>("/api/v1/projects/:name/tower", async (request, reply) => {
    const { name } = request.params;
    return reply.send(app.towerStore.getQueue(name));
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/tower/clearance
  // -------------------------------------------------------------------------

  /**
   * Request landing clearance for a craft.
   *
   * Verifies all vectors are passed (RULE-TOWER-2), then runs any
   * `before:tower-clearance` checklists (RULE-TMRG-5). Dispatches
   * `before:tower-clearance` and `after:tower-clearance` events explicitly
   * (NOT through mapTransitionToEvents — see §4.4 note in spec).
   *
   * @see RULE-TOWER-2  — all vectors must be passed before clearance.
   * @see RULE-TMRG-5   — run clearance checklists after vector check, before enqueue.
   * @see RULE-CHKL-13  — tower executes before:tower-clearance checklists.
   * @see RULE-CHKL-14  — deny on required failure; return structured denial payload.
   */
  app.post<{ Params: { name: string }; Body: ClearanceBody }>(
    "/api/v1/projects/:name/tower/clearance",
    async (request, reply) => {
      const { name } = request.params;
      const { callsign } = request.body;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      // Log the clearance request up front so an audit trail exists even if
      // the request is rejected for failing the vector-pass precondition.
      appendBlackBoxEntry(
        app,
        name,
        craft,
        craft.captain,
        BlackBoxEntryType.ClearanceRequested,
        `Landing clearance requested for ${callsign}`,
      );

      const registries = getOrCreateProjectChecklistRegistries(
        app.projectChecklistRegistries,
        name,
      );
      const checklistRunner = new DaemonClearanceChecklistRunner(registries);

      const tower = new Tower();
      const craftFacadeObj = craftFacade(craft);

      const result = await tower.requestClearance(craftFacadeObj, checklistRunner);

      if (!result.granted) {
        if (result.denialReason === "checklist-failed") {
          // RULE-CHKL-14: record failure details in the black box.
          appendBlackBoxEntry(
            app,
            name,
            craft,
            "system",
            BlackBoxEntryType.ChecklistRun,
            `Tower clearance checklists failed for ${callsign}`,
          );
          app.craftStore.set(name, craft);
          return reply.code(422).send({
            error: "Tower clearance checklist failed",
            code: "CLEARANCE_CHECKLIST_FAILED",
            denialReason: result.denialReason,
            checklistResults: result.checklistResults,
          });
        }
        // vectors-incomplete
        app.craftStore.set(name, craft);
        return reply.code(409).send({
          error: "Not all vectors have passed",
          denialReason: result.denialReason,
        });
      }

      app.towerStore.enqueue(name, callsign);
      appendBlackBoxEntry(
        app,
        name,
        craft,
        "system",
        BlackBoxEntryType.TowerEnqueued,
        `Enqueued on tower landing queue for project ${name}`,
      );
      app.craftStore.set(name, craft);

      // Dispatch after:tower-clearance — explicitly, not via mapTransitionToEvents (§4.4).
      publishCraftEvent(app, name, craft, "craft.clearance.granted");

      // Notify tower queue subscribers so list views refresh.
      const towerEvent: WsEvent = {
        type: "event",
        channel: `tower:${name}`,
        event: "tower.queue.changed",
        timestamp: new Date().toISOString(),
        data: { project: name, queue: app.towerStore.getQueue(name) },
      };
      app.channelRegistry.publish(towerEvent.channel, towerEvent);

      return reply.send({ granted: true });
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/tower/merge
  // -------------------------------------------------------------------------

  /**
   * Execute steps 4–6 of the tower merge protocol for an enqueued craft.
   *
   * Verifies the craft branch is up to date with the project's main branch,
   * executes the merge into main, and on success transitions the craft to
   * `Landed`. Conflicts and stale branches return the craft to `GoAround`
   * with a black box entry describing the failure mode.
   *
   * The merge is delegated to a {@link createTowerMergeExecutor} bound to
   * the project's bare repo, which the `@airtrafficcontrol/tower` package
   * drives via its `executeMerge` orchestrator.
   *
   * @see RULE-TOWER-3
   * @see RULE-TMRG-2
   * @see RULE-TMRG-3
   */
  app.post<{ Params: { name: string }; Body: MergeBody }>(
    "/api/v1/projects/:name/tower/merge",
    async (request, reply) => {
      const { name } = request.params;
      const { callsign } = request.body;

      const craft = app.craftStore.get(name, callsign);
      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      const queue = app.towerStore.getQueue(name);
      if (!queue.some((e) => e.callsign === callsign)) {
        return reply.code(409).send({ error: `Craft ${callsign} is not in the merge queue` });
      }

      // Build a per-request Tower seeded with the daemon-tracked queue. This
      // keeps merge orchestration inside @airtrafficcontrol/tower while still
      // letting the daemon own persistence.
      const tower = new Tower();
      tower.enqueue(craftFacade(craft));

      const bareDir = join(app.profileDir, "projects", name, "repo.git");
      const executor = createTowerMergeExecutor(bareDir);

      let outcome;
      try {
        outcome = await tower.executeMerge(craftFacade(craft), executor);
      } catch (err) {
        return reply
          .code(500)
          .send({ error: err instanceof Error ? err.message : "Tower merge failed" });
      }

      // Always dequeue and record the dequeue event; the next step depends
      // on the outcome.
      app.towerStore.dequeue(name, callsign);
      appendBlackBoxEntry(
        app,
        name,
        craft,
        "system",
        BlackBoxEntryType.TowerDequeued,
        `Removed from tower landing queue for project ${name}`,
      );

      const previousStatus = craft.status;

      if (outcome.kind === "landed") {
        // RULE-TMRG-2 success path.
        craft.status = CraftStatus.Landed;
        appendBlackBoxEntry(
          app,
          name,
          craft,
          "system",
          BlackBoxEntryType.Merge,
          `Merged ${craft.branch} into ${outcome.mainBranch} (${outcome.mergeCommit})`,
        );
        appendBlackBoxEntry(
          app,
          name,
          craft,
          "system",
          BlackBoxEntryType.StateTransition,
          `${previousStatus} → ${CraftStatus.Landed}`,
        );
        app.craftStore.set(name, craft);
        publishCraftEvent(app, name, craft, "craft.landed", {
          mergeCommit: outcome.mergeCommit,
          mainBranch: outcome.mainBranch,
        });
      } else if (outcome.kind === "stale") {
        // RULE-TMRG-2: branch not up to date — return to GoAround.
        craft.status = CraftStatus.GoAround;
        appendBlackBoxEntry(
          app,
          name,
          craft,
          "system",
          BlackBoxEntryType.MergeStale,
          `Branch ${craft.branch} is not up to date with ${outcome.mainBranch}: ${outcome.reason}`,
        );
        appendBlackBoxEntry(
          app,
          name,
          craft,
          "system",
          BlackBoxEntryType.StateTransition,
          `${previousStatus} → ${CraftStatus.GoAround}`,
        );
        app.craftStore.set(name, craft);
        publishCraftEvent(app, name, craft, "craft.goaround", { reason: "stale" });
      } else {
        // RULE-TMRG-3: merge conflict — return to GoAround.
        craft.status = CraftStatus.GoAround;
        appendBlackBoxEntry(
          app,
          name,
          craft,
          "system",
          BlackBoxEntryType.MergeConflict,
          `Merge of ${craft.branch} into ${outcome.mainBranch} conflicted: ${outcome.reason}`,
        );
        appendBlackBoxEntry(
          app,
          name,
          craft,
          "system",
          BlackBoxEntryType.StateTransition,
          `${previousStatus} → ${CraftStatus.GoAround}`,
        );
        app.craftStore.set(name, craft);
        publishCraftEvent(app, name, craft, "craft.goaround", { reason: "conflict" });
      }

      // Notify tower queue subscribers so list views refresh.
      const towerEvent: WsEvent = {
        type: "event",
        channel: `tower:${name}`,
        event: "tower.queue.changed",
        timestamp: new Date().toISOString(),
        data: { project: name, queue: app.towerStore.getQueue(name) },
      };
      app.channelRegistry.publish(towerEvent.channel, towerEvent);

      return reply.send({ outcome: outcome.kind, status: craft.status });
    },
  );
}
