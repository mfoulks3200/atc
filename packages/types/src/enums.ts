/**
 * All possible lifecycle states for a craft.
 * @see RULE-LIFE-1 through RULE-LIFE-8
 */
export enum CraftStatus {
  /** Craft initialized — branch created, pilots assigned, cargo and flight plan defined. */
  Taxiing = "Taxiing",
  /** Pilots actively implementing, navigating vectors in order. */
  InFlight = "InFlight",
  /** All vectors passed. Pilot runs validation checks. */
  LandingChecklist = "LandingChecklist",
  /** Landing checklist failed. Pilot addresses failures before re-attempt. */
  GoAround = "GoAround",
  /** Checklist passed, tower granted clearance. Craft is in merge queue. */
  ClearedToLand = "ClearedToLand",
  /** Branch merged into main. Terminal state. */
  Landed = "Landed",
  /** Pilot declared an emergency after repeated failures. */
  Emergency = "Emergency",
  /** Craft sent back to design stage for re-evaluation. Terminal state. */
  ReturnToOrigin = "ReturnToOrigin",
}

/**
 * Seat types available on a craft.
 * @see RULE-SEAT-1 through RULE-SEAT-4
 */
export enum SeatType {
  /** Pilot-in-command. Exactly one per craft. */
  Captain = "Captain",
  /** Certified assistant pilot. Zero or more per craft. */
  FirstOfficer = "FirstOfficer",
  /** Observer/advisor. No code modification rights. Zero or more per craft. */
  Jumpseat = "Jumpseat",
}

/**
 * Control modes governing concurrent code modification.
 * @see RULE-CTRL-1 through RULE-CTRL-7
 */
export enum ControlMode {
  /** A single pilot holds the controls. */
  Exclusive = "Exclusive",
  /** Two or more pilots hold controls with non-overlapping areas. */
  Shared = "Shared",
}

/**
 * Status of a vector in a craft's flight plan.
 * @see RULE-VEC-1 through RULE-VEC-5
 */
export enum VectorStatus {
  /** Vector has not been attempted yet. */
  Pending = "Pending",
  /** Vector's acceptance criteria have been met and reported. */
  Passed = "Passed",
  /** Vector's acceptance criteria could not be met. */
  Failed = "Failed",
}

/**
 * Built-in craft categories representing common types of change.
 *
 * Categories are project-configurable per the spec, so this enum provides
 * the known defaults. Custom string categories are permitted at the type
 * level via the {@link CraftCategory} union.
 *
 * @see RULE-CRAFT-4
 */
export enum CraftCategoryEnum {
  /** Backend systems, APIs, data processing. */
  BackendEngineering = "Backend Engineering",
  /** User interfaces, browser-side code. */
  FrontendEngineering = "Frontend Engineering",
  /** CI/CD, deployment, cloud resources. */
  Infrastructure = "Infrastructure",
  /** Written docs, guides, specs. */
  Documentation = "Documentation",
}

/**
 * A craft category is either a built-in enum value or a custom project-defined string.
 *
 * This keeps type-safety for known categories while allowing project-level
 * configuration of additional categories per the spec.
 *
 * @see RULE-CRAFT-4
 */
export type CraftCategory = CraftCategoryEnum | (string & {});

/**
 * Types of black box log entries.
 * @see RULE-BBOX-1 through RULE-BBOX-4
 */
export enum BlackBoxEntryType {
  /** An implementation decision (algorithm, library, approach choice). */
  Decision = "Decision",
  /** A vector's acceptance criteria were met. */
  VectorPassed = "VectorPassed",
  /** The landing checklist failed and a go-around was initiated. */
  GoAround = "GoAround",
  /** A disagreement between pilots on approach, and how it was resolved. */
  Conflict = "Conflict",
  /** Any other noteworthy event, risk, or context. */
  Observation = "Observation",
  /** The captain has declared an emergency. Final entry before origin handoff. */
  EmergencyDeclaration = "EmergencyDeclaration",
  /** A checklist was executed. Contains full ChecklistRunResult metadata. @see RULE-CHKL-5 */
  ChecklistRun = "ChecklistRun",
  /** A single checklist item was executed. Paired with ChecklistRun for per-item granularity. @see RULE-CHKL-5 */
  ChecklistItem = "ChecklistItem",
  /** A Temporary Flight Restriction has taken effect on this craft. @see RULE-TFRP-5 */
  TFRIssued = "TFRIssued",
  /** A Temporary Flight Restriction affecting this craft has been lifted. @see RULE-TFRP-5 */
  TFRLifted = "TFRLifted",
  /** The craft was created (flight plan opened, enters Taxiing). @see RULE-BBOX-1 */
  CraftCreated = "CraftCreated",
  /** The craft was launched (Taxiing → InFlight). @see RULE-LIFE-3 */
  Launched = "Launched",
  /** A vector was reported as failed. @see RULE-VEC-2 */
  VectorFailed = "VectorFailed",
  /** Landing clearance was requested from the tower. @see RULE-TOWER-2 */
  ClearanceRequested = "ClearanceRequested",
  /** The craft was added to the tower landing queue. @see RULE-TOWER-1 */
  TowerEnqueued = "TowerEnqueued",
  /** The craft was removed from the tower landing queue. @see RULE-TOWER-1 */
  TowerDequeued = "TowerDequeued",
  /** The craft transitioned between lifecycle states. @see RULE-LIFE-1 */
  StateTransition = "StateTransition",
  /**
   * A line of stdout/stderr captured from a piloting agent's subprocess.
   *
   * Distinct from `Observation` (which is a deliberate log entry authored by an
   * agent): `AgentOutput` is the raw, unfiltered transcript of subprocess I/O
   * piped through the daemon's output ring buffer.
   */
  AgentOutput = "AgentOutput",
  /** The craft's branch was successfully merged into main. @see RULE-TMRG-2 */
  Merge = "Merge",
  /** Tower attempted a merge but the branch was not up to date with main. @see RULE-TMRG-2 */
  MergeStale = "MergeStale",
  /** Tower attempted a merge but encountered conflicts. @see RULE-TMRG-3 */
  MergeConflict = "MergeConflict",
  /** The craft was created from a spec document via SDD. @see RULE-SDD-16 */
  SpecCreated = "SpecCreated",
  /** An MCP session was established by a pilot via the standalone MCP server. @see RULE-BBOX-5 */
  McpSessionOpened = "McpSessionOpened",
  /** An MCP session was terminated. @see RULE-BBOX-6 */
  McpSessionClosed = "McpSessionClosed",
  /** An MCP tool call resulted in an authorization or domain rule failure. @see RULE-BBOX-7 */
  McpToolError = "McpToolError",
}
