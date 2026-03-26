import type { PilotAction } from "@atc/types";
import { SeatType, PERMISSIONS } from "@atc/types";

/**
 * Checks whether a pilot in the given seat is allowed to hold controls.
 * Only Captain and FirstOfficer may hold controls; Jumpseat pilots may not.
 *
 * This is a convenience wrapper over the PERMISSIONS matrix for the
 * `holdControls` action.
 *
 * @param seat - The seat type to check.
 * @returns `true` if the seat permits holding controls.
 * @see RULE-CTRL-2
 */
export function canHoldControls(seat: SeatType): boolean {
  return PERMISSIONS[seat].holdControls;
}

/**
 * Looks up whether a pilot in the given seat is permitted to perform
 * the specified action, according to the PERMISSIONS matrix.
 *
 * @param seat - The seat type to check.
 * @param action - The action to look up.
 * @returns `true` if the seat permits the action.
 * @see RULE-SEAT-1 through RULE-SEAT-4, RULE-CTRL-2, RULE-BBOX-3, RULE-EMER-1
 */
export function canPerformAction(
  seat: SeatType,
  action: PilotAction,
): boolean {
  return PERMISSIONS[seat][action];
}
