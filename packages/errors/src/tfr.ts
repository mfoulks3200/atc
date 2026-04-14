import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-TFR-* or RULE-TFRP-* invariant is violated.
 * Covers TFR issuance constraints, scope validation, and authorization failures.
 *
 * @see RULE-TFR-1 through RULE-TFR-8
 * @see RULE-TFRP-1 through RULE-TFRP-7
 */
export class TfrError extends AtcError {
  override readonly name: string = "TfrError";
}
