/**
 * REST route for spec-driven craft creation.
 *
 * Implements the 12-step SDD creation procedure (§4.6.1), autoLaunch safety
 * guards (§4.6.3), dry-run mode (RULE-SDD-15), and command scope enforcement
 * (RULE-VCMD-9).
 *
 * Route: POST /api/v1/projects/:name/crafts/from-spec
 *   Query: ?dryRun=true — validate and compute without side effects.
 *   Body:  application/json | application/yaml | application/x-yaml
 *
 * @see RULE-SDD-1 through RULE-SDD-17
 * @see RULE-VCMD-9
 * @see §4.6.1 — Creation Procedure
 * @see §4.6.3 — AutoLaunch Safety
 * @see §4.6.6 — Audit Trail
 */

import { join } from "node:path";
import { load as yamlLoad } from "js-yaml";
import type { FastifyInstance } from "fastify";
import { CraftStatus, BlackBoxEntryType } from "@airtrafficcontrol/types";
import { generateCallsign, selectCaptain } from "@airtrafficcontrol/core";
import { createWorktree, removeWorktree } from "../../git/worktree.js";
import { appendBlackBoxEntry } from "./blackbox-helpers.js";
import { publishCraftEvent } from "./broadcast.js";
import type { CraftState, VectorState, PilotRecord } from "../../types.js";
import type { SpecDocument } from "@airtrafficcontrol/types";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a parsed spec object against RULE-SDD-1 through RULE-SDD-4 and
 * RULE-VCMD-1 through RULE-VCMD-2.
 *
 * @returns A human-readable error message, or null if valid.
 * @see RULE-SDD-1, RULE-SDD-2, RULE-SDD-4, RULE-VCMD-1, RULE-VCMD-2
 */
function validateSpecFields(spec: unknown): string | null {
  if (typeof spec !== "object" || spec === null) {
    return "Spec must be a non-null object";
  }

  const s = spec as Record<string, unknown>;

  if (!s.title || typeof s.title !== "string" || s.title.trim() === "") {
    return "Missing required field: title";
  }
  if (!s.cargo || typeof s.cargo !== "string" || s.cargo.trim() === "") {
    return "Missing required field: cargo";
  }
  if (!s.category || typeof s.category !== "string" || s.category.trim() === "") {
    return "Missing required field: category";
  }
  if (!Array.isArray(s.vectors) || s.vectors.length === 0) {
    return "Missing required field: vectors (must be a non-empty array)";
  }

  for (let i = 0; i < (s.vectors as unknown[]).length; i++) {
    const v = (s.vectors as unknown[])[i] as Record<string, unknown>;
    if (!v || typeof v !== "object") {
      return `Vector at index ${i} must be an object`;
    }
    if (!v.name || typeof v.name !== "string" || (v.name as string).trim() === "") {
      return `Vector at index ${i} is missing a name`;
    }

    const hasCriteria =
      Array.isArray(v.criteria) &&
      (v.criteria as unknown[]).length > 0 &&
      (v.criteria as unknown[]).every((c) => typeof c === "string" && (c as string).trim() !== "");

    const cmd = v.command as Record<string, unknown> | null | undefined;
    const hasCommand =
      cmd != null &&
      typeof cmd === "object" &&
      typeof cmd.run === "string" &&
      (cmd.run as string).trim() !== "";

    // RULE-VCMD-2: at least one of criteria or command must be present
    if (!hasCriteria && !hasCommand) {
      if (v.command !== undefined && v.command !== null) {
        return `Vector "${v.name}" has an invalid command: run must be a non-empty string`;
      }
      return `Vector "${v.name}" must have at least one non-empty criterion or a command`;
    }
  }

  return null;
}

/**
 * Returns true if any vector in the spec carries a non-null command field.
 *
 * @see RULE-VCMD-9
 */
function specHasCommandVectors(spec: unknown): boolean {
  if (typeof spec !== "object" || spec === null) return false;
  const s = spec as Record<string, unknown>;
  if (!Array.isArray(s.vectors)) return false;
  return (s.vectors as unknown[]).some((v) => {
    if (typeof v !== "object" || v === null) return false;
    const cmd = (v as Record<string, unknown>).command;
    return cmd != null;
  });
}

/**
 * Returns true if the given scope string carries the `spec:command` permission.
 *
 * When no `x-atc-scope` header is present (undefined), the request is treated as
 * an interactive session with full scope — command submission is permitted.
 * An explicit scope header that does not include `spec:command` rejects command specs.
 *
 * @see RULE-VCMD-9
 */
function hasCommandScope(scope: string | string[] | undefined): boolean {
  if (scope === undefined) return true;
  const scopeStr = Array.isArray(scope) ? scope.join(" ") : scope;
  return scopeStr.split(/\s+/).includes("spec:command");
}

/**
 * Returns true if the given scope string carries the `spec:autolaunch` permission.
 *
 * When no `x-atc-scope` header is present (undefined), the request is treated as
 * an interactive session with full scope — autoLaunch is permitted by this guard.
 * An explicit scope header that does not include `spec:autolaunch` suppresses it.
 *
 * @see RULE-SDD-13
 */
function hasAutoLaunchScope(scope: string | string[] | undefined): boolean {
  if (scope === undefined) return true;
  const scopeStr = Array.isArray(scope) ? scope.join(" ") : scope;
  return scopeStr.split(/\s+/).includes("spec:autolaunch");
}

/**
 * Returns true if any active TFR suppresses autoLaunch for the given project.
 *
 * @see RULE-SDD-12
 */
function hasActiveTfrForProject(app: FastifyInstance, projectName: string): boolean {
  return app.tfrStore
    .listActive()
    .some(
      (tfr) => tfr.scope === "global" || (tfr.scope === "project" && tfr.target === projectName),
    );
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

/**
 * Registers the spec-driven craft creation route and YAML body parsers.
 *
 * @see RULE-SDD-1 through RULE-SDD-17
 * @see §4.6.1 — 12-step creation procedure
 */
export async function craftsFromSpecRoutes(app: FastifyInstance): Promise<void> {
  // Register YAML content-type parsers
  for (const ct of ["application/yaml", "application/x-yaml"]) {
    app.addContentTypeParser(ct, { parseAs: "string" }, (_req, body, done) => {
      try {
        const parsed = yamlLoad(body as string);
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    });
  }

  app.post<{
    Params: { name: string };
    Querystring: { dryRun?: string };
    Body: unknown;
  }>("/api/v1/projects/:name/crafts/from-spec", async (request, reply) => {
    const { name } = request.params;
    const dryRun = request.query.dryRun === "true" || request.query.dryRun === "1";

    // Step 1: Locate project config store
    const configStore = app.projectConfigStores.get(name);
    if (!configStore) {
      return reply
        .code(404)
        .send({ code: "PROJECT_NOT_FOUND", message: `Project not found: ${name}` });
    }

    const projectConfig = configStore.get();

    // Step 2: Validate spec fields (RULE-SDD-1 through RULE-SDD-4, RULE-VCMD-2)
    const validationError = validateSpecFields(request.body);
    if (validationError) {
      return reply.code(422).send({ code: "SPEC_VALIDATION_ERROR", message: validationError });
    }

    // RULE-VCMD-9: specs with command vectors require spec:command scope
    if (specHasCommandVectors(request.body)) {
      if (!hasCommandScope(request.headers["x-atc-scope"])) {
        return reply.code(403).send({
          code: "INSUFFICIENT_SCOPE",
          message:
            "Submitting a spec with command fields requires the spec:command permission scope.",
        });
      }
    }

    const spec = request.body as SpecDocument;

    // RULE-SDD-3: category must match project-configured categories
    if (!projectConfig.categories.includes(spec.category)) {
      return reply.code(422).send({
        code: "UNKNOWN_CATEGORY",
        message: `Category "${spec.category}" is not configured for project "${name}". Available: ${projectConfig.categories.join(", ") || "(none)"}`,
      });
    }

    // Step 3: Generate (or validate) callsign
    let callsign: string;
    let nextCounter = projectConfig.callsignCounter;

    if (spec.callsignOverride) {
      // RULE-SDD-5: explicit callsign must be unique
      const existingCallsigns = app.craftStore.listForProject(name).map((c) => c.callsign);
      if (existingCallsigns.includes(spec.callsignOverride)) {
        return reply.code(409).send({
          code: "CALLSIGN_CONFLICT",
          message: `Callsign "${spec.callsignOverride}" is already in use.`,
        });
      }
      callsign = spec.callsignOverride;
    } else {
      const existingCallsigns = app.craftStore.listForProject(name).map((c) => c.callsign);
      const result = generateCallsign(spec.title, projectConfig.callsignCounter, existingCallsigns);
      callsign = result.callsign;
      nextCounter = result.nextCounter;
    }

    // Step 4: Generate flight plan
    const flightPlan: VectorState[] = spec.vectors.map((v) => ({
      name: v.name,
      acceptanceCriteria: v.criteria ? v.criteria.join("\n") : "",
      status: "Pending" as const,
    }));

    // Step 5: Resolve pilot crew
    const allPilots = app.pilotStore.listForProject(name);
    const corePilots = allPilots.map((p: PilotRecord) => ({
      identifier: p.identifier,
      certifications: p.certifications as string[],
      selectionCount: (p as PilotRecord & { selectionCount?: number }).selectionCount ?? 0,
    }));
    const activeCrafts = app.craftStore.listForProject(name);

    let captainId: string;
    let firstOfficerIds: string[] = [];
    const jumpseaterIds: string[] = spec.pilots?.jumpseaters ?? [];

    if (spec.pilots?.captain) {
      // RULE-SDD-6: explicit captain must be certified
      const captainPilot = allPilots.find((p) => p.identifier === spec.pilots!.captain);
      if (!captainPilot) {
        return reply.code(422).send({
          code: "PILOT_NOT_CERTIFIED",
          message: `Pilot "${spec.pilots.captain}" not found in project.`,
        });
      }
      if (!captainPilot.certifications.includes(spec.category)) {
        return reply.code(422).send({
          code: "PILOT_NOT_CERTIFIED",
          message: `Pilot "${spec.pilots.captain}" is not certified for category "${spec.category}". Holds: ${captainPilot.certifications.join(", ") || "(none)"}`,
        });
      }
      captainId = captainPilot.identifier;
    } else {
      // Auto-select captain (RULE-SDD-8, RULE-SDD-9)
      try {
        const captain = selectCaptain({
          category: spec.category,
          pilots: corePilots,
          activeCrafts,
          foWeight: 0.5,
          exclude: spec.pilots?.exclude,
          requireCertifications: spec.pilots?.requireCertifications,
        });
        captainId = captain.identifier;
        if (!dryRun) {
          const pilotRecord = allPilots.find((p) => p.identifier === captain.identifier);
          if (pilotRecord) {
            (pilotRecord as PilotRecord & { selectionCount?: number }).selectionCount =
              captain.selectionCount;
            app.pilotStore.set(name, pilotRecord);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.code(422).send({ code: "NO_CERTIFIED_PILOT", message: msg });
      }
    }

    if (spec.pilots?.firstOfficers && spec.pilots.firstOfficers.length > 0) {
      // RULE-SDD-7 + RULE-SDD-10: explicit FOs must be certified and not the captain
      for (const foId of spec.pilots.firstOfficers) {
        if (foId === captainId) {
          return reply.code(422).send({
            code: "PILOT_ROLE_CONFLICT",
            message: `Pilot "${foId}" cannot be both captain and first officer.`,
          });
        }
        const foPilot = allPilots.find((p) => p.identifier === foId);
        if (!foPilot) {
          return reply.code(422).send({
            code: "PILOT_NOT_CERTIFIED",
            message: `First officer "${foId}" not found in project.`,
          });
        }
        if (!foPilot.certifications.includes(spec.category)) {
          return reply.code(422).send({
            code: "PILOT_NOT_CERTIFIED",
            message: `First officer "${foId}" is not certified for category "${spec.category}".`,
          });
        }
      }
      firstOfficerIds = spec.pilots.firstOfficers;
    }

    // Step 6: Dry-run exit (RULE-SDD-15)
    const dryRunCraft: CraftState = {
      callsign,
      createdAt: new Date().toISOString(),
      branch: callsign,
      cargo: spec.cargo,
      category: spec.category,
      status: CraftStatus.Taxiing,
      captain: captainId,
      firstOfficers: firstOfficerIds,
      jumpseaters: jumpseaterIds,
      flightPlan,
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: captainId },
      holdingPattern: false,
    };

    if (dryRun) {
      return reply.code(200).send(dryRunCraft);
    }

    // Step 7: Persist callsign counter (§4.6.2)
    if (!spec.callsignOverride) {
      await configStore.patch({ callsignCounter: nextCounter });
    }

    // Step 8: Create git worktree branch (tracked for compensating rollback)
    const bareDir = join(app.profileDir, "projects", name, "repo.git");
    const worktreePath = join(app.profileDir, "projects", name, "crafts", callsign, "worktree");
    let worktreeCreated = false;
    try {
      await createWorktree(bareDir, worktreePath, callsign);
      worktreeCreated = true;
    } catch {
      // Non-fatal: offline / test environments won't have a bare repo
    }

    // Step 9: Write craft record — delete worktree branch on failure (compensating action)
    const tfrActive = hasActiveTfrForProject(app, name);

    const craft: CraftState = {
      ...dryRunCraft,
      holdingPattern: tfrActive,
    };

    try {
      app.craftStore.set(name, craft);
    } catch (err) {
      if (worktreeCreated) {
        await removeWorktree(bareDir, worktreePath).catch(() => undefined);
      }
      throw err;
    }

    // Determine autoLaunch suppression for Step 10/11
    const autoLaunchRequested = spec.autoLaunch === true;
    let suppressionReason: string | null = null;

    if (autoLaunchRequested) {
      if (projectConfig.allowAutoLaunch !== true) {
        suppressionReason = "allowAutoLaunch is not enabled for this project (RULE-SDD-11)";
      } else if (tfrActive) {
        suppressionReason = "Active TFR suppresses autoLaunch (RULE-SDD-12)";
      } else if (!hasAutoLaunchScope(request.headers["x-atc-scope"])) {
        // RULE-SDD-13: API key or session must carry spec:autolaunch scope
        suppressionReason = "API key lacks spec:autolaunch permission scope (RULE-SDD-13)";
      } else if (request.headers["x-atc-agent-id"]) {
        // RULE-SDD-14: agent-submitted specs cannot autoLaunch
        suppressionReason =
          "Agent-submitted specs cannot autoLaunch — human/tower confirmation required (RULE-SDD-14)";
      }
    }

    // Step 10: Record SpecCreated black box entry (RULE-SDD-16)
    const bboxContent = [
      `SpecCreated via rest — title: "${spec.title}"`,
      `source: rest`,
      `autoLaunch requested: ${autoLaunchRequested}`,
      suppressionReason
        ? `autoLaunch suppressed — ${suppressionReason}`
        : `autoLaunch executed: ${autoLaunchRequested && suppressionReason === null}`,
      spec.notes ? `notes: ${spec.notes}` : null,
    ]
      .filter(Boolean)
      .join("; ");

    appendBlackBoxEntry(app, name, craft, captainId, BlackBoxEntryType.SpecCreated, bboxContent);
    app.craftStore.set(name, craft);

    // Step 11: Evaluate autoLaunch (RULE-SDD-11 through RULE-SDD-14)
    if (autoLaunchRequested && suppressionReason === null) {
      craft.status = CraftStatus.InFlight;
      appendBlackBoxEntry(
        app,
        name,
        craft,
        captainId,
        BlackBoxEntryType.Launched,
        `Auto-launched from spec: ${CraftStatus.Taxiing} -> ${CraftStatus.InFlight}`,
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
        source: "sdd",
      });
    } else {
      publishCraftEvent(app, name, craft, "craft.created", { source: "sdd" });
    }

    // Step 12: Return created craft
    return reply.code(201).send(craft);
  });
}

/**
 * Processes a spec document through the SDD creation procedure without HTTP context.
 *
 * Used by the file-watcher inbox processor to submit specs via the same 12-step
 * procedure as the REST endpoint.
 *
 * @param app - Fastify instance providing access to all stores.
 * @param projectName - Project to create the craft under.
 * @param spec - Parsed, validated spec document.
 * @param source - Submission source for the RULE-SDD-16 audit trail.
 * @returns The newly created craft.
 *
 * @see RULE-SDD-16
 * @see §4.6.1
 */
export async function processSpec(
  app: FastifyInstance,
  projectName: string,
  spec: SpecDocument,
  source: "rest" | "file-watch" | "cli",
): Promise<CraftState> {
  const configStore = app.projectConfigStores.get(projectName);
  if (!configStore) {
    throw Object.assign(new Error(`Project not found: ${projectName}`), {
      code: "PROJECT_NOT_FOUND",
    });
  }

  const projectConfig = configStore.get();

  const validationError = validateSpecFields(spec);
  if (validationError) {
    throw Object.assign(new Error(validationError), { code: "SPEC_VALIDATION_ERROR" });
  }

  if (!projectConfig.categories.includes(spec.category)) {
    throw Object.assign(
      new Error(`Category "${spec.category}" is not configured for project "${projectName}".`),
      { code: "UNKNOWN_CATEGORY" },
    );
  }

  let callsign: string;
  let nextCounter = projectConfig.callsignCounter;

  if (spec.callsignOverride) {
    const existingCallsigns = app.craftStore.listForProject(projectName).map((c) => c.callsign);
    if (existingCallsigns.includes(spec.callsignOverride)) {
      throw Object.assign(new Error(`Callsign "${spec.callsignOverride}" is already in use.`), {
        code: "CALLSIGN_CONFLICT",
      });
    }
    callsign = spec.callsignOverride;
  } else {
    const existingCallsigns = app.craftStore.listForProject(projectName).map((c) => c.callsign);
    const result = generateCallsign(spec.title, projectConfig.callsignCounter, existingCallsigns);
    callsign = result.callsign;
    nextCounter = result.nextCounter;
  }

  const flightPlan: VectorState[] = spec.vectors.map((v) => ({
    name: v.name,
    acceptanceCriteria: v.criteria ? v.criteria.join("\n") : "",
    status: "Pending" as const,
  }));

  const allPilots = app.pilotStore.listForProject(projectName);
  const corePilots = allPilots.map((p: PilotRecord) => ({
    identifier: p.identifier,
    certifications: p.certifications as string[],
    selectionCount: (p as PilotRecord & { selectionCount?: number }).selectionCount ?? 0,
  }));
  const activeCrafts = app.craftStore.listForProject(projectName);

  let captainId: string;
  const jumpseaterIds: string[] = spec.pilots?.jumpseaters ?? [];

  if (spec.pilots?.captain) {
    const captainPilot = allPilots.find((p) => p.identifier === spec.pilots!.captain);
    if (!captainPilot || !captainPilot.certifications.includes(spec.category)) {
      throw Object.assign(
        new Error(
          `Pilot "${spec.pilots.captain}" is not certified for category "${spec.category}".`,
        ),
        { code: "PILOT_NOT_CERTIFIED" },
      );
    }
    captainId = captainPilot.identifier;
  } else {
    const captain = selectCaptain({
      category: spec.category,
      pilots: corePilots,
      activeCrafts,
      foWeight: 0.5,
      exclude: spec.pilots?.exclude,
      requireCertifications: spec.pilots?.requireCertifications,
    });
    captainId = captain.identifier;
    const pilotRecord = allPilots.find((p) => p.identifier === captain.identifier);
    if (pilotRecord) {
      (pilotRecord as PilotRecord & { selectionCount?: number }).selectionCount =
        captain.selectionCount;
      app.pilotStore.set(projectName, pilotRecord);
    }
  }

  if (!spec.callsignOverride) {
    await configStore.patch({ callsignCounter: nextCounter });
  }

  try {
    const bareDir = join(app.profileDir, "projects", projectName, "repo.git");
    const worktreePath = join(
      app.profileDir,
      "projects",
      projectName,
      "crafts",
      callsign,
      "worktree",
    );
    await createWorktree(bareDir, worktreePath, callsign);
  } catch {
    // Non-fatal
  }

  const tfrActive = hasActiveTfrForProject(app, projectName);
  const autoLaunchRequested = spec.autoLaunch === true;
  const projectAllows = projectConfig.allowAutoLaunch === true;
  let suppressionReason: string | null = null;

  if (autoLaunchRequested) {
    if (!projectAllows) suppressionReason = "allowAutoLaunch is not enabled (RULE-SDD-11)";
    else if (tfrActive) suppressionReason = "Active TFR (RULE-SDD-12)";
  }

  const craft: CraftState = {
    callsign,
    createdAt: new Date().toISOString(),
    branch: callsign,
    cargo: spec.cargo,
    category: spec.category,
    status: CraftStatus.Taxiing,
    captain: captainId,
    firstOfficers: [],
    jumpseaters: jumpseaterIds,
    flightPlan,
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: captainId },
    holdingPattern: tfrActive,
  };

  app.craftStore.set(projectName, craft);

  const bboxContent = [
    `SpecCreated via ${source} — title: "${spec.title}"`,
    `source: ${source}`,
    `autoLaunch requested: ${autoLaunchRequested}`,
    suppressionReason
      ? `autoLaunch suppressed — ${suppressionReason}`
      : `autoLaunch executed: ${autoLaunchRequested && suppressionReason === null}`,
    spec.notes ? `notes: ${spec.notes}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  appendBlackBoxEntry(
    app,
    projectName,
    craft,
    captainId,
    BlackBoxEntryType.SpecCreated,
    bboxContent,
  );
  app.craftStore.set(projectName, craft);

  if (autoLaunchRequested && suppressionReason === null) {
    craft.status = CraftStatus.InFlight;
    appendBlackBoxEntry(
      app,
      projectName,
      craft,
      captainId,
      BlackBoxEntryType.Launched,
      `Auto-launched via ${source}`,
    );
    app.craftStore.set(projectName, craft);
    publishCraftEvent(app, projectName, craft, "craft.launched", {
      from: CraftStatus.Taxiing,
      to: CraftStatus.InFlight,
      source,
    });
  } else {
    publishCraftEvent(app, projectName, craft, "craft.created", { source });
  }

  return craft;
}
