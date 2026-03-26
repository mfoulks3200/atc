import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-BBOX-* invariant is violated.
 * Covers append-only log constraints: mutating existing entries,
 * missing black box on lifecycle events.
 *
 * @see RULE-BBOX-1 through RULE-BBOX-4
 */
export class BlackBoxError extends AtcError {
  override readonly name: string = "BlackBoxError";
}
