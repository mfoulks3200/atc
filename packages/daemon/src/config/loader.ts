/**
 * Config and metadata loader for @atc/daemon.
 *
 * Handles reading JSON files from the filesystem, merging with defaults, and
 * validating types. All functions are async and safe to call at daemon startup.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GlobalConfig, ProfileConfig, ProjectMetadata } from "../types.js";
import {
  GLOBAL_CONFIG_DEFAULTS,
  PROFILE_CONFIG_DEFAULTS,
  validatePartialProfileConfig,
} from "./schema.js";

/**
 * Reads a JSON file and parses it, returning `null` if the file does not exist.
 * Propagates any error that is not `ENOENT`.
 *
 * @param filePath - Absolute path to the JSON file.
 * @returns The parsed value, or `null` if the file is absent.
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
 * Loads the global daemon configuration from `<atcDir>/config.json`.
 * Returns the defaults if the file is missing.
 *
 * @param atcDir - Path to the `.atc` directory.
 */
export async function loadGlobalConfig(atcDir: string): Promise<GlobalConfig> {
  const raw = await readJsonFile(join(atcDir, "config.json"));
  if (raw === null || typeof raw !== "object") {
    return { ...GLOBAL_CONFIG_DEFAULTS };
  }
  const obj = raw as Record<string, unknown>;
  return {
    defaultProfile:
      typeof obj["defaultProfile"] === "string"
        ? obj["defaultProfile"]
        : GLOBAL_CONFIG_DEFAULTS.defaultProfile,
  };
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
 * defaults, and validates all present fields.
 *
 * @param profileDir - Path to the profile directory.
 * @throws {Error} if any field in the config file has an invalid type.
 */
export async function loadProfileConfig(profileDir: string): Promise<ProfileConfig> {
  const raw = await readJsonFile(join(profileDir, "config.json"));
  if (raw === null || typeof raw !== "object") {
    return { ...PROFILE_CONFIG_DEFAULTS, adapter: { ...PROFILE_CONFIG_DEFAULTS.adapter } };
  }
  const obj = raw as Record<string, unknown>;
  validatePartialProfileConfig(obj);
  return {
    ...PROFILE_CONFIG_DEFAULTS,
    ...obj,
    adapter: {
      ...PROFILE_CONFIG_DEFAULTS.adapter,
      ...(typeof obj["adapter"] === "object" && obj["adapter"] !== null
        ? (obj["adapter"] as Record<string, unknown>)
        : {}),
    },
  } as ProfileConfig;
}

/**
 * Loads project metadata from `<projectDir>/metadata.json`.
 * Throws if the file is missing — a project without metadata is not a valid
 * registered project.
 *
 * @param projectDir - Path to the project directory.
 * @throws {Error} if `metadata.json` is not found.
 */
export async function loadProjectMetadata(projectDir: string): Promise<ProjectMetadata> {
  const filePath = join(projectDir, "metadata.json");
  const raw = await readJsonFile(filePath);
  if (raw === null) {
    throw new Error(`Missing required file: metadata.json not found in ${projectDir}`);
  }
  return raw as ProjectMetadata;
}
