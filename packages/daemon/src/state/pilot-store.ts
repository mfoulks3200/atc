/**
 * Persistent store for PilotRecord objects, backed by a JSON file on disk.
 *
 * All mutation methods operate synchronously on an internal two-level Map
 * (project -> pilot identifier -> record). Call `save()` to flush to disk
 * and `load()` to restore from a previous run.
 *
 * @see RULE-PILOT-1 for pilot identity rules.
 * @see RULE-PILOT-2 for certification rules.
 */

import { join } from "node:path";
import type { PilotRecord } from "../types.js";
import { atomicWriteJson, readJsonSafe } from "./persistence.js";

/** Relative path within stateDir where pilot records are persisted. */
const PILOTS_FILE = "pilots.json";

/**
 * Serialized format written to disk — a flat array of project-tagged records.
 */
interface PersistedPilot extends PilotRecord {
  /** The project this pilot belongs to. */
  projectName: string;
}

/**
 * Manages pilot records for all projects, backed by atomic JSON persistence.
 *
 * Internal storage is a `Map<projectName, Map<identifier, PilotRecord>>`.
 *
 * @see RULE-PILOT-1 for pilot identity rules.
 * @see RULE-SEAT-2 for certification requirements.
 */
export class PilotStore {
  private readonly _filePath: string;
  private readonly _records: Map<string, Map<string, PilotRecord>> = new Map();

  /**
   * @param stateDir - Directory where `pilots.json` is stored.
   */
  constructor(stateDir: string) {
    this._filePath = join(stateDir, PILOTS_FILE);
  }

  /**
   * Returns the pilot map for a given project, creating it lazily if needed.
   *
   * @param projectName - The project to look up.
   */
  private _getOrCreateProject(projectName: string): Map<string, PilotRecord> {
    let pilots = this._records.get(projectName);
    if (!pilots) {
      pilots = new Map();
      this._records.set(projectName, pilots);
    }
    return pilots;
  }

  /**
   * Returns the pilot record for the given project and identifier,
   * or `undefined` if not found.
   *
   * @param projectName - The project the pilot belongs to.
   * @param identifier - Unique pilot identifier within the project.
   */
  get(projectName: string, identifier: string): PilotRecord | undefined {
    return this._records.get(projectName)?.get(identifier);
  }

  /**
   * Inserts or replaces a pilot record, keyed by `record.identifier`.
   *
   * @param projectName - The project the pilot belongs to.
   * @param record - The pilot record to store.
   */
  set(projectName: string, record: PilotRecord): void {
    this._getOrCreateProject(projectName).set(record.identifier, record);
  }

  /**
   * Removes the pilot record with the given identifier from a project.
   * Returns `true` if the pilot was found and removed, `false` otherwise.
   *
   * @param projectName - The project the pilot belongs to.
   * @param identifier - Unique pilot identifier to remove.
   */
  remove(projectName: string, identifier: string): boolean {
    const pilots = this._records.get(projectName);
    if (!pilots) return false;
    return pilots.delete(identifier);
  }

  /**
   * Returns all pilot records for a given project as an array.
   *
   * @param projectName - The project to list pilots for.
   */
  listForProject(projectName: string): PilotRecord[] {
    const pilots = this._records.get(projectName);
    return pilots ? Array.from(pilots.values()) : [];
  }

  /**
   * Atomically writes all pilot records to `stateDir/pilots.json`.
   *
   * @returns Resolves when the write completes.
   */
  async save(): Promise<void> {
    const all: PersistedPilot[] = [];
    for (const [projectName, pilots] of this._records) {
      for (const record of pilots.values()) {
        all.push({ ...record, projectName });
      }
    }
    await atomicWriteJson(this._filePath, all);
  }

  /**
   * Reads pilot records from `stateDir/pilots.json` into memory.
   *
   * If the file does not exist the store is left empty; all other errors
   * are re-thrown.
   *
   * @returns Resolves when the load completes.
   */
  async load(): Promise<void> {
    const data = await readJsonSafe<PersistedPilot[]>(this._filePath);
    if (data === null) {
      return;
    }
    this._records.clear();
    for (const { projectName, ...record } of data) {
      this._getOrCreateProject(projectName).set(record.identifier, record);
    }
  }
}
