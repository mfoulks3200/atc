import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGlobalConfigStore } from "./global-store.js";
import { GLOBAL_CONFIG_DEFAULTS } from "./schema.js";

describe("createGlobalConfigStore", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    while (dirs.length > 0) {
      const d = dirs.pop()!;
      await rm(d, { recursive: true, force: true });
    }
  });

  it("wires the store to <atcDir>/config.json and channel 'config:global'", async () => {
    const atcDir = await mkdtemp(join(tmpdir(), "atc-global-"));
    dirs.push(atcDir);
    const publish = vi.fn();
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const store = createGlobalConfigStore(atcDir, publish, logger);
    await store.load();
    expect(store.get()).toEqual(GLOBAL_CONFIG_DEFAULTS);

    await store.replace({ ...GLOBAL_CONFIG_DEFAULTS, defaultProfile: "staging" });
    const raw = JSON.parse(
      await readFile(join(atcDir, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(raw).toEqual({ defaultProfile: "staging" });
    expect(publish).toHaveBeenCalledWith(
      "config:global",
      expect.objectContaining({ source: "api" }),
    );
    await store.stop();
  });
});
