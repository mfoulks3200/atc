import type { Vector } from "@airtrafficcontrol/types";
import { SeatType, VectorType } from "@airtrafficcontrol/types";
import { VectorError } from "@airtrafficcontrol/errors";

/**
 * Returns true when the vector is of type `adversarial_review`.
 * A missing `type` field is treated as Standard (returns false).
 *
 * @param vector - The vector to inspect.
 * @returns Whether the vector is an adversarial review checkpoint.
 * @see RULE-VEC-6
 */
export function isAdversarialReviewVector(vector: Vector): boolean {
  return vector.type === VectorType.AdversarialReview;
}

/**
 * Validates that the reviewer filing an adversarial_review vector report is
 * not the same pilot who filed the preceding vector report (the builder).
 *
 * @param reviewerId - Identifier of the pilot filing the adversarial_review report.
 * @param builderId - Identifier of the pilot who filed the preceding vector report.
 * @throws {VectorError} If reviewer and builder are the same pilot.
 * @see RULE-VEC-7, RULE-VEC-8
 */
export function validateAdversarialReviewerIdentity(
  reviewerId: string,
  builderId: string,
): void {
  if (reviewerId === builderId) {
    throw new VectorError(
      `Pilot "${reviewerId}" cannot review their own work on an adversarial_review vector [RULE-VEC-8]`,
      "RULE-VEC-8",
    );
  }
}

/**
 * Validates that the reviewer filing an adversarial_review vector report
 * holds a Captain or FirstOfficer seat. Jumpseaters are not permitted to
 * act as reviewers.
 *
 * @param reviewerSeat - The seat type of the reviewing pilot.
 * @throws {VectorError} If the reviewer holds a Jumpseat.
 * @see RULE-VEC-9
 */
export function validateAdversarialReviewerSeat(reviewerSeat: SeatType): void {
  if (reviewerSeat === SeatType.Jumpseat) {
    throw new VectorError(
      "Jumpseat pilots cannot act as reviewer on an adversarial_review vector [RULE-VEC-9]",
      "RULE-VEC-9",
    );
  }
}
