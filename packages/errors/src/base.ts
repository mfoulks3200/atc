/**
 * Base error class for all ATC rule violations.
 * Every domain error extends this class and carries the RULE-* identifier
 * of the violated rule.
 *
 * @see docs/specification.md — Appendix A: Rule Index
 */
export class AtcError extends Error {
  /** The RULE-* identifier of the violated rule. */
  readonly ruleId: string;

  override readonly name: string = "AtcError";

  /**
   * @param message - Human-readable description of what went wrong.
   * @param ruleId - The RULE-* identifier that was violated.
   */
  constructor(message: string, ruleId: string) {
    super(message);
    this.ruleId = ruleId;
  }
}
