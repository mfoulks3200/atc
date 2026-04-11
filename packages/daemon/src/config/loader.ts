/**
 * Config loader for @airtrafficcontrol/daemon profile directories.
 *
 * The global config loader has moved to `LayeredConfigStore` (see
 * `./global-store.ts`). This module now only handles one-shot profile
 * reads used during daemon boot.
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
 * defaults, and validates all present fields using the Zod schema.
 *
 * @param profileDir - Path to the profile directory.
 * @throws {ConfigValidationError} if any field has an invalid type or value.
 */
export async function loadProfileConfig(profileDir: string): Promise<ProfileConfig> {
  const raw = await readJsonFile(join(profileDir, "config.json"));
  if (raw === null || typeof raw !== "object") {
    return {
      ...PROFILE_CONFIG_DEFAULTS,
      adapter: { ...PROFILE_CONFIG_DEFAULTS.adapter },
    };
  }

  const candidate = {
    ...PROFILE_CONFIG_DEFAULTS,
    ...(raw as Record<string, unknown>),
    adapter: {
      ...PROFILE_CONFIG_DEFAULTS.adapter,
      ...((raw as Record<string, unknown>)["adapter"] &&
      typeof (raw as Record<string, unknown>)["adapter"] === "object"
        ? ((raw as Record<string, unknown>)["adapter"] as Record<string, unknown>)
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
