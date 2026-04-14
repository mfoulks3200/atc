/**
 * Scope levels for a Temporary Flight Restriction.
 * @see RULE-TFR-1, RULE-TFR-2
 */
export enum TfrScope {
  /** Affects all agents across all projects. */
  Global = "Global",
  /** Affects all agents within a single project. */
  Project = "Project",
  /** Affects a single craft. */
  Craft = "Craft",
}

/**
 * Enforcement mode for a Temporary Flight Restriction.
 * @see RULE-TFRP-1, RULE-TFRP-2
 */
export enum TfrMode {
  /** Agents receive a wind-down window before the hold takes effect. */
  Graceful = "Graceful",
  /** Hold takes effect immediately with no wind-down. */
  Immediate = "Immediate",
}

/**
 * Issuer identity for a TFR.
 * @see RULE-TFR-3, RULE-TFR-4
 */
export type TfrIssuer = "user" | "tower";

/**
 * A Temporary Flight Restriction pauses agent activity without altering
 * craft lifecycle state. It sets a `holdingPattern` flag on affected crafts.
 *
 * @see RULE-TFR-1 through RULE-TFR-8
 * @see RULE-TFRP-1 through RULE-TFRP-7
 */
export interface TemporaryFlightRestriction {
  /** Unique, immutable identifier. @see RULE-TFR-1 */
  readonly identifier: string;
  /** What this TFR affects. @see RULE-TFR-2 */
  readonly scope: TfrScope;
  /** Project ID (scope=Project) or callsign (scope=Craft). Null for Global. @see RULE-TFR-2 */
  readonly target: string | null;
  /** How the hold is enforced. @see RULE-TFRP-1, RULE-TFRP-2 */
  readonly mode: TfrMode;
  /** Why the TFR was issued. @see RULE-TFR-1 */
  readonly reason: string;
  /** Who issued the TFR. @see RULE-TFR-3, RULE-TFR-4 */
  readonly issuedBy: TfrIssuer;
  /** When the TFR was issued. */
  readonly issuedAt: Date;
  /** When the TFR was lifted. Null while active. @see RULE-TFRP-3 */
  readonly liftedAt: Date | null;
}
