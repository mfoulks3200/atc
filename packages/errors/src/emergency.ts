import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-EMER-* invariant is violated.
 * Covers emergency declaration constraints: captain-only authority,
 * required black box entry, return-to-origin protocol.
 *
 * @see RULE-EMER-1 through RULE-EMER-4
 */
export class EmergencyError extends AtcError {
  override readonly name: string = "EmergencyError";
}
