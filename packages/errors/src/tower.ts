import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-TOWER-* or RULE-TMRG-* invariant is violated.
 * Covers tower merge coordination: vector report verification,
 * branch freshness, merge sequencing.
 *
 * @see RULE-TOWER-1 through RULE-TOWER-3
 * @see RULE-TMRG-1 through RULE-TMRG-4
 */
export class TowerError extends AtcError {
  override readonly name: string = "TowerError";
}
