/**
 * Config loader for @airtrafficcontrol/daemon profile directories.
 *
 * The global config loader has moved to `LayeredConfigStore` (see
 * `./global-store.ts`). This module now only handles one-shot profile
 * reads used during daemon boot.
 *
 * Priority order for profile config:
 *   1. Environment variables (highest) — see {@link loadEnvOverrides}
 *   2. `<profileDir>/config.json` file
 *   3. Built-in defaults ({@link PROFILE_CONFIG_DEFAULTS})
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigValidationError } from "@airtrafficcontrol/errors";
import {
  PROFILE_CONFIG_DEFAULTS,
  PROFILE_CONFIG_SCHEMA,
  type ProfileConfig,
  type GlobalConfig,
} from "./schema.js";
import type { ProjectMetadata } from "../types.js";
import type { EnvOverrides } from "./env.js";

/**
 * Reads a JSON file and parses it, returning `null` if absent.
 * Propagates any error that is not ENOENT.
 */
async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const contents = await readFile(filePath, "utf-8");
    return JSON.parse(contents) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Returns the filesystem path for a named profile directory.
 *
 * @param atcDir - Path to the `.atc` directory.
 * @param profileName - Optional profile name; defaults to `"default"`.
 */
export function resolveProfilePath(atcDir: string, profileName?: string): string {
  return join(atcDir, "profiles", profileName ?? "default");
}

/**
 * Loads a profile config from `<profileDir>/config.json`, merges it with
 * defaults and optional environment variable overrides, then validates the
 * result using the Zod schema.
 *
 * Priority order (highest first):
 *   1. `envOverrides.profileOverrides` — values from `ATC_PORT`, `ATC_HOST`,
 *      `ATC_LOG_LEVEL` environment variables
 *   2. `<profileDir>/config.json` file values
 *   3. {@link PROFILE_CONFIG_DEFAULTS}
 *
 * @param profileDir - Path to the profile directory.
 * @param envOverrides - Pre-validated env var overrides from
 *   {@link loadEnvOverrides}. When omitted no env overrides are applied
 *   (useful for isolated unit tests).
 * @throws {ConfigValidationError} if any field has an invalid type or value.
 */
export async function loadProfileConfig(
  profileDir: string,
  envOverrides?: Pick<EnvOverrides, "profileOverrides">,
): Promise<ProfileConfig> {
  const raw = await readJsonFile(join(profileDir, "config.json"));

  const fileValues =
    raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  // Env overrides with undefined values filtered out so they do not shadow
  // lower-priority layers when a variable is absent from the environment.
  const envValues = Object.fromEntries(
    Object.entries(envOverrides?.profileOverrides ?? {}).filter(([, v]) => v !== undefined),
  );

  const candidate = {
    ...PROFILE_CONFIG_DEFAULTS,
    ...fileValues,
    ...envValues, // env vars win over file config
    adapter: {
      ...PROFILE_CONFIG_DEFAULTS.adapter,
      ...(fileValues["adapter"] && typeof fileValues["adapter"] === "object"
        ? (fileValues["adapter"] as Record<string, unknown>)
        : {}),
    },
  };

  const result = PROFILE_CONFIG_SCHEMA.safeParse(candidate);
  if (!result.success) {
    throw new ConfigValidationError("profile", result.error.issues);
  }
  return result.data;
}

/**
 * Loads project metadata from `<projectDir>/metadata.json`.
 * Throws if the file is missing.
 */
export async function loadProjectMetadata(projectDir: string): Promise<ProjectMetadata> {
  const filePath = join(projectDir, "metadata.json");
  const raw = await readJsonFile(filePath);
  if (raw === null) {
    throw new Error(`Missing required file: metadata.json not found in ${projectDir}`);
  }
  return raw as ProjectMetadata;
}

// Re-exported for callers that previously imported from loader.
export type { ProfileConfig, GlobalConfig };
