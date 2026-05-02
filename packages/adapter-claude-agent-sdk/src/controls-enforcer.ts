/**
 * Runtime enforcer for RULE-CTRL-3 — a pilot MUST NOT modify code on the
 * craft's branch unless they currently hold controls (exclusively, or within
 * their shared area).
 *
 * This module plugs into the Claude Agent SDK's `canUseTool` hook. On every
 * file-modification tool call (Edit, Write, MultiEdit, NotebookEdit), it
 * delegates to the daemon's `POST /controls/verify` endpoint, which is the
 * authoritative enforcement point for RULE-CTRL-3. The adapter no longer
 * makes the allow/deny decision locally.
 *
 * Bash is partially enforced: it's allowed if the pilot has ANY controls on
 * the craft (exclusive holder or has any shared area). This is a coarse
 * check — the shell can still touch files outside declared areas — but
 * prevents jumpseaters and pilots with no controls at all from running
 * arbitrary file mutations. The daemon applies the same coarse gate via
 * `POST /controls/verify` with no `filePath`.
 *
 * Read-only tools (Read, Glob, Grep, LS) are always allowed — the spec
 * only restricts MODIFICATION, not observation.
 *
 * @see RULE-CTRL-3 for the underlying rule.
 * @see RULE-CTRL-2 for the jumpseat restriction this also enforces.
 */

import { relative, isAbsolute, normalize } from "node:path";

/**
 * Minimal shape of a craft's controls state, matching the daemon's on-disk
 * shape (`pilotId` / string-union mode). The adapter fetches this directly
 * from `GET /api/v1/projects/:name/crafts/:callsign/controls`.
 */
export interface ControlsSnapshot {
  mode: "exclusive" | "shared";
  holder?: string;
  sharedAreas?: Array<{ pilotId: string; area: string }>;
}

/**
 * Runtime context the enforcer needs to make a decision.
 */
export interface ControlsEnforcerContext {
  /** Absolute URL of the ATC daemon — used to fetch the latest controls. */
  daemonUrl: string;
  /** Project name the craft belongs to. */
  projectName: string;
  /** Aviation callsign of the craft. */
  callsign: string;
  /** The pilot id this agent represents. */
  pilotId: string;
  /** Seat type of this pilot (`captain` / `firstOfficer` / `jumpseat`). */
  seat: "captain" | "firstOfficer" | "jumpseat";
  /** Absolute path of the worktree the agent was launched with. */
  worktreePath: string;
  /**
   * Optional fetch override so tests can inject a fake controls source.
   * Defaults to `globalThis.fetch`.
   */
  fetch?: typeof fetch;
}

/**
 * Tool names whose `file_path` input this enforcer inspects.
 */
const FILE_MODIFYING_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/**
 * Shape of the permission decision returned to the SDK. Matches the subset
 * of `PermissionResult` we actually produce. For `allow`, we echo the
 * original tool input back as `updatedInput` so the SDK can pass it through
 * to the tool unchanged.
 */
export type EnforcementDecision =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string; interrupt?: boolean };

/**
 * Normalise a raw `file_path` from a tool input into a path relative to
 * the worktree, so we can compare it against shared areas.
 *
 * - Absolute paths inside the worktree are made relative to it.
 * - Absolute paths outside the worktree are returned as-is (treated as a
 *   scope-violation — no shared area can ever cover them).
 * - Relative paths are normalised (e.g. `./src/foo` → `src/foo`).
 *
 * @deprecated Enforcement is now delegated to the daemon's POST /controls/verify
 * endpoint. This function is retained for backward compatibility only.
 */
export function normalizeFilePath(filePath: string, worktreePath: string): string {
  if (isAbsolute(filePath)) {
    const rel = relative(worktreePath, filePath);
    // `relative()` may produce `../..` if the target escapes the worktree;
    // in that case keep the absolute path so it never matches an area.
    if (rel.startsWith("..") || isAbsolute(rel)) return filePath;
    return rel.replace(/^\.\//, "");
  }
  return normalize(filePath).replace(/^\.\//, "");
}

/**
 * Check whether a normalised file path falls within any shared area assigned
 * to `pilotId`. An area is treated as a path prefix — `src/api` matches
 * `src/api/foo.ts` but not `src/api-v2`.
 *
 * @deprecated Enforcement is now delegated to the daemon's POST /controls/verify
 * endpoint. This function is retained for backward compatibility only.
 */
export function isFileInPilotArea(
  normalizedPath: string,
  pilotId: string,
  controls: ControlsSnapshot,
): boolean {
  if (controls.mode !== "shared" || !controls.sharedAreas) return false;
  for (const { pilotId: owner, area } of controls.sharedAreas) {
    if (owner !== pilotId) continue;
    const prefix = area.endsWith("/") ? area : `${area}/`;
    if (normalizedPath === area || normalizedPath.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluate RULE-CTRL-3 for a specific file-modifying tool invocation.
 *
 * @deprecated Enforcement is now delegated to the daemon's POST /controls/verify
 * endpoint. This function is retained for backward compatibility only.
 */
export function decideForFileModification(
  controls: ControlsSnapshot,
  pilotId: string,
  worktreePath: string,
  filePath: string,
): EnforcementDecision {
  if (controls.mode === "exclusive") {
    if (controls.holder === pilotId) return { behavior: "allow" };
    return {
      behavior: "deny",
      message: [
        `RULE-CTRL-3 violation: exclusive controls are held by`,
        `${controls.holder ?? "(nobody)"}, not ${pilotId}.`,
        `You cannot modify files on this craft until controls are transferred`,
        `to you. Request the handoff over the intercom (atc_intercom_send), then`,
        `call atc_controls_transfer to take exclusive controls or`,
        `atc_controls_read + atc_controls_transfer to establish a shared area.`,
      ].join(" "),
    };
  }

  const normalized = normalizeFilePath(filePath, worktreePath);
  if (isFileInPilotArea(normalized, pilotId, controls)) {
    return { behavior: "allow" };
  }
  const mine = (controls.sharedAreas ?? []).filter((a) => a.pilotId === pilotId).map((a) => a.area);
  const mineDesc = mine.length > 0 ? mine.join(", ") : "(no areas assigned)";
  return {
    behavior: "deny",
    message: [
      `RULE-CTRL-3 violation: ${normalized} is outside your shared control`,
      `area. Your areas: ${mineDesc}. Either restrict your edit to an assigned`,
      `area, or update the shared areas via atc_controls_transfer (requires`,
      `captain coordination).`,
    ].join(" "),
  };
}

/**
 * Bash is a special case. We can't reliably inspect what files the shell
 * command will touch, so we use a coarse gate: if the pilot has ANY
 * controls authority on the craft, we allow; otherwise we deny.
 *
 * @deprecated Enforcement is now delegated to the daemon's POST /controls/verify
 * endpoint. This function is retained for backward compatibility only.
 */
export function decideForBash(controls: ControlsSnapshot, pilotId: string): EnforcementDecision {
  const exclusiveHolder = controls.mode === "exclusive" && controls.holder === pilotId;
  const hasSharedArea =
    controls.mode === "shared" && (controls.sharedAreas ?? []).some((a) => a.pilotId === pilotId);
  if (exclusiveHolder || hasSharedArea) return { behavior: "allow" };
  return {
    behavior: "deny",
    message: [
      `RULE-CTRL-3 violation: you do not currently hold any controls on this`,
      `craft, so you cannot run shell commands that might modify code.`,
      `Read-only inspection is still permitted via Read / Glob / Grep.`,
    ].join(" "),
  };
}

/**
 * Call the daemon's RULE-CTRL-3 verification endpoint.
 *
 * Returns `{ behavior: "allow" }` when the daemon permits the action, or
 * `{ behavior: "deny", message }` otherwise. Network errors propagate so the
 * caller can decide whether to fail open or closed.
 */
async function callVerifyEndpoint(
  ctx: ControlsEnforcerContext,
  body: { pilotId: string; filePath?: string },
): Promise<EnforcementDecision> {
  const url = `${ctx.daemonUrl}/api/v1/projects/${ctx.projectName}/crafts/${ctx.callsign}/controls/verify`;
  const fetchFn = ctx.fetch ?? globalThis.fetch;
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) {
    return { behavior: "allow" };
  }
  const json = (await response.json()) as { allowed: boolean; message?: string };
  return {
    behavior: "deny",
    message: json.message ?? `RULE-CTRL-3: access denied by daemon (HTTP ${response.status})`,
  };
}

/**
 * Build a `canUseTool` callback suitable for
 * `Options.canUseTool` in the Claude Agent SDK.
 *
 * The returned function is async because it delegates to the daemon's
 * `POST /controls/verify` endpoint on every file-modifying call — so
 * controls transfers take effect immediately without restarting the agent,
 * and enforcement is authoritative regardless of which adapter framework
 * is in use.
 *
 * @see RULE-CTRL-3
 */
export function createControlsCanUseTool(
  ctx: ControlsEnforcerContext,
): (toolName: string, input: Record<string, unknown>) => Promise<EnforcementDecision> {
  const allow = (input: Record<string, unknown>): EnforcementDecision => ({
    behavior: "allow",
    updatedInput: input,
  });

  return async (toolName, input) => {
    // Read-only and MCP tools are always allowed — RULE-CTRL-3 restricts
    // modification, not observation, and our intercom tool has its own
    // identity wired in. Tool names with `mcp__` prefix come from the SDK
    // MCP bridge (e.g. `mcp__atc-intercom__intercom_send`).
    if (toolName.startsWith("mcp__")) return allow(input);

    if (FILE_MODIFYING_TOOLS.has(toolName)) {
      const filePath =
        typeof input.file_path === "string"
          ? input.file_path
          : typeof input.notebook_path === "string"
            ? input.notebook_path
            : undefined;
      if (filePath === undefined) {
        return {
          behavior: "deny",
          message: `Cannot evaluate controls for ${toolName}: no file_path/notebook_path in input.`,
        };
      }
      const decision = await callVerifyEndpoint(ctx, { pilotId: ctx.pilotId, filePath });
      return decision.behavior === "allow" ? allow(input) : decision;
    }

    if (toolName === "Bash" || toolName === "BashOutput") {
      const decision = await callVerifyEndpoint(ctx, { pilotId: ctx.pilotId });
      return decision.behavior === "allow" ? allow(input) : decision;
    }

    // All other built-in tools (Read, Glob, Grep, LS, Task, TodoWrite, …)
    // are observational or orchestration-only — always allowed.
    return allow(input);
  };
}
