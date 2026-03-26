import { AtcError } from "./base.js";

/**
 * Optional context for lifecycle transition errors.
 */
export interface LifecycleErrorContext {
  /** The state the craft was transitioning from. */
  readonly from?: string;
  /** The state the craft was transitioning to. */
  readonly to?: string;
}

/**
 * Error thrown when a RULE-LIFE-* invariant is violated.
 * Covers lifecycle transition constraints: invalid transitions,
 * transitions from terminal states, missing preconditions.
 *
 * @see RULE-LIFE-1 through RULE-LIFE-8
 */
export class LifecycleError extends AtcError {
  override readonly name: string = "LifecycleError";

  /** The state the craft was transitioning from, if applicable. */
  readonly from?: string;

  /** The state the craft was transitioning to, if applicable. */
  readonly to?: string;

  /**
   * @param message - Human-readable description of what went wrong.
   * @param ruleId - The RULE-LIFE-* identifier that was violated.
   * @param context - Optional from/to state context for transition errors.
   */
  constructor(message: string, ruleId: string, context?: LifecycleErrorContext) {
    super(message, ruleId);
    this.from = context?.from;
    this.to = context?.to;
  }
}
