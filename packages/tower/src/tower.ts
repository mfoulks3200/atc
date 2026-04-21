import type { Craft } from "@airtrafficcontrol/types";
import { VectorStatus, BlackBoxEntryType } from "@airtrafficcontrol/types";
import { TowerError, EmergencyError } from "@airtrafficcontrol/errors";
import type {
  QueueEntry,
  ClearanceResult,
  EmergencyReport,
  MergeOutcome,
  MergeExecutor,
} from "./types.js";
import { createEmergencyReport } from "./emergency.js";

/**
 * The centralized merge coordination agent for a repository.
 * Manages an FCFS merge queue, validates vector completion before
 * granting landing clearance, and handles emergency declarations.
 *
 * @see RULE-TOWER-1 — exactly one tower per repository
 * @see RULE-TOWER-2 — verify all vectors before granting clearance
 * @see RULE-TOWER-3 — verify branch is up to date before merge
 * @see RULE-TMRG-1 through RULE-TMRG-4 — merge protocol (vector verification,
 *   up-to-date check, conflict handling, FCFS ordering)
 */
export class Tower {
  /** The FCFS merge queue. */
  private queue: QueueEntry[] = [];

  /**
   * Request landing clearance for a craft.
   * Verifies all vectors in the flight plan have Passed status.
   * If granted, the craft is automatically enqueued for merge.
   *
   * @param craft - The craft requesting clearance.
   * @returns A ClearanceResult indicating whether clearance was granted.
   * @see RULE-TOWER-2, RULE-TMRG-1, RULE-TMRG-4
   */
  requestClearance(craft: Craft): ClearanceResult {
    const allPassed = craft.flightPlan.every((v) => v.status === VectorStatus.Passed);

    if (!allPassed) {
      const unpassed = craft.flightPlan
        .filter((v) => v.status !== VectorStatus.Passed)
        .map((v) => v.name);
      return {
        granted: false,
        reason: `Landing clearance denied: the following vector(s) have not passed: ${unpassed.join(", ")}`,
      };
    }

    this.enqueue(craft);

    return { granted: true };
  }

  /**
   * Add a craft to the merge queue.
   * Merges are sequenced first-come, first-served.
   *
   * @param craft - The craft to enqueue.
   * @throws TowerError if the craft is already in the queue.
   * @see RULE-TMRG-4
   */
  enqueue(craft: Craft): void {
    const exists = this.queue.some((entry) => entry.craft.callsign === craft.callsign);
    if (exists) {
      throw new TowerError(
        `Craft "${craft.callsign}" is already in the merge queue`,
        "RULE-TMRG-4",
      );
    }

    this.queue.push({
      craft,
      requestedAt: new Date(),
    });
  }

  /**
   * Remove a craft from the queue by callsign.
   * Used after a successful merge or when a craft is rejected/emergency.
   *
   * @param callsign - The callsign of the craft to remove.
   * @returns The removed craft, or undefined if not found.
   */
  dequeue(callsign: string): Craft | undefined {
    const index = this.queue.findIndex((entry) => entry.craft.callsign === callsign);
    if (index === -1) {
      return undefined;
    }
    const [removed] = this.queue.splice(index, 1);
    return removed.craft;
  }

  /**
   * Peek at the next craft in the queue without removing it.
   * Returns the oldest entry (FCFS ordering).
   *
   * @returns The next QueueEntry, or undefined if the queue is empty.
   * @see RULE-TMRG-4
   */
  peek(): QueueEntry | undefined {
    return this.queue[0];
  }

  /**
   * The number of crafts currently in the merge queue.
   */
  get queueSize(): number {
    return this.queue.length;
  }

  /**
   * Execute steps 4–6 of the tower merge protocol for the next craft in the
   * queue.
   *
   * Verifies the craft's branch is up to date with main (RULE-TOWER-3,
   * RULE-TMRG-2), then asks the {@link MergeExecutor} to merge the branch
   * into main (RULE-TMRG-3). The craft is removed from the queue regardless
   * of outcome — successful merges proceed to `Landed`, while stale or
   * conflicting merges are returned to the caller so the craft can be sent
   * on a go-around.
   *
   * The function does not mutate craft state directly (the daemon owns the
   * persisted state and lifecycle transitions). It is a pure orchestrator
   * over the supplied executor.
   *
   * @param craft - The craft at the head of the queue. The caller MUST
   *   ensure this matches `peek()`; the tower only enforces that the
   *   craft is currently in the queue.
   * @param executor - Side-effecting git implementation supplied by the
   *   daemon.
   * @returns The {@link MergeOutcome} describing the result.
   * @throws TowerError if the craft is not in the merge queue.
   *
   * @see RULE-TOWER-3
   * @see RULE-TMRG-2
   * @see RULE-TMRG-3
   * @see RULE-TMRG-4
   */
  async executeMerge(craft: Craft, executor: MergeExecutor): Promise<MergeOutcome> {
    const inQueue = this.queue.some((entry) => entry.craft.callsign === craft.callsign);
    if (!inQueue) {
      throw new TowerError(`Craft "${craft.callsign}" is not in the merge queue`, "RULE-TMRG-4");
    }

    const mainBranch = await executor.getMainBranch();

    // RULE-TOWER-3 / RULE-TMRG-2 — verify branch is up to date before merge.
    const upToDate = await executor.isBranchUpToDate(mainBranch, craft.branch);
    if (!upToDate) {
      this.dequeue(craft.callsign);
      return {
        kind: "stale",
        mainBranch,
        reason: `Branch "${craft.branch}" is not up to date with "${mainBranch}"`,
      };
    }

    // RULE-TMRG-3 — execute the merge; conflicts are reported, not thrown.
    const message = `Tower merge: land craft ${craft.callsign}\n\n${craft.cargo}`;
    const outcome = await executor.merge(mainBranch, craft.branch, message);

    this.dequeue(craft.callsign);
    return outcome;
  }

  /**
   * Declare an emergency for a craft.
   * Only the captain may declare an emergency. An EmergencyDeclaration entry
   * is appended to the black box, and the craft data is packaged into a report
   * for the origin airport.
   *
   * If the craft is in the merge queue, it is removed.
   *
   * @param craft - The craft declaring emergency.
   * @param captainId - The identifier of the pilot declaring. Must match the captain.
   * @param reason - A summary of the issues and attempted remediations.
   * @returns An EmergencyReport for the origin airport.
   * @throws EmergencyError if captainId does not match the craft's captain.
   * @see RULE-EMER-1 through RULE-EMER-4, RULE-ORIG-2
   */
  declareEmergency(craft: Craft, captainId: string, reason: string): EmergencyReport {
    if (craft.captain.identifier !== captainId) {
      throw new EmergencyError(
        `Only the captain may declare an emergency. Expected "${craft.captain.identifier}", got "${captainId}"`,
        "RULE-EMER-1",
      );
    }

    // RULE-EMER-2: Record EmergencyDeclaration in black box
    const emergencyEntry = {
      timestamp: new Date(),
      author: captainId,
      type: BlackBoxEntryType.EmergencyDeclaration,
      content: reason,
    };

    // Build a craft snapshot with the emergency entry appended to the black box
    const craftWithEmergency: Craft = {
      ...craft,
      blackBox: [...craft.blackBox, emergencyEntry],
    };

    // Remove from queue if present
    this.dequeue(craft.callsign);

    // RULE-EMER-4, RULE-ORIG-2: Create report for origin airport
    return createEmergencyReport(craftWithEmergency);
  }
}

/**
 * Factory function to create a new Tower instance.
 * There must be exactly one tower per repository.
 *
 * @returns A new Tower with an empty merge queue.
 * @see RULE-TOWER-1
 */
export function createTower(): Tower {
  return new Tower();
}
