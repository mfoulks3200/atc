/**
 * Environment variable configuration for @airtrafficcontrol/daemon.
 *
 * Implements the 12-factor app config pattern: environment variables form the
 * highest-priority config layer, overriding file-based profile config.
 *
 * ## Supported Environment Variables
 *
 * | Variable        | Type                                   | Default              | Description                                      |
 * |-----------------|----------------------------------------|----------------------|--------------------------------------------------|
 * | ATC_PORT        | integer (1-65535)                      | 7700                 | TCP port the daemon HTTP/WS server binds to      |
 * | ATC_HOST        | string                                 | "127.0.0.1"          | Host/address the daemon binds to                 |
 * | ATC_LOG_LEVEL   | "debug"|"info"|"warn"|"error"          | "info"               | Fastify logger verbosity                         |
 * | ATC_STATE_DIR   | string (filesystem path)               | <profileDir>/state   | Override for agent/craft/tower state storage     |
 *
 * ## Priority Order
 *
 * Environment variables > profile config.json > built-in defaults
 *
 * ## Validation
 *
 * All values are validated with Zod on startup. Invalid values throw a
 * ConfigValidationError with a human-readable message identifying the
 * variable and the problem.
 */

import { z } from "zod";
import { ConfigValidationError } from "@airtrafficcontrol/errors";
import type { ProfileConfig } from "./schema.js";

/**
 * Zod schema for ATC daemon environment variables.
 *
 * Each field maps to a process.env key. All fields are optional — absent
 * vars are ignored and the lower-priority config layer is used instead.
 * String values are coerced to their target types (e.g., ATC_PORT to number).
 */
export const ENV_SCHEMA = z.object({
  ATC_PORT: z.coerce
    .number({
      invalid_type_error: 'ATC_PORT must be a valid integer (e.g. "7700")',
    })
    .int({ message: "ATC_PORT must be an integer, not a decimal" })
    .min(1, { message: "ATC_PORT must be between 1 and 65535" })
    .max(65535, { message: "ATC_PORT must be between 1 and 65535" })
    .optional(),
  ATC_HOST: z.string().min(1, { message: "ATC_HOST must not be empty" }).optional(),
  ATC_LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"], {
      errorMap: () => ({
        message: 'ATC_LOG_LEVEL must be one of "debug", "info", "warn", "error"',
      }),
    })
    .optional(),
  ATC_STATE_DIR: z
    .string()
    .min(1, { message: "ATC_STATE_DIR must not be empty" })
    .optional(),
});

/** Inferred TypeScript type from the env var Zod schema. */
export type EnvConfig = z.infer<typeof ENV_SCHEMA>;

/**
 * Resolved environment variable overrides for the daemon.
 *
 * profileOverrides is applied as the top priority layer over profile
 * config.json. stateDir, when set, overrides the default state directory
 * path derived from <profileDir>/state.
 */
export interface EnvOverrides {
  /**
   * Partial ProfileConfig values derived from env vars.
   * Only keys present in the environment are included; undefined keys are
   * absent (not spread) so they do not shadow lower-priority config layers.
   */
  profileOverrides: Partial<Pick<ProfileConfig, "port" | "host" | "logLevel">>;
  /**
   * Override for the daemon state directory (ATC_STATE_DIR).
   * undefined means use the default <profileDir>/state path.
   */
  stateDir: string | undefined;
}

/**
 * Reads ATC environment variable overrides from process.env, validates them
 * with Zod, and returns strongly-typed EnvOverrides.
 *
 * Only variables that are actually set in the environment are included in the
 * result — absent variables are not set in profileOverrides so they do not
 * override lower-priority config layers.
 *
 * @throws {ConfigValidationError} if any present env var has an invalid value.
 *   The error carries human-readable Zod issues identifying the variable and
 *   the problem.
 */
export function loadEnvOverrides(): EnvOverrides {
  const raw: Record<string, string | undefined> = {
    ATC_PORT: process.env["ATC_PORT"],
    ATC_HOST: process.env["ATC_HOST"],
    ATC_LOG_LEVEL: process.env["ATC_LOG_LEVEL"],
    ATC_STATE_DIR: process.env["ATC_STATE_DIR"],
  };

  // Strip undefined entries so Zod treats absent vars as optional-not-present
  // rather than coercing undefined to something unexpected.
  const defined = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined));

  const result = ENV_SCHEMA.safeParse(defined);
  if (!result.success) {
    throw new ConfigValidationError("profile", result.error.issues);
  }

  const profileOverrides: EnvOverrides["profileOverrides"] = {};
  if (result.data.ATC_PORT !== undefined) profileOverrides.port = result.data.ATC_PORT;
  if (result.data.ATC_HOST !== undefined) profileOverrides.host = result.data.ATC_HOST;
  if (result.data.ATC_LOG_LEVEL !== undefined) profileOverrides.logLevel = result.data.ATC_LOG_LEVEL;

  return { profileOverrides, stateDir: result.data.ATC_STATE_DIR };
}
