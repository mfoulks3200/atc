import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-CRAFT-* invariant is violated.
 * Covers craft creation and property constraints: unique callsign,
 * required cargo, required category, required captain.
 *
 * @see RULE-CRAFT-1 through RULE-CRAFT-5
 */
export class CraftError extends AtcError {
  override readonly name: string = "CraftError";
}
