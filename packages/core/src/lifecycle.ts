import type { Craft } from "@airtrafficcontrol/types";
import {
  CraftStatus,
  SeatType,
  VectorStatus,
  BlackBoxEntryType,
  LifecycleEvent,
} from "@airtrafficcontrol/types";
import { TRANSITIONS, TERMINAL_STATES } from "@airtrafficcontrol/types";
import { LifecycleError } from "@airtrafficcontrol/errors";

/**
 * Optional context for a lifecycle transition.
 *
 * Required for transitions that have authorization or external-state
 * preconditions. Different transitions require different fields:
 *
 * - GoAround → Emergency: `pilotId` + `seatType` (RULE-EMER-1)
 * - LandingChecklist → ClearedToLand: `checklistPassed` + `clearanceGranted` (RULE-LIFE-5)
 * - ClearedToLand → Landed: `branchUpToDate` + `mergeExecuted` (RULE-LIFE-6)
 */
export interface TransitionContext {
  /** Identifier of the pilot requesting the transition. */
  readonly pilotId?: string;
  /** Seat type the pilot occupies on this craft. */
  readonly seatType?: SeatType;
  /** Whether all required checklist items passed. @see RULE-LIFE-5 */
  readonly checklistPassed?: boolean;
  /** Whether the tower has granted landing clearance. @see RULE-LIFE-5 */
  readonly clearanceGranted?: boolean;
  /** Whether the branch is up to date with main. @see RULE-LIFE-6 */
  readonly branchUpToDate?: boolean;
  /** Whether the merge has been executed. @see RULE-LIFE-6 */
  readonly mergeExecuted?: boolean;
}

/**
 * Checks whether a state transition is valid in the craft lifecycle.
 *
 * Only transitions explicitly listed in the TRANSITIONS table are legal.
 *
 * @param from - The current craft status.
 * @param to - The target craft status.
 * @returns Whether the transition is listed in TRANSITIONS.
 * @see RULE-LIFE-2
 */
export function canTransition(from: CraftStatus, to: CraftStatus): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/**
 * Checks whether a craft status is a terminal state.
 *
 * Terminal states (Landed, ReturnToOrigin) do not permit any outgoing transitions.
 *
 * @param status - The craft status to check.
 * @returns Whether the status is terminal.
 * @see RULE-LIFE-8
 */
export function isTerminalState(status: CraftStatus): boolean {
  return TERMINAL_STATES.has(status);
}

/**
 * Transitions a craft to a new lifecycle state.
 *
 * Validates that the transition is legal according to the TRANSITIONS table
 * and checks preconditions specific to the from/to pair. Returns a new craft
 * with the updated status -- never mutates the input.
 *
 * @param craft - The craft to transition.
 * @param to - The target lifecycle state.
 * @param context - Optional transition context with pilot identity. Required for
 *   transitions that have authorization preconditions (e.g., GoAround → Emergency).
 * @returns A new Craft with the updated status.
 * @throws {LifecycleError} If the transition is invalid or preconditions are not met.
 * @see RULE-LIFE-2 through RULE-LIFE-8, RULE-EMER-1
 */
export function transitionCraft(craft: Craft, to: CraftStatus, context?: TransitionContext): Craft {
  const from = craft.status;

  if (isTerminalState(from)) {
    throw new LifecycleError(
      `Cannot transition from terminal state "${from}" [RULE-LIFE-8]`,
      "RULE-LIFE-8",
    );
  }

  if (!canTransition(from, to)) {
    throw new LifecycleError(
      `Invalid transition: "${from}" → "${to}" [RULE-LIFE-2]`,
      "RULE-LIFE-2",
    );
  }

  // Check preconditions for specific transitions
  checkPreconditions(craft, to, context);

  const updated: Craft = { ...craft, status: to };
  if (to === CraftStatus.Landed) {
    return { ...updated, landedAt: new Date() };
  }
  return updated;
}

/**
 * Maps a state transition to its before/after lifecycle events.
 *
 * Returns undefined for transitions that don't have associated events
 * (e.g., LandingChecklist -> ClearedToLand is the *result* of before:landing-check).
 *
 * @param from - Current craft status.
 * @param to - Target craft status.
 * @returns Before and after event pair, or undefined.
 * @see RULE-CHKL-8
 */
export function mapTransitionToEvents(
  from: CraftStatus,
  to: CraftStatus,
): { before: LifecycleEvent; after: LifecycleEvent } | undefined {
  if (from === CraftStatus.Taxiing && to === CraftStatus.InFlight) {
    return { before: LifecycleEvent.BeforeTakeoff, after: LifecycleEvent.AfterTakeoff };
  }
  if (from === CraftStatus.InFlight && to === CraftStatus.LandingChecklist) {
    return { before: LifecycleEvent.BeforeLandingCheck, after: LifecycleEvent.AfterLandingCheck };
  }
  if (from === CraftStatus.GoAround && to === CraftStatus.LandingChecklist) {
    return { before: LifecycleEvent.BeforeGoAround, after: LifecycleEvent.AfterGoAround };
  }
  if (from === CraftStatus.GoAround && to === CraftStatus.Emergency) {
    return { before: LifecycleEvent.BeforeEmergency, after: LifecycleEvent.AfterEmergency };
  }
  if (from === CraftStatus.ClearedToLand && to === CraftStatus.Landed) {
    return { before: LifecycleEvent.BeforeLanding, after: LifecycleEvent.AfterLanding };
  }
  return undefined;
}

/**
 * Validates preconditions for specific state transitions.
 *
 * @param craft - The craft being transitioned.
 * @param to - The target state.
 * @param context - Optional pilot context for authorization checks.
 * @throws {LifecycleError} If preconditions are not met.
 */
function checkPreconditions(craft: Craft, to: CraftStatus, context?: TransitionContext): void {
  const from = craft.status;

  // RULE-LIFE-3: Taxiing -> InFlight requires captain, cargo, and flight plan
  if (from === CraftStatus.Taxiing && to === CraftStatus.InFlight) {
    if (!craft.captain?.identifier) {
      throw new LifecycleError(
        "Taxiing → InFlight requires a captain to be assigned [RULE-LIFE-3]",
        "RULE-LIFE-3",
      );
    }
    if (!craft.cargo) {
      throw new LifecycleError(
        "Taxiing → InFlight requires cargo to be assigned [RULE-LIFE-3]",
        "RULE-LIFE-3",
      );
    }
    if (craft.flightPlan.length === 0) {
      throw new LifecycleError(
        "Taxiing → InFlight requires a flight plan with at least one vector [RULE-LIFE-3]",
        "RULE-LIFE-3",
      );
    }
  }

  // RULE-LIFE-4: InFlight -> LandingChecklist requires all vectors passed
  if (from === CraftStatus.InFlight && to === CraftStatus.LandingChecklist) {
    const allPassed = craft.flightPlan.every((v) => v.status === VectorStatus.Passed);
    if (!allPassed) {
      throw new LifecycleError(
        "All vectors must be passed before entering LandingChecklist [RULE-LIFE-4]",
        "RULE-LIFE-4",
      );
    }
  }

  // RULE-LIFE-5: LandingChecklist -> ClearedToLand requires checklist pass + tower clearance
  if (from === CraftStatus.LandingChecklist && to === CraftStatus.ClearedToLand) {
    if (!context) {
      throw new LifecycleError(
        "LandingChecklist → ClearedToLand requires a TransitionContext [RULE-LIFE-5]",
        "RULE-LIFE-5",
      );
    }
    if (!context.checklistPassed) {
      throw new LifecycleError(
        "All required checklist items must pass before requesting clearance [RULE-LIFE-5]",
        "RULE-LIFE-5",
      );
    }
    if (!context.clearanceGranted) {
      throw new LifecycleError(
        "Tower must grant landing clearance before transitioning to ClearedToLand [RULE-LIFE-5]",
        "RULE-LIFE-5",
      );
    }
  }

  // RULE-LIFE-6: ClearedToLand -> Landed requires branch up to date + merge executed
  if (from === CraftStatus.ClearedToLand && to === CraftStatus.Landed) {
    if (!context) {
      throw new LifecycleError(
        "ClearedToLand → Landed requires a TransitionContext [RULE-LIFE-6]",
        "RULE-LIFE-6",
      );
    }
    if (!context.branchUpToDate) {
      throw new LifecycleError(
        "Branch must be up to date with main before landing [RULE-LIFE-6]",
        "RULE-LIFE-6",
      );
    }
    if (!context.mergeExecuted) {
      throw new LifecycleError(
        "Merge must be executed before marking as landed [RULE-LIFE-6]",
        "RULE-LIFE-6",
      );
    }
  }

  // RULE-EMER-1: GoAround -> Emergency requires the captain
  if (from === CraftStatus.GoAround && to === CraftStatus.Emergency) {
    if (!context?.seatType) {
      throw new LifecycleError(
        "Transition to Emergency requires a TransitionContext with pilot identity [RULE-EMER-1]",
        "RULE-EMER-1",
      );
    }
    if (context.seatType !== SeatType.Captain) {
      throw new LifecycleError(
        `Only the captain may declare an emergency, got seat type "${context.seatType}" [RULE-EMER-1]`,
        "RULE-EMER-1",
      );
    }
  }

  // RULE-LIFE-7: Emergency -> ReturnToOrigin requires EmergencyDeclaration in black box
  if (from === CraftStatus.Emergency && to === CraftStatus.ReturnToOrigin) {
    const hasDeclaration = craft.blackBox.some(
      (entry) => entry.type === BlackBoxEntryType.EmergencyDeclaration,
    );
    if (!hasDeclaration) {
      throw new LifecycleError(
        "Emergency -> ReturnToOrigin requires an EmergencyDeclaration in the black box [RULE-LIFE-7]",
        "RULE-LIFE-7",
      );
    }
  }
}
