/**
 * Config schema defaults and validation helpers for @atc/daemon.
 *
 * Provides typed default values and runtime validators for GlobalConfig and
 * ProfileConfig. These are used by the loader to fill gaps in partial config
 * files and to reject obviously broken values before the daemon boots.
 */

import type { GlobalConfig, ProfileConfig } from "../types.js";

/**
 * Default global configuration. Used when `config.json` is absent from the
 * atcDir, or when specific fields are omitted.
 */
export const GLOBAL_CONFIG_DEFAULTS: GlobalConfig = {
  defaultProfile: "default",
};

/**
 * Default per-profile configuration. Used when a profile's `config.json` is
 * absent or when specific fields are omitted.
 */
export const PROFILE_CONFIG_DEFAULTS: ProfileConfig = {
  port: 7700,
  host: "127.0.0.1",
  logLevel: "info",
  autoRecover: false,
  wsHeartbeatInterval: 15,
  stateFlushInterval: 30,
  adapter: {
    type: "claude-agent-sdk",
    config: {},
  },
};

/**
 * Returns `true` if `value` is a valid TCP port number (integer 1–65535).
 *
 * @param value - The value to check.
 */
export function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

/**
 * Returns `true` if `value` is one of the allowed log level strings.
 *
 * @param value - The value to check.
 */
export function isValidLogLevel(value: unknown): value is ProfileConfig["logLevel"] {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}

/**
 * Validates a raw partial profile config object, throwing a descriptive error
 * if any present field has an invalid type.
 *
 * @param raw - The raw object to validate.
 * @throws {Error} if any field has an unexpected type or out-of-range value.
 */
export function validatePartialProfileConfig(raw: Record<string, unknown>): void {
  if ("port" in raw && !isValidPort(raw["port"])) {
    throw new Error(
      `Invalid config: "port" must be an integer between 1 and 65535, got ${JSON.stringify(raw["port"])}`,
    );
  }

  if ("host" in raw && typeof raw["host"] !== "string") {
    throw new Error(`Invalid config: "host" must be a string, got ${typeof raw["host"]}`);
  }

  if ("logLevel" in raw && !isValidLogLevel(raw["logLevel"])) {
    throw new Error(
      `Invalid config: "logLevel" must be one of debug/info/warn/error, got ${JSON.stringify(raw["logLevel"])}`,
    );
  }

  if ("autoRecover" in raw && typeof raw["autoRecover"] !== "boolean") {
    throw new Error(
      `Invalid config: "autoRecover" must be a boolean, got ${typeof raw["autoRecover"]}`,
    );
  }

  if ("wsHeartbeatInterval" in raw && typeof raw["wsHeartbeatInterval"] !== "number") {
    throw new Error(
      `Invalid config: "wsHeartbeatInterval" must be a number, got ${typeof raw["wsHeartbeatInterval"]}`,
    );
  }

  if ("stateFlushInterval" in raw && typeof raw["stateFlushInterval"] !== "number") {
    throw new Error(
      `Invalid config: "stateFlushInterval" must be a number, got ${typeof raw["stateFlushInterval"]}`,
    );
  }

  if ("adapter" in raw) {
    const adapter = raw["adapter"];
    if (typeof adapter !== "object" || adapter === null) {
      throw new Error(`Invalid config: "adapter" must be an object, got ${typeof adapter}`);
    }
    const adapterObj = adapter as Record<string, unknown>;
    if ("type" in adapterObj && typeof adapterObj["type"] !== "string") {
      throw new Error(
        `Invalid config: "adapter.type" must be a string, got ${typeof adapterObj["type"]}`,
      );
    }
  }
}
