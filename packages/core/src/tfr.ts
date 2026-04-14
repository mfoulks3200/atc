import type { TemporaryFlightRestriction, TfrIssuer, Craft } from "@airtrafficcontrol/types";
import { TfrScope, TfrMode } from "@airtrafficcontrol/types";
import { TfrError } from "@airtrafficcontrol/errors";

/**
 * Parameters for creating a new Temporary Flight Restriction.
 * @see RULE-TFR-1
 */
export interface CreateTfrParams {
  /** Unique identifier for the TFR. */
  identifier: string;
  /** Scope of the restriction. */
  scope: TfrScope;
  /** Target project (scope=Project) or callsign (scope=Craft). Null for Global. */
  target: string | null;
  /** Enforcement mode. */
  mode: TfrMode;
  /** Reason for issuing the TFR. */
  reason: string;
  /** Who is issuing the TFR. */
  issuedBy: TfrIssuer;
}

/**
 * Creates a new Temporary Flight Restriction with validation.
 *
 * @param params - TFR creation parameters.
 * @returns A new {@link TemporaryFlightRestriction} with `liftedAt: null`.
 * @throws {TfrError} If scope/target combination is invalid (RULE-TFR-2).
 * @throws {TfrError} If tower attempts a global TFR (RULE-TFR-4).
 * @see RULE-TFR-1, RULE-TFR-2, RULE-TFR-3, RULE-TFR-4
 */
export function createTfr(params: CreateTfrParams): TemporaryFlightRestriction {
  // RULE-TFR-4: Tower must not issue global TFRs
  if (params.issuedBy === "tower" && params.scope === TfrScope.Global) {
    throw new TfrError("Tower must not issue global TFRs", "RULE-TFR-4");
  }

  // RULE-TFR-2: Validate scope/target combinations
  if (params.scope === TfrScope.Global && params.target !== null) {
    throw new TfrError("Global TFR must have a null target", "RULE-TFR-2");
  }
  if (params.scope === TfrScope.Project && !params.target) {
    throw new TfrError("Project-scoped TFR must specify a project target", "RULE-TFR-2");
  }
  if (params.scope === TfrScope.Craft && !params.target) {
    throw new TfrError("Craft-scoped TFR must specify a craft callsign", "RULE-TFR-2");
  }

  return {
    identifier: params.identifier,
    scope: params.scope,
    target: params.target,
    mode: params.mode,
    reason: params.reason,
    issuedBy: params.issuedBy,
    issuedAt: new Date(),
    liftedAt: null,
  };
}

/**
 * Lifts an active TFR by setting its `liftedAt` timestamp.
 *
 * @param tfr - The TFR to lift.
 * @returns A new TFR with `liftedAt` set to the current time.
 * @throws {TfrError} If the TFR is already lifted.
 * @see RULE-TFRP-3
 */
export function liftTfr(tfr: TemporaryFlightRestriction): TemporaryFlightRestriction {
  if (tfr.liftedAt !== null) {
    throw new TfrError(`TFR "${tfr.identifier}" is already lifted`, "RULE-TFRP-3");
  }

  return {
    ...tfr,
    liftedAt: new Date(),
  };
}

/**
 * Determines whether an active TFR affects a specific craft.
 *
 * @param tfr - The TFR to check.
 * @param projectName - The project the craft belongs to.
 * @param callsign - The craft's callsign.
 * @returns `true` if the TFR is active and applies to this craft.
 * @see RULE-TFR-7
 */
export function isAffectedByTfr(
  tfr: TemporaryFlightRestriction,
  projectName: string,
  callsign: string,
): boolean {
  if (tfr.liftedAt !== null) {
    return false;
  }

  switch (tfr.scope) {
    case TfrScope.Global:
      return true;
    case TfrScope.Project:
      return tfr.target === projectName;
    case TfrScope.Craft:
      return tfr.target === callsign;
  }
}

/**
 * Filters a list of TFRs to return only those that are still active (not lifted).
 *
 * @param tfrs - Array of TFRs to filter.
 * @returns Only the TFRs where `liftedAt` is null.
 */
export function getActiveTfrs(
  tfrs: readonly TemporaryFlightRestriction[],
): TemporaryFlightRestriction[] {
  return tfrs.filter((tfr) => tfr.liftedAt === null);
}

/**
 * Sets the `holdingPattern` flag to `true` on a craft without altering lifecycle state.
 *
 * @param craft - The craft to put into a holding pattern.
 * @returns A new craft with `holdingPattern: true`.
 * @see RULE-TFR-5
 */
export function applyHoldingPattern(craft: Craft): Craft {
  return { ...craft, holdingPattern: true };
}

/**
 * Clears the `holdingPattern` flag on a craft.
 *
 * @param craft - The craft to release from the holding pattern.
 * @returns A new craft with `holdingPattern: false`.
 * @see RULE-TFR-8
 */
export function clearHoldingPattern(craft: Craft): Craft {
  return { ...craft, holdingPattern: false };
}
