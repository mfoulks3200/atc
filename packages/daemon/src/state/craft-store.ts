/**
 * In-memory store for CraftState objects, backed by per-craft JSON files on disk.
 *
 * State is organized by project name and callsign. Each craft serializes to
 * `stateDir/projects/<project>/crafts/<callsign>/craft.json`. Usage reports
 * are appended line-by-line to `stateDir/projects/<project>/crafts/<callsign>/usage.json`.
 *
 * @see RULE-CRAFT-1 through RULE-CRAFT-8 for craft lifecycle rules.
 */

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Mutex } from "async-mutex";
import type { AgentUsageReport, CraftState, IntercomMessage } from "../types.js";
import { atomicWriteJson, readJsonSafe } from "./persistence.js";

/**
 * Manages all in-flight craft states for the daemon.
 *
 * Internal storage is a two-level `Map<projectName, Map<callsign, CraftState>>`.
 * Persistence is provided by `atomicWriteJson` / `readJsonSafe`.
 *
 * Multi-step read-modify-write operations (lifecycle transitions, controls
 * claim/share, black-box appends, vector reports) must use `withCraftLock` to
 * prevent concurrent callers from interleaving mutations on the same craft.
 *
 * @see RULE-CRAFT-1 for craft identity rules.
 * @see RULE-CRAFT-5 for intercom usage constraints.
 */
export class CraftStore {
  private readonly _stateDir: string;
  private readonly _projects: Map<string, Map<string, CraftState>> = new Map();
  private readonly _mutexes: Map<string, Map<string, Mutex>> = new Map();

  /**
   * @param stateDir - Root directory where project sub-trees are stored.
   */
  constructor(stateDir: string) {
    this._stateDir = stateDir;
  }

  // ---------------------------------------------------------------------------
  // Path helpers
  // ---------------------------------------------------------------------------

  private _craftDir(projectName: string, callsign: string): string {
    return join(this._stateDir, "projects", projectName, "crafts", callsign);
  }

  private _craftFilePath(projectName: string, callsign: string): string {
    return join(this._craftDir(projectName, callsign), "craft.json");
  }

  private _usageFilePath(projectName: string, callsign: string): string {
    return join(this._craftDir(projectName, callsign), "usage.json");
  }

  private _projectCraftsDir(projectName: string): string {
    return join(this._stateDir, "projects", projectName, "crafts");
  }

  // ---------------------------------------------------------------------------
  // Map helpers
  // ---------------------------------------------------------------------------

  private _getProjectMap(projectName: string): Map<string, CraftState> {
    let projectMap = this._projects.get(projectName);
    if (projectMap === undefined) {
      projectMap = new Map();
      this._projects.set(projectName, projectMap);
    }
    return projectMap;
  }

  private _getMutex(projectName: string, callsign: string): Mutex {
    let projectMutexes = this._mutexes.get(projectName);
    if (projectMutexes === undefined) {
      projectMutexes = new Map();
      this._mutexes.set(projectName, projectMutexes);
    }
    let mutex = projectMutexes.get(callsign);
    if (mutex === undefined) {
      mutex = new Mutex();
      projectMutexes.set(callsign, mutex);
    }
    return mutex;
  }

  // ---------------------------------------------------------------------------
  // Public API - synchronous mutations
  // ---------------------------------------------------------------------------

  /**
   * Returns the craft state for the given project and callsign, or `undefined`.
   *
   * @param projectName - Name of the project.
   * @param callsign - Aviation callsign of the craft.
   */
  get(projectName: string, callsign: string): CraftState | undefined {
    return this._projects.get(projectName)?.get(callsign);
  }

  /**
   * Inserts or replaces a craft state, keyed by `craft.callsign` within the project.
   *
   * @param projectName - Name of the project.
   * @param craft - The craft state to store.
   */
  set(projectName: string, craft: CraftState): void {
    this._getProjectMap(projectName).set(craft.callsign, craft);
  }

  /**
   * Returns all craft states for the given project, or an empty array if the
   * project is not known.
   *
   * @param projectName - Name of the project.
   */
  listForProject(projectName: string): CraftState[] {
    const projectMap = this._projects.get(projectName);
    if (projectMap === undefined) return [];
    return Array.from(projectMap.values());
  }

  /**
   * Returns every craft state across all projects.
   */
  listAll(): CraftState[] {
    const result: CraftState[] = [];
    for (const projectMap of this._projects.values()) {
      result.push(...projectMap.values());
    }
    return result;
  }

  /**
   * Removes a craft from the store.
   * No-ops if the project or callsign is not present.
   *
   * @param projectName - Name of the project.
   * @param callsign - Aviation callsign of the craft.
   */
  remove(projectName: string, callsign: string): void {
    this._projects.get(projectName)?.delete(callsign);
    this._mutexes.get(projectName)?.delete(callsign);
  }

  /**
   * Acquires the per-craft mutex and runs `fn` exclusively.
   *
   * All multi-step read-modify-write operations on a single craft (lifecycle
   * transitions, controls claim/share, black-box appends, vector reports) must
   * be wrapped in this method to prevent concurrent callers from interleaving
   * their mutations.
   *
   * Single-step reads (`get`, `listForProject`, `listAll`) do not need the lock.
   *
   * @param projectName - Name of the project.
   * @param callsign - Aviation callsign of the craft.
   * @param fn - Async callback to run while holding the lock.
   * @returns The value returned by `fn`.
   *
   * @see RULE-CTRL-7 for controls transfer atomicity.
   * @see RULE-BBOX-2 for black-box append-only invariant.
   */
  async withCraftLock<T>(projectName: string, callsign: string, fn: () => Promise<T>): Promise<T> {
    return this._getMutex(projectName, callsign).runExclusive(fn);
  }

  /**
   * Appends an intercom message to the in-memory craft state.
   * No-ops if the craft is not found.
   *
   * @param projectName - Name of the project.
   * @param callsign - Aviation callsign of the craft.
   * @param message - Intercom message to append.
   * @see RULE-CRAFT-5 for intercom usage constraints.
   */
  appendIntercom(projectName: string, callsign: string, message: IntercomMessage): void {
    const craft = this._projects.get(projectName)?.get(callsign);
    if (craft !== undefined) {
      craft.intercom.push(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API - persistence
  // ---------------------------------------------------------------------------

  /**
   * Atomically writes a single craft's state to disk.
   *
   * Path: `stateDir/projects/<project>/crafts/<callsign>/craft.json`
   *
   * @param projectName - Name of the project.
   * @param callsign - Aviation callsign of the craft.
   * @returns Resolves when the write completes.
   */
  async save(projectName: string, callsign: string): Promise<void> {
    const craft = this._projects.get(projectName)?.get(callsign);
    if (craft === undefined) {
      return;
    }
    await atomicWriteJson(this._craftFilePath(projectName, callsign), craft);
  }

  /**
   * Atomically writes every known craft to disk.
   *
   * @returns Resolves when all writes complete.
   */
  async saveAll(): Promise<void> {
    const writes: Promise<void>[] = [];
    for (const [projectName, projectMap] of this._projects) {
      for (const callsign of projectMap.keys()) {
        writes.push(this.save(projectName, callsign));
      }
    }
    await Promise.all(writes);
  }

  /**
   * Appends a usage report as a JSON line to
   * `stateDir/projects/<project>/crafts/<callsign>/usage.json`.
   *
   * The file is created (with parent directories) if it does not exist.
   *
   * @param projectName - Name of the project.
   * @param callsign - Aviation callsign of the craft.
   * @param report - Usage report to append.
   * @returns Resolves when the append completes.
   */
  async appendUsageReport(
    projectName: string,
    callsign: string,
    report: AgentUsageReport,
  ): Promise<void> {
    const filePath = this._usageFilePath(projectName, callsign);
    await mkdir(this._craftDir(projectName, callsign), { recursive: true });
    const line = JSON.stringify(report) + "\n";
    await writeFile(filePath, line, { flag: "a", encoding: "utf8" });
  }

  /**
   * Reads all craft.json files under stateDir/projects/[project]/crafts/[callsign]/craft.json
   * and populates the in-memory store for that project.
   *
   * Missing or empty directories are silently ignored.
   *
   * @remarks Backfills `createdAt` from the earliest black-box entry (or the
   *   current time if the box is empty) when loading legacy files that predate
   *   the field. This is a one-time in-memory migration; the on-disk file is
   *   not rewritten.
   *
   * @param projectName - Name of the project to load.
   * @returns Resolves when all crafts have been loaded.
   */
  async loadProject(projectName: string): Promise<void> {
    const craftsDir = this._projectCraftsDir(projectName);
    let entries: string[];
    try {
      entries = await readdir(craftsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw err;
    }

    const projectMap = this._getProjectMap(projectName);

    await Promise.all(
      entries.map(async (callsign) => {
        const filePath = join(craftsDir, callsign, "craft.json");
        const craft = await readJsonSafe<CraftState>(filePath);
        if (craft !== null) {
          if (!craft.createdAt) {
            const earliest = craft.blackBox.reduce<string | undefined>(
              (min, e) => (min === undefined || e.timestamp < min ? e.timestamp : min),
              undefined,
            );
            craft.createdAt = earliest ?? new Date().toISOString();
          }
          projectMap.set(callsign, craft);
        }
      }),
    );
  }
}
