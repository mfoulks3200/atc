/**
 * Zod schemas and defaults for @airtrafficcontrol/daemon configuration tiers.
 *
 * These schemas are the single source of truth for both the runtime
 * shape of `GlobalConfig` / `ProfileConfig` and their validation.
 * Unknown top-level fields are preserved (passthrough) so manual edits
 * and cross-version config files survive round-trips through the
 * layered config store.
 */

import { z } from "zod";

/**
 * Schema for the top-level global daemon configuration persisted at
 * `<atcDir>/config.json`.
 */
export const GLOBAL_CONFIG_SCHEMA = z
  .object({
    defaultProfile: z.string(),
  })
  .passthrough();

/**
 * Schema for an adapter configuration block nested inside a profile.
 */
export const ADAPTER_CONFIG_SCHEMA = z.object({
  type: z.string(),
  config: z.record(z.unknown()),
});

/**
 * Schema for a single checklist step configuration.
 */
export const CHECKLIST_ITEM_CONFIG_SCHEMA = z.object({
  name: z.string(),
  command: z.string(),
  timeout: z.number().optional(),
});

/**
 * Schema for an MCP server configuration block.
 */
export const MCP_SERVER_CONFIG_SCHEMA = z.object({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string()).optional(),
});

/**
 * Schema for project-level metadata persisted at
 * `<profileDir>/projects/<name>/metadata.json`.
 *
 * @see RULE-CRAFT-1
 */
export const PROJECT_METADATA_SCHEMA = z
  .object({
    name: z.string(),
    remoteUrl: z.string(),
    categories: z.array(z.string()),
    checklist: z.array(CHECKLIST_ITEM_CONFIG_SCHEMA),
    mcpServers: z.record(MCP_SERVER_CONFIG_SCHEMA),
  })
  .passthrough();

/** Inferred TypeScript type for project metadata (from Zod). */
export type ProjectMetadataConfig = z.infer<typeof PROJECT_METADATA_SCHEMA>;

/**
 * Default project metadata. Used when a project's metadata.json is absent
 * or any field is omitted.
 */
export const PROJECT_METADATA_DEFAULTS: ProjectMetadataConfig = {
  name: "",
  remoteUrl: "",
  categories: [],
  checklist: [],
  mcpServers: {},
};

/**
 * Schema for a single profile's runtime configuration persisted at
 * `<profileDir>/config.json`.
 */
export const PROFILE_CONFIG_SCHEMA = z
  .object({
    port: z.number().int().min(1).max(65535),
    host: z.string(),
    logLevel: z.enum(["debug", "info", "warn", "error"]),
    autoRecover: z.boolean(),
    wsHeartbeatInterval: z.number(),
    stateFlushInterval: z.number(),
    adapter: ADAPTER_CONFIG_SCHEMA,
  })
  .passthrough();

/** Inferred TypeScript type for global config. */
export type GlobalConfig = z.infer<typeof GLOBAL_CONFIG_SCHEMA>;

/** Inferred TypeScript type for adapter config. */
export type AdapterConfig = z.infer<typeof ADAPTER_CONFIG_SCHEMA>;

/** Inferred TypeScript type for profile config. */
export type ProfileConfig = z.infer<typeof PROFILE_CONFIG_SCHEMA>;

/**
 * Default global configuration. Returned when `config.json` is absent from
 * `<atcDir>` or any field is omitted.
 */
export const GLOBAL_CONFIG_DEFAULTS: GlobalConfig = {
  defaultProfile: "default",
};

/**
 * Default per-profile configuration. Returned when a profile's `config.json`
 * is absent or any field is omitted.
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
