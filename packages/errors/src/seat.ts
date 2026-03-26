import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-SEAT-* invariant is violated.
 * Covers seat assignment constraints: certification requirements,
 * captain cardinality, jumpseat restrictions.
 *
 * @see RULE-SEAT-1 through RULE-SEAT-4
 */
export class SeatAssignmentError extends AtcError {
  override readonly name: string = "SeatAssignmentError";
}
