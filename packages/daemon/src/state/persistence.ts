/**
 * Atomic JSON persistence utilities for the ATC daemon.
 *
 * Provides crash-safe file I/O via write-to-temp-then-rename, a safe JSON
 * reader that tolerates missing files, and a FlushScheduler that batches
 * dirty-state flushes on a configurable interval.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// atomicWriteJson
// ---------------------------------------------------------------------------

/**
 * Writes `data` as JSON to `filePath` atomically.
 *
 * Creates any missing parent directories, serializes `data` to a temporary
 * file in the same directory (using `node:crypto` randomBytes for the tmp
 * name), then renames the tmp file over the target. This ensures readers
 * never observe a partial write.
 *
 * @param filePath - Absolute or relative path to the destination file.
 * @param data - Any JSON-serializable value.
 * @returns Resolves when the rename has completed.
 */
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmpName = join(dir, `${randomBytes(8).toString("hex")}.tmp`);
  const json = JSON.stringify(data, null, 2);

  await writeFile(tmpName, json, "utf8");
  await rename(tmpName, filePath);
}

// ---------------------------------------------------------------------------
// readJsonSafe
// ---------------------------------------------------------------------------

/**
 * Reads and JSON-parses the file at `filePath`.
 *
 * Returns `null` when the file does not exist (ENOENT). All other errors
 * are re-thrown so callers are not silently surprised by permission issues
 * or malformed JSON.
 *
 * @param filePath - Absolute or relative path to the JSON file.
 * @returns The parsed value, or `null` if the file is absent.
 */
export async function readJsonSafe<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// FlushScheduler
// ---------------------------------------------------------------------------

/**
 * Coordinates deferred, interval-based flushing of dirty state to disk.
 *
 * Call `markDirty()` whenever in-memory state changes. If an `intervalSeconds`
 * was provided at construction, the scheduler will automatically call the
 * supplied `flushFn` on every tick where the state is dirty. Call `flush()`
 * to flush immediately, and `stop()` to clear the interval on shutdown.
 */
export class FlushScheduler {
  private _isDirty = false;
  private _intervalHandle: ReturnType<typeof setInterval> | undefined;
  private readonly _flushFn: () => Promise<void>;

  /**
   * @param flushFn - Async function that persists current state to disk.
   * @param intervalSeconds - If provided and > 0, starts a `setInterval` that
   *   calls `flushFn` whenever the scheduler is dirty.
   */
  constructor(flushFn: () => Promise<void>, intervalSeconds?: number) {
    this._flushFn = flushFn;

    if (intervalSeconds !== undefined && intervalSeconds > 0) {
      this._intervalHandle = setInterval(() => {
        if (this._isDirty) {
          void this.flush();
        }
      }, intervalSeconds * 1000);
    }
  }

  /**
   * Whether there is unflushed dirty state.
   */
  get isDirty(): boolean {
    return this._isDirty;
  }

  /**
   * Marks the scheduler as having dirty state that needs to be flushed.
   */
  markDirty(): void {
    this._isDirty = true;
  }

  /**
   * Flushes dirty state by invoking the registered `flushFn`, then clears
   * the dirty flag regardless of whether the flush succeeded.
   *
   * @returns Resolves after `flushFn` completes.
   */
  async flush(): Promise<void> {
    await this._flushFn();
    this._isDirty = false;
  }

  /**
   * Clears the background flush interval. Call this during daemon shutdown
   * to prevent the interval from keeping the process alive.
   */
  stop(): void {
    if (this._intervalHandle !== undefined) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = undefined;
    }
  }
}
