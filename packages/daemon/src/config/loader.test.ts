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
import { ConfigValidationError } from "@airtrafficcontrol/errors";
import { loadProfileConfig, loadProjectMetadata, resolveProfilePath } from "./loader.js";
import { PROFILE_CONFIG_DEFAULTS } from "./schema.js";
import type { EnvOverrides } from "./env.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "atc-daemon-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
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

  it("throws ConfigValidationError on invalid port type", async () => {
    const profileDir = join(tmpDir, "profiles", "bad");
    await mkdir(profileDir, { recursive: true });
    await writeFile(join(profileDir, "config.json"), JSON.stringify({ port: "not-a-number" }));
    await expect(loadProfileConfig(profileDir)).rejects.toBeInstanceOf(ConfigValidationError);
    try {
      await loadProfileConfig(profileDir);
      expect.fail("expected loadProfileConfig to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      expect((err as ConfigValidationError).scope).toBe("profile");
    }
  });
});

// ---------------------------------------------------------------------------
// loadProfileConfig — env var priority (env > file > default)
// ---------------------------------------------------------------------------

describe("loadProfileConfig with envOverrides", () => {
  function makeOverrides(
    partial: Partial<EnvOverrides["profileOverrides"]>,
  ): Pick<EnvOverrides, "profileOverrides"> {
    return { profileOverrides: partial };
  }

  it("env overrides win over file config", async () => {
    const profileDir = join(tmpDir, "profiles", "env-wins");
    await mkdir(profileDir, { recursive: true });
    await writeFile(join(profileDir, "config.json"), JSON.stringify({ port: 8080 }));
    const config = await loadProfileConfig(profileDir, makeOverrides({ port: 9999 }));
    expect(config.port).toBe(9999);
  });

  it("env overrides win over defaults when no file present", async () => {
    const profileDir = join(tmpDir, "profiles", "env-no-file");
    await mkdir(profileDir, { recursive: true });
    const config = await loadProfileConfig(profileDir, makeOverrides({ host: "0.0.0.0" }));
    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(PROFILE_CONFIG_DEFAULTS.port);
  });

  it("file config wins over defaults when no env override set", async () => {
    const profileDir = join(tmpDir, "profiles", "file-wins");
    await mkdir(profileDir, { recursive: true });
    await writeFile(join(profileDir, "config.json"), JSON.stringify({ logLevel: "debug" }));
    const config = await loadProfileConfig(profileDir, makeOverrides({}));
    expect(config.logLevel).toBe("debug");
  });

  it("unset env overrides do not shadow file values", async () => {
    const profileDir = join(tmpDir, "profiles", "no-shadow");
    await mkdir(profileDir, { recursive: true });
    await writeFile(join(profileDir, "config.json"), JSON.stringify({ port: 8181 }));
    // envOverrides has no port — file value should survive
    const config = await loadProfileConfig(profileDir, makeOverrides({ host: "0.0.0.0" }));
    expect(config.port).toBe(8181);
    expect(config.host).toBe("0.0.0.0");
  });

  it("all three layers stack correctly (env > file > default)", async () => {
    const profileDir = join(tmpDir, "profiles", "all-layers");
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      join(profileDir, "config.json"),
      JSON.stringify({ port: 8080, logLevel: "debug" }),
    );
    const config = await loadProfileConfig(profileDir, makeOverrides({ port: 9000 }));
    expect(config.port).toBe(9000); // env wins
    expect(config.logLevel).toBe("debug"); // file wins over default
    expect(config.host).toBe(PROFILE_CONFIG_DEFAULTS.host); // default
    expect(config.autoRecover).toBe(PROFILE_CONFIG_DEFAULTS.autoRecover); // default
  });

  it("env logLevel override is applied", async () => {
    const profileDir = join(tmpDir, "profiles", "env-loglevel");
    await mkdir(profileDir, { recursive: true });
    const config = await loadProfileConfig(profileDir, makeOverrides({ logLevel: "warn" }));
    expect(config.logLevel).toBe("warn");
  });

  it("omitting envOverrides uses file config only (backward compatibility)", async () => {
    const profileDir = join(tmpDir, "profiles", "no-env");
    await mkdir(profileDir, { recursive: true });
    await writeFile(join(profileDir, "config.json"), JSON.stringify({ port: 7777 }));
    const config = await loadProfileConfig(profileDir);
    expect(config.port).toBe(7777);
  });

  it("adapter in file config is preserved when env overrides other fields", async () => {
    const profileDir = join(tmpDir, "profiles", "adapter-preserved");
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      join(profileDir, "config.json"),
      JSON.stringify({ port: 8080, adapter: { type: "my-adapter", config: { key: "val" } } }),
    );
    const config = await loadProfileConfig(profileDir, makeOverrides({ port: 9090 }));
    expect(config.port).toBe(9090);
    expect(config.adapter.type).toBe("my-adapter");
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
