import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { LayeredConfigStore } from "./layered-store.js";

const SCHEMA = z.object({ name: z.string(), count: z.number().int() }).passthrough();
type Cfg = z.infer<typeof SCHEMA>;
const DEFAULTS: Cfg = { name: "alice", count: 0 };

async function boot(initial?: Record<string, unknown>) {
  const dir = await mkdtemp(join(tmpdir(), "atc-layered-watch-"));
  const filePath = join(dir, "config.json");
  if (initial !== undefined) {
    await writeFile(filePath, JSON.stringify(initial, null, 2), "utf8");
  } else {
    await writeFile(filePath, "{}", "utf8");
  }
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const publish = vi.fn();
  const store = new LayeredConfigStore<Cfg>({
    schema: SCHEMA,
    defaults: DEFAULTS,
    filePath,
    channel: "config:test",
    scope: "global",
    publish,
    logger,
    watchDebounceMs: 20,
  });
  await store.load();
  store.start();
  return { store, dir, filePath, logger, publish };
}

async function waitForChange(store: LayeredConfigStore<Cfg>): Promise<Cfg> {
  return new Promise((resolve) => {
    const listener = (merged: Cfg) => {
      resolve(merged);
    };
    store.on("change", listener);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("LayeredConfigStore — file watching", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    while (dirs.length > 0) {
      const d = dirs.pop()!;
      await rm(d, { recursive: true, force: true });
    }
  });

  it("reloads when the file is edited externally", async () => {
    const { store, dir, filePath } = await boot();
    dirs.push(dir);
    const waiter = waitForChange(store);
    await writeFile(filePath, JSON.stringify({ count: 9 }), "utf8");
    const merged = await waiter;
    await store.stop();
    expect(merged).toEqual({ name: "alice", count: 9 });
  });

  it("does not re-emit for self-written files", async () => {
    const { store, dir, publish } = await boot();
    dirs.push(dir);
    publish.mockClear();
    await store.replace({ name: "alice", count: 5 });
    await sleep(60);
    await store.stop();
    // Exactly one publish — the one from replace(). No echo.
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[1]).toMatchObject({ source: "api" });
  });

  it("debounces rapid external writes into one event", async () => {
    const { store, dir, filePath, publish } = await boot();
    dirs.push(dir);
    publish.mockClear();
    await writeFile(filePath, JSON.stringify({ count: 1 }), "utf8");
    await writeFile(filePath, JSON.stringify({ count: 2 }), "utf8");
    await writeFile(filePath, JSON.stringify({ count: 3 }), "utf8");
    await sleep(80);
    await store.stop();
    const fileEvents = publish.mock.calls.filter(
      (c) => (c[1] as { source: string }).source === "file",
    );
    expect(fileEvents.length).toBeLessThanOrEqual(1);
    expect(store.get().count).toBe(3);
  });

  it("reverts to defaults when the file is deleted", async () => {
    const { store, dir, filePath } = await boot({ count: 7 });
    dirs.push(dir);
    const waiter = waitForChange(store);
    await unlink(filePath);
    const merged = await waiter;
    await store.stop();
    expect(merged).toEqual(DEFAULTS);
  });

  it("emits invalid_external_edit on bad input without mutating state", async () => {
    const { store, dir, filePath } = await boot({ count: 1 });
    dirs.push(dir);
    const invalid = vi.fn();
    store.on("invalid_external_edit", invalid);
    await writeFile(filePath, JSON.stringify({ count: "nope" }), "utf8");
    await sleep(80);
    await store.stop();
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ name: "alice", count: 1 });
  });

  it("warns once and preserves unknown keys added externally", async () => {
    const { store, dir, filePath, logger } = await boot({ count: 1 });
    dirs.push(dir);
    const waiter = waitForChange(store);
    await writeFile(filePath, JSON.stringify({ count: 2, mystery: "kept" }), "utf8");
    await waiter;
    await store.stop();
    expect(logger.warn.mock.calls.some((c) => String(c[0]).includes("mystery"))).toBe(true);
    expect(store.getOverrides()).toMatchObject({ count: 2, mystery: "kept" });
  });
});
