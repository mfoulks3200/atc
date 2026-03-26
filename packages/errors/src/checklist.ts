import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-LCHK-* invariant is violated.
 * Covers landing checklist constraints: execution authority,
 * item failures, go-around triggers.
 *
 * @see RULE-LCHK-1 through RULE-LCHK-4
 */
export class ChecklistError extends AtcError {
  override readonly name: string = "ChecklistError";
}
