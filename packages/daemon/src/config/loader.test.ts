/**
 * Tests for config loader functions.
 *
 * Uses a real temporary filesystem (mkdtemp) — because mocking fs is how you
 * end up with tests that pass and a production config that explodes on startup.
 */

import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadGlobalConfig,
  loadProfileConfig,
  loadProjectMetadata,
  resolveProfilePath,
} from "./loader.js";
import { PROFILE_CONFIG_DEFAULTS } from "./schema.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "atc-daemon-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// loadGlobalConfig
// ---------------------------------------------------------------------------

describe("loadGlobalConfig", () => {
  it("loads a valid config.json from atcDir", async () => {
    await writeFile(
      join(tmpDir, "config.json"),
      JSON.stringify({ defaultProfile: "production" }),
    );
    const config = await loadGlobalConfig(tmpDir);
    expect(config.defaultProfile).toBe("production");
  });

  it("returns defaults when config.json is missing", async () => {
    const config = await loadGlobalConfig(tmpDir);
    expect(config.defaultProfile).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// resolveProfilePath
// ---------------------------------------------------------------------------

describe("resolveProfilePath", () => {
  it("resolves to the default profile path when no name given", () => {
    const result = resolveProfilePath(tmpDir);
    expect(result).toBe(join(tmpDir, "profiles", "default"));
  });

  it("resolves to a named profile path", () => {
    const result = resolveProfilePath(tmpDir, "production");
    expect(result).toBe(join(tmpDir, "profiles", "production"));
  });
});

// ---------------------------------------------------------------------------
// loadProfileConfig
// ---------------------------------------------------------------------------

describe("loadProfileConfig", () => {
  it("loads config.json and merges with defaults", async () => {
    const profileDir = join(tmpDir, "profiles", "default");
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      join(profileDir, "config.json"),
      JSON.stringify({ port: 8080, logLevel: "debug" }),
    );
    const config = await loadProfileConfig(profileDir);
    expect(config.port).toBe(8080);
    expect(config.logLevel).toBe("debug");
    // fields not in the file should come from defaults
    expect(config.host).toBe(PROFILE_CONFIG_DEFAULTS.host);
    expect(config.autoRecover).toBe(PROFILE_CONFIG_DEFAULTS.autoRecover);
  });

  it("returns all defaults when config.json is missing", async () => {
    const profileDir = join(tmpDir, "profiles", "missing");
    await mkdir(profileDir, { recursive: true });
    const config = await loadProfileConfig(profileDir);
    expect(config).toEqual(PROFILE_CONFIG_DEFAULTS);
  });

  it("throws on invalid port type", async () => {
    const profileDir = join(tmpDir, "profiles", "bad");
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      join(profileDir, "config.json"),
      JSON.stringify({ port: "not-a-number" }),
    );
    await expect(loadProfileConfig(profileDir)).rejects.toThrow(/port/);
  });
});

// ---------------------------------------------------------------------------
// loadProjectMetadata
// ---------------------------------------------------------------------------

describe("loadProjectMetadata", () => {
  it("loads from metadata.json in projectDir", async () => {
    const metadata = {
      name: "my-project",
      remoteUrl: "git@github.com:org/repo.git",
      categories: ["backend"],
      checklist: [{ name: "build", command: "pnpm run build" }],
      mcpServers: {},
    };
    await writeFile(join(tmpDir, "metadata.json"), JSON.stringify(metadata));
    const result = await loadProjectMetadata(tmpDir);
    expect(result.name).toBe("my-project");
    expect(result.remoteUrl).toBe("git@github.com:org/repo.git");
    expect(result.categories).toEqual(["backend"]);
  });

  it("throws when metadata.json is missing", async () => {
    await expect(loadProjectMetadata(tmpDir)).rejects.toThrow(/metadata\.json/);
  });
});
