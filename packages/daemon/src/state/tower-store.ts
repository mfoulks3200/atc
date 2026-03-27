/**
 * In-memory store for the per-project merge queue (tower landing queue).
 *
 * Each entry records the callsign and the ISO-8601 timestamp at which it
 * joined the queue. The queue is FCFS (first-come, first-served) — entries
 * are ordered by insertion time and `dequeue` removes by callsign.
 *
 * Persistence: `stateDir/projects/<project>/tower.json`
 *
 * @see RULE-TOWER-1 for tower merge coordination rules.
 */

import { join } from "node:path";
import { atomicWriteJson, readJsonSafe } from "./persistence.js";

/**
 * A single entry in the tower's landing queue.
 *
 * @see RULE-TOWER-1 for queue ordering rules.
 */
export interface QueueEntry {
  /** Aviation callsign of the craft requesting landing clearance. */
  callsign: string;
  /** ISO-8601 timestamp when the craft joined the queue. */
  requestedAt: string;
}

/**
 * Manages per-project landing queues for the tower merge coordinator.
 *
 * Internal storage is a `Map<projectName, QueueEntry[]>`. The queue
 * preserves insertion order (FCFS). Persistence is provided by
 * `atomicWriteJson` / `readJsonSafe`.
 *
 * @see RULE-TOWER-1 for tower coordination rules.
 */
export class TowerStore {
  private readonly _stateDir: string;
  private readonly _queues: Map<string, QueueEntry[]> = new Map();

  /**
   * @param stateDir - Root directory where project sub-trees are stored.
   */
  constructor(stateDir: string) {
    this._stateDir = stateDir;
  }

  // ---------------------------------------------------------------------------
  // Path helpers
  // ---------------------------------------------------------------------------

  private _towerFilePath(projectName: string): string {
    return join(this._stateDir, "projects", projectName, "tower.json");
  }

  // ---------------------------------------------------------------------------
  // Queue helpers
  // ---------------------------------------------------------------------------

  private _getQueue(projectName: string): QueueEntry[] {
    let queue = this._queues.get(projectName);
    if (queue === undefined) {
      queue = [];
      this._queues.set(projectName, queue);
    }
    return queue;
  }

  // ---------------------------------------------------------------------------
  // Public API — synchronous mutations
  // ---------------------------------------------------------------------------

  /**
   * Returns the current landing queue for the given project.
   * Returns an empty array for unknown projects.
   *
   * @param projectName - Name of the project.
   */
  getQueue(projectName: string): QueueEntry[] {
    return this._queues.get(projectName) ?? [];
  }

  /**
   * Adds a craft to the end of the landing queue with the current timestamp.
   *
   * @param projectName - Name of the project.
   * @param callsign - Aviation callsign of the craft requesting clearance.
   * @see RULE-TOWER-1 for queue ordering rules.
   */
  enqueue(projectName: string, callsign: string): void {
    const entry: QueueEntry = {
      callsign,
      requestedAt: new Date().toISOString(),
    };
    this._getQueue(projectName).push(entry);
  }

  /**
   * Removes the craft with the given callsign from the queue.
   * No-ops if the callsign is not present.
   *
   * @param projectName - Name of the project.
   * @param callsign - Aviation callsign to remove.
   */
  dequeue(projectName: string, callsign: string): void {
    const queue = this._queues.get(projectName);
    if (queue === undefined) {
      return;
    }
    const filtered = queue.filter((e) => e.callsign !== callsign);
    this._queues.set(projectName, filtered);
  }

  // ---------------------------------------------------------------------------
  // Public API — persistence
  // ---------------------------------------------------------------------------

  /**
   * Atomically writes the queue for a project to
   * `stateDir/projects/<project>/tower.json`.
   *
   * @param projectName - Name of the project.
   * @returns Resolves when the write completes.
   */
  async save(projectName: string): Promise<void> {
    const queue = this._queues.get(projectName) ?? [];
    await atomicWriteJson(this._towerFilePath(projectName), queue);
  }

  /**
   * Reads the queue for a project from
   * `stateDir/projects/<project>/tower.json`.
   *
   * If the file does not exist the queue is left empty.
   *
   * @param projectName - Name of the project.
   * @returns Resolves when the load completes.
   */
  async load(projectName: string): Promise<void> {
    const data = await readJsonSafe<QueueEntry[]>(this._towerFilePath(projectName));
    if (data === null) {
      return;
    }
    this._queues.set(projectName, data);
  }
}
