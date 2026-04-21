import type { Craft, FlightPlan, BlackBoxEntry } from "@airtrafficcontrol/types";

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
/**
 * The outcome of {@link Tower.executeMerge}.
 *
 * The tower uses these results to decide the next lifecycle state for a
 * craft after step 5 of the merge protocol.
 *
 * - `landed`: branch was merged successfully; transition craft to `Landed`.
 * - `stale`: branch was not up to date with main; transition to `GoAround`.
 * - `conflict`: the merge produced conflicts; transition to `GoAround`.
 *
 * @see RULE-TOWER-3
 * @see RULE-TMRG-2
 * @see RULE-TMRG-3
 */
export type MergeOutcome =
  | { kind: "landed"; mainBranch: string; mergeCommit: string }
  | { kind: "stale"; mainBranch: string; reason: string }
  | { kind: "conflict"; mainBranch: string; reason: string };

/**
 * Side-effecting interface the tower uses to perform real git operations.
 *
 * The {@link Tower} package contains no git I/O — the daemon supplies an
 * implementation that talks to its bare-repo / worktree utilities. This
 * keeps the tower package pure and testable with stub executors.
 *
 * @see RULE-TMRG-2
 * @see RULE-TMRG-3
 */
export interface MergeExecutor {
  /**
   * Resolve the project's main branch name (e.g. `"main"`).
   */
  getMainBranch(): Promise<string>;

  /**
   * Returns true if `branch` contains every commit on `mainBranch`.
   */
  isBranchUpToDate(mainBranch: string, branch: string): boolean | Promise<boolean>;

  /**
   * Execute the actual merge into main. Implementations MUST NOT throw on
   * merge conflict — they MUST return a structured outcome instead.
   */
  merge(mainBranch: string, branch: string, message: string): MergeOutcome | Promise<MergeOutcome>;
}

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
