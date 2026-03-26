import type { Pilot } from "@atc/types";
import { SeatType } from "@atc/types";
import { SeatAssignmentError } from "@atc/errors";
import { isPilotCertified } from "./certification.js";

/**
 * Checks whether a pilot can validly occupy the given seat on a craft of the
 * specified category. Returns `true` if:
 * - The seat is Jumpseat (no certification required), OR
 * - The pilot holds a certification for the craft's category.
 *
 * @param pilot - The pilot to validate.
 * @param seat - The seat being assigned.
 * @param craftCategory - The craft's category.
 * @returns Whether the assignment is valid.
 * @see RULE-SEAT-2, RULE-SEAT-3
 */
export function isValidSeatAssignment(
  pilot: Pilot,
  seat: SeatType,
  craftCategory: string,
): boolean {
  if (seat === SeatType.Jumpseat) {
    return true;
  }
  return isPilotCertified(pilot, craftCategory);
}

/**
 * Validates that a pilot can occupy the given seat on a craft of the specified
 * category. Throws a {@link SeatAssignmentError} if the pilot lacks the
 * required certification for a non-jumpseat position.
 *
 * @param pilot - The pilot to validate.
 * @param seat - The seat being assigned.
 * @param craftCategory - The craft's category.
 * @throws {SeatAssignmentError} If the pilot is not certified for the seat.
 * @see RULE-SEAT-2, RULE-SEAT-3
 */
export function validateSeatAssignment(
  pilot: Pilot,
  seat: SeatType,
  craftCategory: string,
): void {
  if (!isValidSeatAssignment(pilot, seat, craftCategory)) {
    throw new SeatAssignmentError(
      `Pilot "${pilot.identifier}" is not certified for category "${craftCategory}" ` +
        `and cannot occupy the ${seat} seat.`,
      "RULE-SEAT-2",
    );
  }
}

/**
 * Validates the crew composition of a craft. Ensures:
 * - The captain is certified for the craft's category (RULE-CRAFT-5, RULE-SEAT-2).
 * - All first officers are certified for the craft's category (RULE-SEAT-2).
 *
 * Note: RULE-SEAT-1 (exactly one captain) is enforced structurally — the function
 * accepts a single `captain` parameter, not a list.
 *
 * @param captain - The captain assigned to the craft.
 * @param firstOfficers - The first officers assigned to the craft.
 * @param craftCategory - The craft's category.
 * @throws {SeatAssignmentError} If the captain or any first officer is not certified.
 * @see RULE-CRAFT-5, RULE-SEAT-1, RULE-SEAT-2
 */
export function validateCraftCrew(
  captain: Pilot,
  firstOfficers: readonly Pilot[],
  craftCategory: string,
): void {
  validateSeatAssignment(captain, SeatType.Captain, craftCategory);

  for (const fo of firstOfficers) {
    validateSeatAssignment(fo, SeatType.FirstOfficer, craftCategory);
  }
}
