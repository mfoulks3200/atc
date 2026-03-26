import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-CTRL-* invariant is violated.
 * Covers control handoff and modification constraints: jumpseat exclusion,
 * modification without controls, control transfer protocol violations.
 *
 * @see RULE-CTRL-1 through RULE-CTRL-7
 */
export class ControlsError extends AtcError {
  override readonly name: string = "ControlsError";
}
