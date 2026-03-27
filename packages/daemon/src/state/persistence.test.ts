/**
 * Tests for atomic JSON persistence utilities and FlushScheduler.
 *
 * Uses real filesystem I/O (mkdtemp / rm) — no mocks. This ensures the
 * atomic rename semantic is exercised for real.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { atomicWriteJson, FlushScheduler, readJsonSafe } from "./persistence.js";

// ---------------------------------------------------------------------------
// atomicWriteJson
// ---------------------------------------------------------------------------

describe("atomicWriteJson", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "atc-persistence-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes valid JSON to the target file", async () => {
    const filePath = join(tmpDir, "state.json");
    const data = { callsign: "alpha-1", status: "Preflight" };

    await atomicWriteJson(filePath, data);

    const raw = await readFile(filePath, "utf8");
    expect(JSON.parse(raw)).toEqual(data);
  });

  it("overwrites an existing file", async () => {
    const filePath = join(tmpDir, "state.json");
    await atomicWriteJson(filePath, { v: 1 });
    await atomicWriteJson(filePath, { v: 2 });

    const raw = await readFile(filePath, "utf8");
    expect(JSON.parse(raw)).toEqual({ v: 2 });
  });

  it("creates nested parent directories", async () => {
    const filePath = join(tmpDir, "a", "b", "c", "state.json");
    const data = { nested: true };

    await atomicWriteJson(filePath, data);

    const raw = await readFile(filePath, "utf8");
    expect(JSON.parse(raw)).toEqual(data);
  });

  it("leaves no .tmp files behind after a successful write", async () => {
    const filePath = join(tmpDir, "state.json");
    await atomicWriteJson(filePath, { clean: true });

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(tmpDir);
    const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
    expect(tmpFiles).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// readJsonSafe
// ---------------------------------------------------------------------------

describe("readJsonSafe", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "atc-persistence-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("reads and parses an existing JSON file", async () => {
    const filePath = join(tmpDir, "data.json");
    await atomicWriteJson(filePath, { hello: "world" });

    const result = await readJsonSafe(filePath);
    expect(result).toEqual({ hello: "world" });
  });

  it("returns null when the file does not exist", async () => {
    const result = await readJsonSafe(join(tmpDir, "does-not-exist.json"));
    expect(result).toBeNull();
  });

  it("propagates errors that are not ENOENT", async () => {
    // Pass a path that is actually a directory — readFile will throw EISDIR.
    await expect(readJsonSafe(tmpDir)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FlushScheduler
// ---------------------------------------------------------------------------

describe("FlushScheduler", () => {
  it("starts with isDirty === false", () => {
    const scheduler = new FlushScheduler(async () => {});
    expect(scheduler.isDirty).toBe(false);
    scheduler.stop();
  });

  it("becomes dirty after markDirty()", () => {
    const scheduler = new FlushScheduler(async () => {});
    scheduler.markDirty();
    expect(scheduler.isDirty).toBe(true);
    scheduler.stop();
  });

  it("calls the flushFn and clears dirty on flush()", async () => {
    const flushFn = vi.fn(async () => {});
    const scheduler = new FlushScheduler(flushFn);

    scheduler.markDirty();
    expect(scheduler.isDirty).toBe(true);

    await scheduler.flush();

    expect(flushFn).toHaveBeenCalledOnce();
    expect(scheduler.isDirty).toBe(false);
    scheduler.stop();
  });

  it("clears dirty flag even when called without being marked dirty", async () => {
    const flushFn = vi.fn(async () => {});
    const scheduler = new FlushScheduler(flushFn);

    await scheduler.flush();

    expect(flushFn).toHaveBeenCalledOnce();
    expect(scheduler.isDirty).toBe(false);
    scheduler.stop();
  });

  it("invokes flushFn automatically on interval when dirty", async () => {
    const flushFn = vi.fn(async () => {});
    vi.useFakeTimers();

    const scheduler = new FlushScheduler(flushFn, 1); // 1-second interval
    scheduler.markDirty();

    await vi.advanceTimersByTimeAsync(1100);

    expect(flushFn).toHaveBeenCalled();
    scheduler.stop();
    vi.useRealTimers();
  });

  it("does not invoke flushFn on interval when not dirty", async () => {
    const flushFn = vi.fn(async () => {});
    vi.useFakeTimers();

    const scheduler = new FlushScheduler(flushFn, 1);
    // Do NOT call markDirty

    await vi.advanceTimersByTimeAsync(2100);

    expect(flushFn).not.toHaveBeenCalled();
    scheduler.stop();
    vi.useRealTimers();
  });

  it("does not start an interval when intervalSeconds is 0", async () => {
    const flushFn = vi.fn(async () => {});
    vi.useFakeTimers();

    const scheduler = new FlushScheduler(flushFn, 0);
    scheduler.markDirty();

    await vi.advanceTimersByTimeAsync(5000);

    expect(flushFn).not.toHaveBeenCalled();
    scheduler.stop();
    vi.useRealTimers();
  });

  it("stop() prevents further automatic flushes", async () => {
    const flushFn = vi.fn(async () => {});
    vi.useFakeTimers();

    const scheduler = new FlushScheduler(flushFn, 1);
    scheduler.markDirty();
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(3000);

    expect(flushFn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
