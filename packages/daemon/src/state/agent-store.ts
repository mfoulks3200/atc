/**
 * In-memory store for AgentRecord objects, backed by a JSON file on disk.
 *
 * All mutation methods operate synchronously on an internal Map; call
 * `save()` to flush to disk and `load()` to restore from a previous run.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */

import { join } from "node:path";
import type { AgentRecord, AgentStatus } from "../types.js";
import { atomicWriteJson, readJsonSafe } from "./persistence.js";

/** Relative path within stateDir where agent records are persisted. */
const AGENTS_FILE = "agents.json";

/**
 * Manages the lifecycle of all known agent records for the daemon.
 *
 * Internal storage is a `Map<string, AgentRecord>` keyed by agent ID.
 * Persistence is provided by `atomicWriteJson` / `readJsonSafe` from
 * the shared persistence utilities.
 *
 * @see RULE-PILOT-1 for pilot identity rules.
 * @see RULE-SEAT-1 through RULE-SEAT-3 for seat assignment rules.
 */
export class AgentStore {
  private readonly _filePath: string;
  private readonly _records: Map<string, AgentRecord> = new Map();

  /**
   * @param stateDir - Directory where `agents.json` is stored.
   */
  constructor(stateDir: string) {
    this._filePath = join(stateDir, AGENTS_FILE);
  }

  /**
   * Returns the agent record for the given ID, or `undefined` if not found.
   *
   * @param id - Unique agent identifier (UUID).
   */
  get(id: string): AgentRecord | undefined {
    return this._records.get(id);
  }

  /**
   * Inserts or replaces the agent record, keyed by `record.id`.
   *
   * @param record - The agent record to store.
   */
  set(record: AgentRecord): void {
    this._records.set(record.id, record);
  }

  /**
   * Removes the agent record with the given ID.
   * No-ops if the ID is not present.
   *
   * @param id - Unique agent identifier (UUID).
   */
  remove(id: string): void {
    this._records.delete(id);
  }

  /**
   * Returns all stored agent records as an array.
   * Order is insertion order of the underlying Map.
   */
  list(): AgentRecord[] {
    return Array.from(this._records.values());
  }

  /**
   * Updates the `status` field of an existing agent record in-place.
   * No-ops if the agent ID is not found.
   *
   * @param id - Unique agent identifier (UUID).
   * @param status - New lifecycle status to apply.
   * @see RULE-PILOT-1 for valid lifecycle transitions.
   */
  updateStatus(id: string, status: AgentStatus): void {
    const record = this._records.get(id);
    if (record !== undefined) {
      this._records.set(id, { ...record, status });
    }
  }

  /**
   * Atomically writes all agent records to `stateDir/agents.json`.
   *
   * @returns Resolves when the write completes.
   */
  async save(): Promise<void> {
    await atomicWriteJson(this._filePath, this.list());
  }

  /**
   * Reads agent records from `stateDir/agents.json` into memory.
   *
   * If the file does not exist the store is left empty; all other errors
   * are re-thrown.
   *
   * @returns Resolves when the load completes.
   */
  async load(): Promise<void> {
    const data = await readJsonSafe<AgentRecord[]>(this._filePath);
    if (data === null) {
      return;
    }
    this._records.clear();
    for (const record of data) {
      this._records.set(record.id, record);
    }
  }
}
