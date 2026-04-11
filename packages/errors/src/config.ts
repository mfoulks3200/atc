import { AtcError } from "./base.js";

/**
 * The scope a configuration error applies to. Matches the tiers in the
 * layered config system: the top-level global config, a profile, a project,
 * or an agent.
 */
export type ConfigScope = "global" | "profile" | "project" | "agent";

/**
 * Minimal shape of a Zod issue used by ConfigValidationError. Declared
 * locally to avoid a runtime dependency on zod from the @atc/errors package.
 */
export interface ConfigIssue {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/**
 * Error thrown when a config payload fails schema validation.
 *
 * Carries the scope the bad payload applies to and the list of Zod issues
 * so transport layers (REST, WebSocket) can serialize them verbatim to
 * clients.
 *
 * @see RULE-CFG-1 (placeholder — rule family not yet in the spec)
 */
export class ConfigValidationError extends AtcError {
  override readonly name: string = "ConfigValidationError";
  readonly scope: ConfigScope;
  readonly issues: readonly ConfigIssue[];

  /**
   * @param scope - Which configuration tier failed validation.
   * @param issues - Zod-compatible issue list describing the failures.
   * @param message - Optional human-readable override; a default is built
   *   from the first issue if omitted.
   */
  constructor(scope: ConfigScope, issues: readonly ConfigIssue[], message?: string) {
    const resolved =
      message ??
      (issues.length > 0
        ? `Invalid ${scope} config: ${issues[0]!.path.join(".")}: ${issues[0]!.message}`
        : `Invalid ${scope} config`);
    super(resolved, "RULE-CFG-1");
    this.scope = scope;
    this.issues = issues;
  }
}

/**
 * Error thrown when a DELETE-by-key or unset() call names a key that is
 * not part of the scope's declared schema.
 *
 * @see RULE-CFG-1 (placeholder — rule family not yet in the spec)
 */
export class UnknownConfigKeyError extends AtcError {
  override readonly name: string = "UnknownConfigKeyError";
  readonly scope: ConfigScope;
  readonly key: string;

  constructor(scope: ConfigScope, key: string) {
    super(`Unknown ${scope} config key: ${key}`, "RULE-CFG-1");
    this.scope = scope;
    this.key = key;
  }
}
