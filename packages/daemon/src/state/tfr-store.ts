/**
 * In-memory store for Temporary Flight Restrictions, backed by a single JSON file.
 *
 * Persistence: `stateDir/tfrs.json`
 *
 * @see RULE-TFR-1 through RULE-TFR-8
 * @see RULE-TFRP-7 — Tower must maintain a log of all TFR events.
 */

import { join } from "node:path";
import type { TfrState } from "../types.js";
import { atomicWriteJson, readJsonSafe } from "./persistence.js";

/**
 * Manages all TFR records for the daemon.
 *
 * Internal storage is a `Map<identifier, TfrState>`. Active and lifted
 * TFRs are both retained for audit (RULE-TFRP-7).
 *
 * @see RULE-TFR-1 for TFR identity rules.
 * @see RULE-TFRP-7 for tower TFR log requirements.
 */
export class TfrStore {
  private readonly _stateDir: string;
  private readonly _tfrs: Map<string, TfrState> = new Map();

  /**
   * @param stateDir - Root directory where state files are stored.
   */
  constructor(stateDir: string) {
    this._stateDir = stateDir;
  }

  // ---------------------------------------------------------------------------
  // Path helpers
  // ---------------------------------------------------------------------------

  private _tfrFilePath(): string {
    return join(this._stateDir, "tfrs.json");
  }

  // ---------------------------------------------------------------------------
  // Public API — synchronous queries
  // ---------------------------------------------------------------------------

  /**
   * Returns the TFR with the given identifier, or `undefined`.
   *
   * @param identifier - Unique TFR identifier.
   */
  get(identifier: string): TfrState | undefined {
    return this._tfrs.get(identifier);
  }

  /**
   * Inserts or replaces a TFR record.
   *
   * @param tfr - The TFR state to store.
   */
  set(tfr: TfrState): void {
    this._tfrs.set(tfr.identifier, tfr);
  }

  /**
   * Returns all TFR records (active and lifted).
   */
  list(): TfrState[] {
    return Array.from(this._tfrs.values());
  }

  /**
   * Returns only active (non-lifted) TFRs.
   */
  listActive(): TfrState[] {
    return this.list().filter((tfr) => tfr.liftedAt === null);
  }

  /**
   * Returns all active TFRs that affect a given project and callsign.
   * A TFR affects a craft if it is active and its scope matches:
   * - `global`: always matches
   * - `project`: matches if target equals the project name
   * - `craft`: matches if target equals the callsign
   *
   * @param projectName - The project to check.
   * @param callsign - The craft callsign to check.
   * @see RULE-TFR-7
   */
  findAffecting(projectName: string, callsign: string): TfrState[] {
    return this.listActive().filter((tfr) => {
      switch (tfr.scope) {
        case "global":
          return true;
        case "project":
          return tfr.target === projectName;
        case "craft":
          return tfr.target === callsign;
        default:
          return false;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Public API — persistence
  // ---------------------------------------------------------------------------

  /**
   * Atomically writes all TFR records to `stateDir/tfrs.json`.
   *
   * @returns Resolves when the write completes.
   */
  async save(): Promise<void> {
    await atomicWriteJson(this._tfrFilePath(), this.list());
  }

  /**
   * Loads TFR records from `stateDir/tfrs.json`.
   * If the file does not exist, the store remains empty.
   *
   * @returns Resolves when the load completes.
   */
  async load(): Promise<void> {
    const data = await readJsonSafe<TfrState[]>(this._tfrFilePath());
    if (data === null) {
      return;
    }
    for (const tfr of data) {
      this._tfrs.set(tfr.identifier, tfr);
    }
  }
}
