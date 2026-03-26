import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-VEC-* or RULE-VRPT-* invariant is violated.
 * Covers vector sequencing, reporting, and flight plan constraints.
 *
 * @see RULE-VEC-1 through RULE-VEC-5
 * @see RULE-VRPT-1 through RULE-VRPT-4
 */
export class VectorError extends AtcError {
  override readonly name: string = "VectorError";
}
