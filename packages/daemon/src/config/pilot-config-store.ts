/**
 * In-memory store for per-pilot configuration.
 *
 * Provides the same API shape as LayeredConfigStore (get, getOverrides, patch,
 * replace, unset, remove) but backed by a Map instead of a file. This is
 * intentional — pilot persistence is not yet implemented. When pilot
 * persistence lands, this will be upgraded to a real LayeredConfigStore.
 *
 * All mutations publish `{ config, source: "api" }` on `config:pilot:{id}`.
 *
 * @see RULE-PILOT-1
 */

import { UnknownConfigKeyError } from "@airtrafficcontrol/errors";
import { PILOT_CONFIG_DEFAULTS, PILOT_CONFIG_SCHEMA, type PilotConfig } from "./schema.js";

/**
 * In-memory store for per-pilot configuration.
 *
 * Stores sparse overrides per pilot ID and merges them with
 * `PILOT_CONFIG_DEFAULTS` on read.
 *
 * @see RULE-PILOT-1
 */
export class PilotConfigStore {
  private readonly _overrides: Map<string, Record<string, unknown>> = new Map();
  private readonly _publish: (channel: string, data: unknown) => void;

  /**
   * @param publish - Channel-publish function (typically `ChannelRegistry.publish` bound).
   */
  constructor(publish: (channel: string, data: unknown) => void) {
    this._publish = publish;
  }

  /**
   * Returns the fully-merged config for the given pilot (defaults + overrides).
   * Returns defaults for unknown pilots.
   *
   * @param pilotId - The pilot identifier.
   * @returns Merged PilotConfig.
   *
   * @see RULE-PILOT-1
   */
  get(pilotId: string): PilotConfig {
    const overrides = this._overrides.get(pilotId) ?? {};
    return { ...(PILOT_CONFIG_DEFAULTS as Record<string, unknown>), ...overrides } as PilotConfig;
  }

  /**
   * Returns only the sparse overrides for the given pilot.
   * Returns an empty object for unknown pilots.
   *
   * @param pilotId - The pilot identifier.
   * @returns Sparse overrides record.
   *
   * @see RULE-PILOT-1
   */
  getOverrides(pilotId: string): Record<string, unknown> {
    return { ...(this._overrides.get(pilotId) ?? {}) };
  }

  /**
   * Merges the partial config into the pilot's overrides and publishes the change.
   *
   * @param pilotId - The pilot identifier.
   * @param partial - Partial config to merge in.
   * @returns The fully-merged config after the patch.
   *
   * @see RULE-PILOT-1
   */
  patch(pilotId: string, partial: Partial<PilotConfig>): PilotConfig {
    const existing = this._overrides.get(pilotId) ?? {};
    const merged = { ...existing, ...partial };
    this._overrides.set(pilotId, merged);
    this._emitChange(pilotId);
    return this.get(pilotId);
  }

  /**
   * Replaces the pilot's config entirely. Validates with Zod and computes a
   * sparse diff against defaults before storing.
   *
   * @param pilotId - The pilot identifier.
   * @param config - The full replacement config.
   * @returns The fully-merged config after the replace.
   * @throws {ConfigValidationError} If the config fails schema validation.
   *
   * @see RULE-PILOT-1
   */
  replace(pilotId: string, config: PilotConfig): PilotConfig {
    const parsed = PILOT_CONFIG_SCHEMA.parse(config);
    const sparse = this._computeSparse(parsed);
    this._overrides.set(pilotId, sparse);
    this._emitChange(pilotId);
    return this.get(pilotId);
  }

  /**
   * Reverts a single known key to its default for the given pilot.
   *
   * @param pilotId - The pilot identifier.
   * @param key - The key to revert.
   * @returns The fully-merged config after the unset.
   * @throws {UnknownConfigKeyError} If the key is not in the defaults.
   *
   * @see RULE-PILOT-1
   */
  unset(pilotId: string, key: keyof PilotConfig): PilotConfig {
    if (!this._isKnownKey(key as string)) {
      throw new UnknownConfigKeyError("agent", key as string);
    }
    const existing = { ...(this._overrides.get(pilotId) ?? {}) };
    delete existing[key as string];
    if (Object.keys(existing).length === 0) {
      this._overrides.delete(pilotId);
    } else {
      this._overrides.set(pilotId, existing);
    }
    this._emitChange(pilotId);
    return this.get(pilotId);
  }

  /**
   * Deletes all overrides for a pilot, effectively reverting them to defaults.
   *
   * @param pilotId - The pilot identifier.
   *
   * @see RULE-PILOT-1
   */
  remove(pilotId: string): void {
    this._overrides.delete(pilotId);
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private _computeSparse(config: PilotConfig): Record<string, unknown> {
    const sparse: Record<string, unknown> = {};
    for (const key of this._knownKeys()) {
      const v = (config as Record<string, unknown>)[key];
      if (!this._valueEquals(v, (PILOT_CONFIG_DEFAULTS as Record<string, unknown>)[key])) {
        sparse[key] = v;
      }
    }
    return sparse;
  }

  private _knownKeys(): string[] {
    return Object.keys(PILOT_CONFIG_DEFAULTS);
  }

  private _isKnownKey(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(PILOT_CONFIG_DEFAULTS, key);
  }

  private _valueEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  private _emitChange(pilotId: string): void {
    this._publish(`config:pilot:${pilotId}`, { config: this.get(pilotId), source: "api" });
  }
}
