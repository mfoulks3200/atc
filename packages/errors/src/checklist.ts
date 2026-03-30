import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-CHKL-* invariant is violated.
 * Covers checklist constraints: template validation,
 * binding resolution, item execution, and transition gating.
 *
 * @see RULE-CHKL-1 through RULE-CHKL-8
 */
export class ChecklistError extends AtcError {
  override readonly name: string = "ChecklistError";
}
