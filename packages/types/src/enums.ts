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
}
