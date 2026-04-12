import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectConfigStore } from "./project-store.js";
import { PROJECT_METADATA_DEFAULTS } from "./schema.js";

describe("createProjectConfigStore", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    while (dirs.length > 0) {
      const d = dirs.pop()!;
      await rm(d, { recursive: true, force: true });
    }
  });

  it("wires the store to <projectDir>/metadata.json and channel 'config:project:<name>'", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "atc-project-"));
    dirs.push(projectDir);
    const publish = vi.fn();
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const store = createProjectConfigStore("my-project", projectDir, publish, logger);
    await store.load();

    const defaults = { ...PROJECT_METADATA_DEFAULTS, name: "my-project" };
    expect(store.get()).toEqual(defaults);

    await store.patch({ categories: ["frontend"] });
    const raw = JSON.parse(await readFile(join(projectDir, "metadata.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(raw).toEqual({ categories: ["frontend"] });
    expect(publish).toHaveBeenCalledWith(
      "config:project:my-project",
      expect.objectContaining({ source: "api" }),
    );
    await store.stop();
  });
});
