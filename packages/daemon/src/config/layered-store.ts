/**
 * Generic layered configuration store.
 *
 * Owns in-memory state for a single config scope, persists only the sparse
 * diff against defaults, and funnels all mutations through one internal
 * apply path so REST, WebSocket, and file-watcher writes stay consistent.
 *
 * This class is deliberately free of daemon-specific wiring so project and
 * agent scopes can reuse it by instantiating with a different schema,
 * defaults, file path, and channel.
 */

import { createHash } from "node:crypto";
import { stat, watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import type { z } from "zod";
import {
  ConfigValidationError,
  UnknownConfigKeyError,
  type ConfigScope,
} from "@airtrafficcontrol/errors";
import { atomicWriteJson } from "../state/persistence.js";

/** Source of a config change event. */
export type ChangeSource = "api" | "file" | "init";

/** Minimal logger shape the store depends on. */
export interface ConfigLogger {
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** Options accepted by the LayeredConfigStore constructor. */
export interface LayeredConfigStoreOptions<T extends object> {
  /** Zod schema describing the known shape of the config. */
  readonly schema: z.ZodType<T>;
  /** Canonical defaults; every known field has a value here. */
  readonly defaults: T;
  /** Absolute path to the JSON file backing this store. */
  readonly filePath: string;
  /** Pub/sub channel to broadcast change events on. */
  readonly channel: string;
  /** Scope tag attached to validation errors for this store. */
  readonly scope: ConfigScope;
  /** Function used to publish change events to subscribers. */
  readonly publish: (channel: string, data: unknown) => void;
  /** Logger for warnings (unknown fields, invalid external edits). */
  readonly logger: ConfigLogger;
  /** Debounce window in milliseconds for file-watch events. Defaults to 50ms. */
  readonly watchDebounceMs?: number;
}

/** Change event payload emitted by the store. */
export type ChangeListener<T> = (merged: T, source: ChangeSource) => void;

/** Invalid external edit listener payload. */
export type InvalidExternalEditListener = (error: ConfigValidationError | Error) => void;

/**
 * Generic layered config store. Instantiate one per scope.
 */
export class LayeredConfigStore<T extends object> {
  private readonly _opts: Required<Omit<LayeredConfigStoreOptions<T>, "watchDebounceMs">> & {
    readonly watchDebounceMs: number;
  };

  private _overrides: Record<string, unknown> = {};
  private _merged: T;
  private _unknownKeys: Set<string> = new Set();
  private _lastWrite: { mtimeMs: number; contentHash: string } | null = null;
  private _watcher: FSWatcher | null = null;
  private _watchTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingWrite: Promise<void> | null = null;

  private _changeListeners: ChangeListener<T>[] = [];
  private _invalidListeners: InvalidExternalEditListener[] = [];

  constructor(opts: LayeredConfigStoreOptions<T>) {
    this._opts = {
      schema: opts.schema,
      defaults: opts.defaults,
      filePath: opts.filePath,
      channel: opts.channel,
      scope: opts.scope,
      publish: opts.publish,
      logger: opts.logger,
      watchDebounceMs: opts.watchDebounceMs ?? 50,
    };
    this._merged = { ...opts.defaults };
  }

  /** Returns the fully-merged view (defaults + overrides). */
  get(): T {
    return this._merged;
  }

  /** Returns only the sparse on-disk shape. */
  getOverrides(): Record<string, unknown> {
    return { ...this._overrides };
  }

  /** Subscribe to change events or invalid-external-edit events. */
  on(event: "change", listener: ChangeListener<T>): void;
  on(event: "invalid_external_edit", listener: InvalidExternalEditListener): void;
  on(event: "change" | "invalid_external_edit", listener: unknown): void {
    if (event === "change") {
      this._changeListeners.push(listener as ChangeListener<T>);
    } else {
      this._invalidListeners.push(listener as InvalidExternalEditListener);
    }
  }

  /**
   * One-shot read of the backing file. Populates in-memory state and
   * emits a single `change` event with source `"init"`. Does not write.
   */
  async load(): Promise<void> {
    const raw = await this._readFile();
    if (raw === null) {
      this._overrides = {};
      this._merged = { ...this._opts.defaults };
      this._unknownKeys.clear();
      this._emitChange("init");
      return;
    }
    this._ingest(raw, "init");
  }

  /**
   * Full replace. Missing known fields revert to default.
   */
  async replace(next: T): Promise<T> {
    return this._applyCandidate(next, "api");
  }

  /**
   * Partial merge. Omitted fields are left untouched.
   */
  async patch(partial: Partial<T>): Promise<T> {
    const candidate = { ...this._merged, ...partial } as T;
    return this._applyCandidate(candidate, "api");
  }

  /**
   * Revert one known key to its default.
   */
  async unset(key: keyof T & string): Promise<T> {
    if (!this._isKnownKey(key)) {
      throw new UnknownConfigKeyError(this._opts.scope, key);
    }
    const candidate = { ...this._merged, [key]: this._opts.defaults[key] } as T;
    return this._applyCandidate(candidate, "api");
  }

  /** Begin watching the backing file for external edits. */
  start(): void {
    if (this._watcher !== null) return;
    try {
      this._watcher = watch(this._opts.filePath, () => this._scheduleReload());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this._opts.logger.warn(
          `LayeredConfigStore: cannot watch ${this._opts.filePath} yet (file absent)`,
        );
        return;
      }
      throw err;
    }
  }

  /** Stop watching and await any in-flight write. */
  async stop(): Promise<void> {
    if (this._watchTimer !== null) {
      clearTimeout(this._watchTimer);
      this._watchTimer = null;
    }
    if (this._watcher !== null) {
      this._watcher.close();
      this._watcher = null;
    }
    if (this._pendingWrite !== null) {
      await this._pendingWrite;
    }
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private async _applyCandidate(candidate: unknown, source: ChangeSource): Promise<T> {
    const parsed = this._opts.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new ConfigValidationError(this._opts.scope, parsed.error.issues);
    }
    const validated = parsed.data;

    const sparse = this._computeSparse(validated);
    for (const [k, v] of Object.entries(this._overrides)) {
      if (!this._isKnownKey(k) && !(k in sparse)) {
        sparse[k] = v;
      }
    }

    const write = atomicWriteJson(this._opts.filePath, sparse);
    this._pendingWrite = write;
    try {
      await write;
    } finally {
      this._pendingWrite = null;
    }
    this._lastWrite = await this._fingerprint();

    this._overrides = sparse;
    this._merged = validated;
    this._emitChange(source);
    return this._merged;
  }

  private _ingest(raw: Record<string, unknown>, source: ChangeSource): void {
    // The on-disk file is a sparse diff against defaults. Merge defaults
    // first so schema validation sees a complete object, then compute the
    // sparse view from the validated result.
    const candidate: Record<string, unknown> = {
      ...(this._opts.defaults as Record<string, unknown>),
      ...raw,
    };

    const parsed = this._opts.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new ConfigValidationError(this._opts.scope, parsed.error.issues);
    }
    const validated = parsed.data as Record<string, unknown>;

    const sparse: Record<string, unknown> = {};
    for (const k of this._knownKeys()) {
      const v = validated[k];
      if (!this._valueEquals(v, (this._opts.defaults as Record<string, unknown>)[k])) {
        sparse[k] = v;
      }
    }
    for (const k of Object.keys(raw)) {
      if (!this._isKnownKey(k)) {
        sparse[k] = raw[k];
        if (!this._unknownKeys.has(k)) {
          this._unknownKeys.add(k);
          this._opts.logger.warn(`Unknown config field in ${this._opts.filePath}: ${k}`);
        }
      }
    }

    this._overrides = sparse;
    const mergedKnown: Record<string, unknown> = {
      ...(this._opts.defaults as Record<string, unknown>),
    };
    for (const k of this._knownKeys()) {
      if (k in sparse) mergedKnown[k] = sparse[k];
    }
    this._merged = mergedKnown as T;
    this._emitChange(source);
  }

  private _computeSparse(validated: T): Record<string, unknown> {
    const sparse: Record<string, unknown> = {};
    for (const k of this._knownKeys()) {
      const v = (validated as Record<string, unknown>)[k];
      if (!this._valueEquals(v, (this._opts.defaults as Record<string, unknown>)[k])) {
        sparse[k] = v;
      }
    }
    return sparse;
  }

  private _valueEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  private _knownKeys(): string[] {
    return Object.keys(this._opts.defaults);
  }

  private _isKnownKey(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this._opts.defaults, key);
  }

  private async _readFile(): Promise<Record<string, unknown> | null> {
    try {
      const raw = await readFile(this._opts.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async _fingerprint(): Promise<{ mtimeMs: number; contentHash: string } | null> {
    try {
      const buf = await readFile(this._opts.filePath);
      const stats = await new Promise<{ mtimeMs: number }>((resolve, reject) => {
        stat(this._opts.filePath, (err, s) => (err ? reject(err) : resolve(s)));
      });
      const contentHash = createHash("sha256").update(buf).digest("hex");
      return { mtimeMs: stats.mtimeMs, contentHash };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private _scheduleReload(): void {
    if (this._watchTimer !== null) {
      clearTimeout(this._watchTimer);
    }
    this._watchTimer = setTimeout(() => {
      this._watchTimer = null;
      void this._handleReload();
    }, this._opts.watchDebounceMs);
  }

  private async _handleReload(): Promise<void> {
    const fp = await this._fingerprint();
    if (fp === null) {
      this._overrides = {};
      this._merged = { ...this._opts.defaults };
      this._unknownKeys.clear();
      this._emitChange("file");
      return;
    }
    if (
      this._lastWrite !== null &&
      fp.contentHash === this._lastWrite.contentHash &&
      fp.mtimeMs === this._lastWrite.mtimeMs
    ) {
      return;
    }
    try {
      const raw = await this._readFile();
      if (raw === null) {
        this._overrides = {};
        this._merged = { ...this._opts.defaults };
        this._emitChange("file");
        return;
      }
      this._ingest(raw, "file");
    } catch (err) {
      this._opts.logger.error(
        `LayeredConfigStore: invalid external edit to ${this._opts.filePath}`,
        err,
      );
      for (const l of this._invalidListeners) {
        l(err as ConfigValidationError | Error);
      }
    }
  }

  private _emitChange(source: ChangeSource): void {
    for (const l of this._changeListeners) l(this._merged, source);
    this._opts.publish(this._opts.channel, { config: this._merged, source });
  }
}
