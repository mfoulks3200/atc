/**
 * Vector (flight plan) routes for the ATC daemon.
 *
 * Provides endpoints for reading a craft's flight plan, reporting vector
 * completion, and overriding failing command gates.
 *
 * @see RULE-VEC-1 through RULE-VEC-5 for vector rules.
 * @see RULE-VEC-2 for sequential ordering constraint.
 * @see RULE-VCMD-3 through RULE-VCMD-12 for command gate rules.
 * @see RULE-VRPT-2, RULE-VRPT-3 for amended vector report rules.
 */

import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { BlackBoxEntryType } from "@airtrafficcontrol/types";
import { publishCraftEvent } from "./broadcast.js";
import { appendBlackBoxEntry } from "./blackbox-helpers.js";
import { runVectorCommand } from "../../checklist/vector-command.js";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface VectorParams {
  name: string;
  callsign: string;
  vectorName: string;
}

interface ReportBody {
  /** Proof that acceptance criteria were met. Optional when command gate passes. @see RULE-VRPT-2 */
  evidence?: string;
}

interface OverrideBody {
  /** Pilot ID requesting the override (must be the craft's captain). @see RULE-VCMD-10 */
  pilotId: string;
  /** Required justification for bypassing the failing command gate. @see RULE-VCMD-10 */
  justification: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers vector (flight plan) routes as a Fastify plugin.
 *
 * Routes:
 * - `GET  /api/v1/projects/:name/crafts/:callsign/vectors`
 * - `POST /api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/report`
 * - `POST /api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/override-command-gate`
 *
 * @param app - The Fastify instance to register routes on.
 *
 * @see RULE-VEC-2, RULE-VCMD-10
 */
export async function vectorRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /api/v1/projects/:name/crafts/:callsign/vectors
  // -------------------------------------------------------------------------

  app.get<{ Params: { name: string; callsign: string } }>(
    "/api/v1/projects/:name/crafts/:callsign/vectors",
    async (request, reply) => {
      const { name, callsign } = request.params;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      return reply.send(craft.flightPlan);
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/report
  // -------------------------------------------------------------------------

  /**
   * Report a vector as passed.
   *
   * If the vector has a `command` field, the command is executed before
   * recording the report (RULE-VRPT-3). A `required` failure rejects the
   * report with 422 VECTOR_COMMAND_FAILED. An `advisory` failure is recorded
   * in the black box but does not block. Evidence is optional when a
   * `required` command gate exits 0 (RULE-VRPT-2).
   *
   * @see RULE-VEC-2, RULE-VCMD-5, RULE-VCMD-8, RULE-VCMD-12, RULE-VRPT-2, RULE-VRPT-3
   */
  app.post<{ Params: VectorParams; Body: ReportBody }>(
    "/api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/report",
    async (request, reply) => {
      const { name, callsign, vectorName } = request.params;
      const { evidence } = request.body;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      const vector = craft.flightPlan.find((v) => v.name === vectorName);
      if (!vector) {
        return reply.code(404).send({ error: `Vector not found: ${vectorName}` });
      }

      // RULE-VEC-2: must be the next Pending vector in order
      const nextPending = craft.flightPlan.find((v) => v.status === "Pending");
      if (!nextPending || nextPending.name !== vectorName) {
        return reply.code(409).send({
          error: `Vector "${vectorName}" is not the next pending vector`,
        });
      }

      // RULE-VRPT-3: if vector has a command field, execute it now
      if (vector.command) {
        const worktreePath = join(
          app.profileDir,
          "projects",
          name,
          "crafts",
          callsign,
          "worktree",
        );

        // RULE-VCMD-12: command.started event
        publishCraftEvent(app, name, craft, "craft.vector.command.started", {
          vectorName,
          command: vector.command.run,
        });

        // GIT_DIR is intentionally omitted: the worktree was created via
        // `git worktree add`, so its `.git` file already points back to the
        // bare repo. Git resolves the repository correctly without an explicit
        // GIT_DIR override (RULE-VCMD-4 advisory — safe for worktree contexts).
        const cmdResult = await runVectorCommand(
          vector.command.run,
          worktreePath,
          { callsign, vectorName },
          vector.command.timeout,
        );

        // RULE-VCMD-11: persist result on the vector state
        vector.commandResult = cmdResult;

        // RULE-VCMD-12: emit completion/failure/timeout event
        const commandPassed = cmdResult.status === "passed";
        if (cmdResult.timedOut) {
          publishCraftEvent(app, name, craft, "craft.vector.command.timeout", {
            vectorName,
            command: vector.command.run,
            durationMs: cmdResult.durationMs,
          });
        } else if (commandPassed) {
          publishCraftEvent(app, name, craft, "craft.vector.command.completed", {
            vectorName,
            command: vector.command.run,
            exitCode: cmdResult.exitCode,
            durationMs: cmdResult.durationMs,
          });
        } else {
          publishCraftEvent(app, name, craft, "craft.vector.command.failed", {
            vectorName,
            command: vector.command.run,
            exitCode: cmdResult.exitCode,
            stderr: cmdResult.stderr.slice(0, 4096),
            durationMs: cmdResult.durationMs,
          });
        }

        // RULE-VCMD-8: record VectorCommandRun black box entry every execution
        const severity = vector.command.severity ?? "required";
        appendBlackBoxEntry(
          app,
          name,
          craft,
          "system",
          BlackBoxEntryType.VectorCommandRun,
          JSON.stringify({
            vectorName,
            command: vector.command.run,
            exitCode: cmdResult.exitCode,
            timedOut: cmdResult.timedOut,
            stdout: cmdResult.stdout,
            stderr: cmdResult.stderr,
            durationMs: cmdResult.durationMs,
            outcome: commandPassed ? "passed" : "failed",
            severity,
          }),
        );

        // RULE-VCMD-5: required failure blocks; advisory failure records but proceeds
        if (!commandPassed && severity === "required") {
          // Persist the commandResult before returning (so callers can inspect it)
          app.craftStore.set(name, craft);
          // RULE-VCMD-7: API responses cap stdout at 4096 chars (black box retains full 64 KB).
          return reply.code(422).send({
            error: "VECTOR_COMMAND_FAILED",
            message: `Vector command for "${vectorName}" failed with ${cmdResult.timedOut ? "timeout" : `exit code ${cmdResult.exitCode ?? "unknown"}`}`,
            commandResult: {
              ...cmdResult,
              stdout: cmdResult.stdout.slice(0, 4096),
              stderr: cmdResult.stderr.slice(0, 4096),
            },
          });
        }

        // Advisory failure already black-boxed above; continue to record the report.
      }

      // RULE-VRPT-2: evidence is required unless a required-severity command gate
      // passed (machine-verified evidence substitutes).
      const commandGatePassed =
        vector.command != null &&
        (vector.command.severity ?? "required") === "required" &&
        vector.commandResult?.status === "passed";

      if (!evidence && !commandGatePassed) {
        return reply.code(400).send({
          error: "evidence is required unless a required-severity command gate passed",
        });
      }

      vector.status = "Passed";
      if (evidence) {
        vector.evidence = evidence;
      }
      vector.reportedAt = new Date().toISOString();

      appendBlackBoxEntry(
        app,
        name,
        craft,
        craft.captain,
        BlackBoxEntryType.VectorPassed,
        `Vector "${vectorName}" passed${evidence ? ` with evidence: ${evidence}` : " (command gate verified)"}`,
      );

      app.craftStore.set(name, craft);
      publishCraftEvent(app, name, craft, "craft.vector.reported", { vector });

      return reply.send(craft.flightPlan);
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/override-command-gate
  // -------------------------------------------------------------------------

  /**
   * Captain override for a failing command gate.
   *
   * Allows the craft's captain to bypass a `required`-severity command
   * failure and mark the vector passed with a written justification. The
   * override is permanently recorded in the black box.
   *
   * @see RULE-VCMD-10
   */
  app.post<{ Params: VectorParams; Body: OverrideBody }>(
    "/api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/override-command-gate",
    async (request, reply) => {
      const { name, callsign, vectorName } = request.params;
      const { pilotId, justification } = request.body;
      const craft = app.craftStore.get(name, callsign);

      if (!craft) {
        return reply.code(404).send({ error: `Craft not found: ${callsign}` });
      }

      // RULE-VCMD-10: only the captain may override
      if (craft.captain !== pilotId) {
        return reply.code(403).send({
          error: "Only the captain may override a command gate",
        });
      }

      // RULE-VCMD-10: justification must contain at least 20 non-whitespace characters.
      const nonWhitespace = (justification ?? "").replace(/\s/g, "");
      if (nonWhitespace.length < 20) {
        return reply.code(400).send({
          error: "SPEC_VALIDATION_ERROR",
          message: "justification must contain at least 20 non-whitespace characters",
        });
      }

      const vector = craft.flightPlan.find((v) => v.name === vectorName);
      if (!vector) {
        return reply.code(404).send({ error: `Vector not found: ${vectorName}` });
      }

      if (!vector.command) {
        return reply.code(400).send({
          error: `Vector "${vectorName}" has no command gate to override`,
        });
      }

      // RULE-VEC-2: must be the next Pending vector in order
      const nextPending = craft.flightPlan.find((v) => v.status === "Pending");
      if (!nextPending || nextPending.name !== vectorName) {
        return reply.code(409).send({
          error: `Vector "${vectorName}" is not the next pending vector`,
        });
      }

      // RULE-VCMD-8: record VectorCommandGateOverridden black box entry
      appendBlackBoxEntry(
        app,
        name,
        craft,
        pilotId,
        BlackBoxEntryType.VectorCommandGateOverridden,
        JSON.stringify({
          captainPilotId: pilotId,
          command: vector.command.run,
          exitCode: vector.commandResult?.exitCode,
          stdout: vector.commandResult?.stdout ?? "",
          stderr: vector.commandResult?.stderr ?? "",
          justification,
          timestamp: new Date().toISOString(),
        }),
      );

      vector.status = "Passed";
      vector.evidence = justification;
      vector.reportedAt = new Date().toISOString();

      appendBlackBoxEntry(
        app,
        name,
        craft,
        pilotId,
        BlackBoxEntryType.VectorPassed,
        `Vector "${vectorName}" passed via captain override: ${justification}`,
      );

      app.craftStore.set(name, craft);

      // RULE-VCMD-12: command.override event
      publishCraftEvent(app, name, craft, "craft.vector.command.override", {
        vectorName,
        captainPilotId: pilotId,
        justification,
      });

      publishCraftEvent(app, name, craft, "craft.vector.reported", { vector });

      return reply.send(craft.flightPlan);
    },
  );
}
