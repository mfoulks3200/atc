import {
  CraftStatus,
  SeatType,
  ControlMode,
  VectorStatus,
  BlackBoxEntryType,
} from "./enums.js";

/**
 * A single entry in a craft's black box log.
 * @see RULE-BBOX-1 through RULE-BBOX-4
 */
export interface BlackBoxEntry {
  /** When the entry was recorded. */
  readonly timestamp: Date;
  /** Identifier of the pilot who recorded the entry. @see RULE-BBOX-3 */
  readonly author: string;
  /** The kind of event. */
  readonly type: BlackBoxEntryType;
  /** Description of the decision, event, or observation. */
  readonly content: string;
}

/**
 * A milestone in a craft's flight plan.
 * @see RULE-VEC-1 through RULE-VEC-5
 */
export interface Vector {
  /** Short, descriptive identifier for the milestone. */
  readonly name: string;
  /** Specific, verifiable conditions that must be met. */
  readonly acceptanceCriteria: string;
  /** Current status of this vector. */
  status: VectorStatus;
}

/**
 * A report filed when a craft passes through a vector.
 * @see RULE-VRPT-1 through RULE-VRPT-4
 */
export interface VectorReport {
  /** The craft that passed the vector. @see RULE-VRPT-2 */
  readonly craftCallsign: string;
  /** The vector that was passed. @see RULE-VRPT-2 */
  readonly vectorName: string;
  /** Proof that acceptance criteria were met. @see RULE-VRPT-2 */
  readonly acceptanceEvidence: string;
  /** When the vector was passed. @see RULE-VRPT-2 */
  readonly timestamp: Date;
}

/**
 * An autonomous agent that can be assigned to a craft.
 * @see RULE-PILOT-1, RULE-PILOT-2
 */
export interface Pilot {
  /** Unique identifier for the pilot agent. @see RULE-PILOT-1 */
  readonly identifier: string;
  /** Craft categories this pilot is certified to fly. @see RULE-PILOT-2 */
  readonly certifications: readonly string[];
}

/**
 * A pilot's assignment to a specific craft.
 */
export interface SeatAssignment {
  /** The assigned pilot. */
  readonly pilot: Pilot;
  /** The seat occupied on this craft. @see RULE-SEAT-1 through RULE-SEAT-4 */
  readonly seat: SeatType;
}

/**
 * Describes a shared control area assignment.
 */
export interface SharedControlArea {
  /** The pilot holding this area. */
  readonly pilotIdentifier: string;
  /** Description of the area of responsibility (file, module, concern). */
  readonly area: string;
}

/**
 * The current state of a craft's controls.
 * @see RULE-CTRL-1 through RULE-CTRL-7
 */
export interface ControlState {
  /** Current control mode. @see RULE-CTRL-1 */
  readonly mode: ControlMode;
  /** In Exclusive mode: the single pilot holding controls. In Shared mode: undefined (see sharedAreas). */
  readonly holder?: string;
  /** In Shared mode: the non-overlapping areas of responsibility. In Exclusive mode: undefined. @see RULE-CTRL-5 */
  readonly sharedAreas?: readonly SharedControlArea[];
}

/**
 * An ordered sequence of vectors assigned to a craft.
 * @see RULE-VEC-1
 */
export type FlightPlan = readonly Vector[];

/**
 * The fundamental unit of work in ATC.
 * @see RULE-CRAFT-1 through RULE-CRAFT-5
 */
export interface Craft {
  /** Unique, immutable identifier. @see RULE-CRAFT-1 */
  readonly callsign: string;
  /** Associated git branch (1:1). @see RULE-CRAFT-2 */
  readonly branch: string;
  /** Description of the change and its scope. @see RULE-CRAFT-3 */
  readonly cargo: string;
  /** Determines pilot eligibility. @see RULE-CRAFT-4 */
  readonly category: string;
  /** Pilot-in-command. @see RULE-CRAFT-5, RULE-SEAT-1 */
  readonly captain: Pilot;
  /** Certified assistant pilots. @see RULE-SEAT-2 */
  readonly firstOfficers: readonly Pilot[];
  /** Observer/advisor pilots. @see RULE-SEAT-3 */
  readonly jumpseaters: readonly Pilot[];
  /** Ordered milestones. @see RULE-VEC-1 */
  readonly flightPlan: FlightPlan;
  /** Append-only event log. @see RULE-BBOX-1 */
  readonly blackBox: readonly BlackBoxEntry[];
  /** Current control state. @see RULE-CTRL-1 */
  readonly controls: ControlState;
  /** Current lifecycle phase. @see RULE-LIFE-1 */
  status: CraftStatus;
}
