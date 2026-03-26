import type { ControlState, SharedControlArea } from "@atc/types";
import { ControlMode, SeatType } from "@atc/types";
import { ControlsError } from "@atc/errors";

/**
 * Creates the initial control state for a newly created craft.
 *
 * At craft creation, the captain holds exclusive controls by default.
 *
 * @param captainId - The identifier of the captain pilot.
 * @returns A ControlState in Exclusive mode with the captain as holder.
 * @see RULE-CTRL-1
 */
export function createInitialControls(captainId: string): ControlState {
  return {
    mode: ControlMode.Exclusive,
    holder: captainId,
  };
}

/**
 * Claims exclusive controls for a pilot, replacing the current control state.
 *
 * Only captain or first officer seats may claim controls. Jumpseaters are
 * never permitted to hold controls per RULE-CTRL-2.
 *
 * @param current - The current control state.
 * @param pilotId - The identifier of the pilot claiming controls.
 * @param seat - The seat type the pilot occupies on this craft.
 * @returns A new ControlState in Exclusive mode with the given pilot as holder.
 * @throws {ControlsError} If the pilot occupies a Jumpseat (RULE-CTRL-2).
 * @see RULE-CTRL-2
 */
export function claimExclusiveControls(
  current: ControlState,
  pilotId: string,
  seat: SeatType,
): ControlState {
  if (seat === SeatType.Jumpseat) {
    throw new ControlsError("Jumpseat pilots cannot hold controls [RULE-CTRL-2]", "RULE-CTRL-2");
  }

  return {
    mode: ControlMode.Exclusive,
    holder: pilotId,
  };
}

/**
 * Creates a shared control state with non-overlapping areas of responsibility.
 *
 * Validates that areas are non-empty and no pilot appears more than once.
 *
 * @param areas - The shared control area assignments. Must be non-empty with unique pilots.
 * @returns A new ControlState in Shared mode with the given areas.
 * @throws {ControlsError} If areas is empty or contains duplicate pilot identifiers.
 * @see RULE-CTRL-5
 */
export function shareControls(areas: SharedControlArea[]): ControlState {
  if (areas.length === 0) {
    throw new ControlsError(
      "Shared controls require at least one area [RULE-CTRL-5]",
      "RULE-CTRL-5",
    );
  }

  const pilotIds = new Set<string>();
  for (const area of areas) {
    if (pilotIds.has(area.pilotIdentifier)) {
      throw new ControlsError(
        `Duplicate pilot in shared areas: ${area.pilotIdentifier} [RULE-CTRL-5]`,
        "RULE-CTRL-5",
      );
    }
    pilotIds.add(area.pilotIdentifier);
  }

  return {
    mode: ControlMode.Shared,
    sharedAreas: [...areas],
  };
}

/**
 * Checks whether a pilot currently holds controls on a craft.
 *
 * In Exclusive mode, returns true only for the single holder.
 * In Shared mode, returns true if the pilot has an assigned area.
 *
 * @param controls - The current control state.
 * @param pilotId - The identifier of the pilot to check.
 * @returns Whether the pilot is currently holding controls.
 * @see RULE-CTRL-3
 */
export function isHoldingControls(controls: ControlState, pilotId: string): boolean {
  if (controls.mode === ControlMode.Exclusive) {
    return controls.holder === pilotId;
  }

  return controls.sharedAreas?.some((area) => area.pilotIdentifier === pilotId) ?? false;
}
