import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-VEC-* or RULE-VRPT-* invariant is violated.
 * Covers vector sequencing, reporting, flight plan constraints, and
 * adversarial_review reviewer identity/seat checks.
 *
 * @see RULE-VEC-1 through RULE-VEC-9
 * @see RULE-VRPT-1 through RULE-VRPT-4
 */
export class VectorError extends AtcError {
  override readonly name: string = "VectorError";
}
