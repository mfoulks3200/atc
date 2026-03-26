import type { Craft, FlightPlan, BlackBoxEntry } from "@atc/types";

/**
 * A craft waiting in the merge queue.
 * The tower sequences merges FCFS by requestedAt timestamp.
 * @see RULE-TMRG-4
 */
export interface QueueEntry {
  /** The craft awaiting merge. */
  readonly craft: Craft;
  /** When the craft was added to the queue. Used for FCFS ordering. */
  readonly requestedAt: Date;
}

/**
 * Result of a landing clearance request.
 * Granted means the craft may proceed to merge; denied includes a reason.
 * @see RULE-TOWER-2, RULE-TMRG-1
 */
export interface ClearanceResult {
  /** Whether landing clearance was granted. */
  readonly granted: boolean;
  /** If denied, the reason clearance was not granted. */
  readonly reason?: string;
}

/**
 * Data provided to the origin airport when a craft is returned on emergency.
 * Contains everything the origin needs to diagnose root cause.
 * @see RULE-ORIG-2, RULE-EMER-4
 */
export interface EmergencyReport {
  /** The craft's unique identifier. */
  readonly callsign: string;
  /** Description of the change and its scope. */
  readonly cargo: string;
  /** The ordered sequence of vectors assigned to the craft. */
  readonly flightPlan: FlightPlan;
  /** The complete append-only event log. @see RULE-BBOX-4 */
  readonly blackBox: readonly BlackBoxEntry[];
}
