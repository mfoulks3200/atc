import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ConfigValidationError, UnknownConfigKeyError } from "@atc/errors";
import { LayeredConfigStore } from "./layered-store.js";

const TEST_SCHEMA = z
  .object({
    name: z.string(),
    count: z.number().int(),
    flag: z.boolean(),
  })
  .passthrough();

type TestConfig = z.infer<typeof TEST_SCHEMA>;

const TEST_DEFAULTS: TestConfig = { name: "alice", count: 0, flag: false };

async function makeStore(initial?: Record<string, unknown>) {
  const dir = await mkdtemp(join(tmpdir(), "atc-layered-"));
  const filePath = join(dir, "config.json");
  if (initial !== undefined) {
    await writeFile(filePath, JSON.stringify(initial, null, 2), "utf8");
  }
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const publish = vi.fn();
  const store = new LayeredConfigStore<TestConfig>({
    schema: TEST_SCHEMA,
    defaults: TEST_DEFAULTS,
    filePath,
    channel: "config:test",
    scope: "global",
    publish,
    logger,
  });
  return { store, dir, filePath, logger, publish };
}

describe("LayeredConfigStore — load()", () => {
  let cleanup: string[] = [];
  afterEach(async () => {
    for (const d of cleanup) await rm(d, { recursive: true, force: true });
    cleanup = [];
  });

  it("returns defaults when the file is absent", async () => {
    const { store, dir } = await makeStore();
    cleanup.push(dir);
    await store.load();
    expect(store.get()).toEqual(TEST_DEFAULTS);
    expect(store.getOverrides()).toEqual({});
  });

  it("merges a partial file with defaults", async () => {
    const { store, dir } = await makeStore({ count: 7 });
    cleanup.push(dir);
    await store.load();
    expect(store.get()).toEqual({ name: "alice", count: 7, flag: false });
    expect(store.getOverrides()).toEqual({ count: 7 });
  });

  it("preserves unknown fields and warns once", async () => {
    const { store, dir, logger } = await makeStore({ count: 1, mystery: "kept" });
    cleanup.push(dir);
    await store.load();
    expect(store.get()).toEqual({ name: "alice", count: 1, flag: false });
    expect(store.getOverrides()).toEqual({ count: 1, mystery: "kept" });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect((logger.warn.mock.calls[0]?.[0] ?? "") as string).toContain("mystery");
  });

  it("throws ConfigValidationError on invalid file contents", async () => {
    const { store, dir } = await makeStore({ count: "not-a-number" });
    cleanup.push(dir);
    await expect(store.load()).rejects.toBeInstanceOf(ConfigValidationError);
  });

  it("emits a change event with source 'init' on load", async () => {
    const { store, dir } = await makeStore({ count: 3 });
    cleanup.push(dir);
    const listener = vi.fn();
    store.on("change", listener);
    await store.load();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[1]).toBe("init");
  });
});

describe("LayeredConfigStore — replace()", () => {
  let cleanup: string[] = [];
  afterEach(async () => {
    for (const d of cleanup) await rm(d, { recursive: true, force: true });
    cleanup = [];
  });

  it("writes an empty overrides file when input matches defaults exactly", async () => {
    const { store, dir, filePath } = await makeStore();
    cleanup.push(dir);
    await store.load();
    await store.replace({ ...TEST_DEFAULTS });
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({});
  });

  it("persists only fields that differ from defaults", async () => {
    const { store, dir, filePath } = await makeStore();
    cleanup.push(dir);
    await store.load();
    await store.replace({ name: "alice", count: 42, flag: true });
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({ count: 42, flag: true });
    expect(store.get()).toEqual({ name: "alice", count: 42, flag: true });
  });

  it("throws ConfigValidationError on invalid input and does not touch disk", async () => {
    const { store, dir, filePath } = await makeStore({ count: 5 });
    cleanup.push(dir);
    await store.load();
    await expect(
      store.replace({ name: "bob", count: 1.5 as unknown as number, flag: false }),
    ).rejects.toBeInstanceOf(ConfigValidationError);
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({ count: 5 });
  });

  it("preserves unknown keys from prior file state through API writes", async () => {
    const { store, dir, filePath } = await makeStore({ mystery: "kept" });
    cleanup.push(dir);
    await store.load();
    await store.replace({ name: "alice", count: 2, flag: false });
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({ count: 2, mystery: "kept" });
  });

  it("emits one change event with source 'api' and publishes on the channel", async () => {
    const { store, dir, publish } = await makeStore();
    cleanup.push(dir);
    await store.load();
    const listener = vi.fn();
    store.on("change", listener);
    await store.replace({ name: "alice", count: 5, flag: false });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[1]).toBe("api");
    expect(publish).toHaveBeenCalledWith(
      "config:test",
      expect.objectContaining({
        config: { name: "alice", count: 5, flag: false },
        source: "api",
      }),
    );
  });
});

describe("LayeredConfigStore — patch()", () => {
  let cleanup: string[] = [];
  afterEach(async () => {
    for (const d of cleanup) await rm(d, { recursive: true, force: true });
    cleanup = [];
  });

  it("merges partial into current state", async () => {
    const { store, dir, filePath } = await makeStore({ count: 5 });
    cleanup.push(dir);
    await store.load();
    await store.patch({ flag: true });
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({ count: 5, flag: true });
    expect(store.get()).toEqual({ name: "alice", count: 5, flag: true });
  });

  it("drops a field from disk when the patch brings it back to default", async () => {
    const { store, dir, filePath } = await makeStore({ count: 9, flag: true });
    cleanup.push(dir);
    await store.load();
    await store.patch({ count: 0 });
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({ flag: true });
    expect(store.get().count).toBe(0);
  });

  it("throws ConfigValidationError on an invalid partial", async () => {
    const { store, dir } = await makeStore();
    cleanup.push(dir);
    await store.load();
    await expect(store.patch({ count: "nope" as unknown as number })).rejects.toBeInstanceOf(
      ConfigValidationError,
    );
  });
});

describe("LayeredConfigStore — unset()", () => {
  let cleanup: string[] = [];
  afterEach(async () => {
    for (const d of cleanup) await rm(d, { recursive: true, force: true });
    cleanup = [];
  });

  it("reverts an overridden key to default", async () => {
    const { store, dir, filePath } = await makeStore({ count: 99 });
    cleanup.push(dir);
    await store.load();
    await store.unset("count");
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({});
    expect(store.get().count).toBe(0);
  });

  it("is a no-op but still emits a change event when the key is already at default", async () => {
    const { store, dir } = await makeStore();
    cleanup.push(dir);
    await store.load();
    const listener = vi.fn();
    store.on("change", listener);
    await store.unset("flag");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get().flag).toBe(false);
  });

  it("throws UnknownConfigKeyError for a key not in the schema", async () => {
    const { store, dir } = await makeStore();
    cleanup.push(dir);
    await store.load();
    await expect(
      store.unset("nope" as unknown as keyof TestConfig & string),
    ).rejects.toBeInstanceOf(UnknownConfigKeyError);
  });
});
