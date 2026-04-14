---
title: Configuration Reference
sidebar_label: Configuration
sidebar_position: 3
---

# Configuration Reference

This document enumerates every configuration option recognized by the ATC
daemon. Configuration is layered into four scopes: **global**, **profile**,
**project**, and **pilot**. Most scopes have their own backing JSON file
loaded by `LayeredConfigStore` (see
`packages/daemon/src/config/layered-store.ts`), which persists only the sparse
diff against defaults and broadcasts change events on a pub/sub channel. Pilot
configuration is currently in-memory only and will be upgraded to a
`LayeredConfigStore` once pilot-config persistence lands (see the roadmap).

The canonical schemas and defaults live in
`packages/daemon/src/config/schema.ts`.

## Global Settings {#global-settings}

Global config is persisted at `<atcDir>/config.json` (typically
`~/.atc/config.json`). Loaded by `createGlobalConfigStore` in
`packages/daemon/src/config/global-store.ts`. Mutated via the
`/api/v1/config/global` REST routes
(`packages/daemon/src/server/routes/config.ts`) or the `config:global`
WebSocket channel. Schema is `GLOBAL_CONFIG_SCHEMA` with passthrough enabled,
so unknown top-level fields are preserved across writes.

### `defaultProfile` {#global-defaultProfile}

- **Type:** `string`
- **Default:** `"default"`
- **Description:** Name of the profile the daemon loads when no profile
  argument is supplied on the command line. The profile directory is resolved
  by `resolveProfilePath` as `<atcDir>/profiles/<defaultProfile>`.
- **Defined in:** `packages/daemon/src/config/schema.ts`
  (`GLOBAL_CONFIG_DEFAULTS`)
- **Used in:** `packages/daemon/src/config/loader.ts`
  (`resolveProfilePath`), `packages/daemon/src/start.ts`

## Profile Settings {#profile-settings}

Profile config is per-profile daemon runtime settings persisted at
`<profileDir>/config.json`. Loaded once at boot by `loadProfileConfig`
(`packages/daemon/src/config/loader.ts`). Schema is `PROFILE_CONFIG_SCHEMA`
with passthrough enabled. Profile config is currently read-only at runtime —
mutations require a daemon restart.

### `port` {#profile-port}

- **Type:** `number` (integer, 1-65535)
- **Default:** `7700`
- **Description:** TCP port the Fastify HTTP/WebSocket server listens on.
- **Defined in:** `packages/daemon/src/config/schema.ts`
  (`PROFILE_CONFIG_DEFAULTS`)

### `host` {#profile-host}

- **Type:** `string`
- **Default:** `"127.0.0.1"`
- **Description:** Host interface the daemon binds to. Use `"0.0.0.0"` to
  accept connections on all interfaces.
- **Defined in:** `packages/daemon/src/config/schema.ts`

### `logLevel` {#profile-logLevel}

- **Type:** `"debug" | "info" | "warn" | "error"`
- **Default:** `"info"`
- **Description:** Minimum severity of log records the daemon emits.
- **Defined in:** `packages/daemon/src/config/schema.ts`

### `autoRecover` {#profile-autoRecover}

- **Type:** `boolean`
- **Default:** `false`
- **Description:** Whether the daemon attempts to resume previously running
  agents and crafts on start.
- **Defined in:** `packages/daemon/src/config/schema.ts`

### `wsHeartbeatInterval` {#profile-wsHeartbeatInterval}

- **Type:** `number` (seconds)
- **Default:** `15`
- **Description:** Interval between WebSocket heartbeat pings sent to
  connected clients. See
  `packages/daemon/src/server/websocket/heartbeat.ts`.
- **Defined in:** `packages/daemon/src/config/schema.ts`

### `stateFlushInterval` {#profile-stateFlushInterval}

- **Type:** `number` (seconds)
- **Default:** `30`
- **Description:** Interval at which in-memory daemon state stores flush to
  their backing JSON files (see `packages/daemon/src/state/persistence.ts`).
- **Defined in:** `packages/daemon/src/config/schema.ts`

### `adapter` {#profile-adapter}

- **Type:** `{ type: string; config: Record<string, unknown> }`
- **Default:** `{ type: "claude-agent-sdk", config: {} }`
- **Description:** Selects which agent adapter the daemon uses to spawn
  pilots, plus an opaque adapter-specific config bag passed through to the
  adapter at construction. Validated by `ADAPTER_CONFIG_SCHEMA`.
- **Defined in:** `packages/daemon/src/config/schema.ts`
- **Used in:** `packages/daemon/src/adapters/registry.ts`

## Project Settings {#project-settings}

Project metadata is per-project descriptors persisted at
`<projectDir>/metadata.json`. Each registered project gets its own
`LayeredConfigStore<ProjectMetadataConfig>` (see
`createProjectConfigStore` in `packages/daemon/src/config/project-store.ts`)
which atomically persists sparse overrides, watches the file for external
edits, and broadcasts changes on the `config:project:<name>` channel. The
daemon loads one store per project at startup and creates a new one on
`POST /api/v1/projects`. Schema is `PROJECT_METADATA_SCHEMA` with passthrough
enabled.

Mutated via the `/api/v1/projects/:name/config` REST routes
(`packages/daemon/src/server/routes/project-config.ts`) or via the WebSocket
handler with `scope: "project"`.

### `name` {#project-name}

- **Type:** `string`
- **Default:** `""` (seeded with the project name when the store is
  created via `createProjectConfigStore(projectName, ...)`)
- **Description:** Human-readable project name. Preserved across PATCH
  mutations.
- **Defined in:** `packages/daemon/src/config/schema.ts`
  (`PROJECT_METADATA_DEFAULTS`)

### `remoteUrl` {#project-remoteUrl}

- **Type:** `string`
- **Default:** `""`
- **Description:** Git remote URL for the project repository. Used by the
  bare-repo and worktree git utilities (`packages/daemon/src/git/`).

### `categories` {#project-categories}

- **Type:** `string[]`
- **Default:** `[]`
- **Description:** Category tags used to match incoming crafts to this
  project.

### `checklist` {#project-checklist}

- **Type:** `ChecklistItemConfig[]` — each item is
  `{ name: string; command: string; timeout?: number }`
- **Default:** `[]`
- **Description:** Ordered shell commands the tower runs as the landing
  checklist before merging a craft. `timeout` is in milliseconds. See
  `packages/daemon/src/checklist/runner.ts` and RULE-LCHK-4.

### `mcpServers` {#project-mcpServers}

- **Type:** `Record<string, McpServerConfig>` — each entry is
  `{ command: string; args: string[]; env?: Record<string, string> }`
- **Default:** `{}`
- **Description:** Named MCP (Model Context Protocol) server processes
  available to agents working on this project.

## Pilot Settings {#pilot-settings}

Per-pilot configuration is held in an in-memory `PilotConfigStore`
(`packages/daemon/src/config/pilot-config-store.ts`) keyed by pilot id. It
provides the same `get`/`getOverrides`/`patch`/`replace`/`unset` surface as
`LayeredConfigStore` so REST routes and the WebSocket handler can treat it
interchangeably, but it has no file backing yet — overrides are lost on
daemon restart. Once pilot-config persistence is implemented (see the
roadmap), this store will be upgraded to a `LayeredConfigStore<PilotConfig>`
per pilot.

Mutated via the `/api/v1/projects/:name/pilots/:id/config` REST routes
(`packages/daemon/src/server/routes/pilot-config.ts`) or via the WebSocket
handler with `scope: "pilot"`. Changes broadcast on the `config:pilot:<id>`
channel. Schema is `PILOT_CONFIG_SCHEMA` with passthrough enabled.

Note: the daemon separately persists `PilotRecord` (pilot identity, including
`identifier`, `certifications`, `mcpServers`) via `PilotStore`
(`packages/daemon/src/state/pilot-store.ts`). `PilotConfig` is the mutable
operational configuration layered on top of that identity record.

### `certifications` {#pilot-certifications}

- **Type:** `string[]`
- **Default:** `[]`
- **Description:** Craft categories the pilot is certified to captain or
  first-officer. Used by `canHoldControls` / `isPilotCertified` (RULE-PILOT-2,
  RULE-SEAT-2).
- **Defined in:** `packages/daemon/src/config/schema.ts`
  (`PILOT_CONFIG_DEFAULTS`)

### `mcpServers` {#pilot-mcpServers}

- **Type:** `Record<string, McpServerConfig>`
- **Default:** `{}`
- **Description:** Pilot-specific MCP server configurations layered on top of
  any project-level MCP servers.

### `skills` {#pilot-skills}

- **Type:** `string[]`
- **Default:** `[]`
- **Description:** Assigned skill identifiers for this pilot. Placeholder for
  the Skills roadmap — not yet consumed by the adapter.

## Agent Settings {#agent-settings}

There is currently no file-backed per-agent configuration store. The
`ConfigScope` enum in `packages/errors/src/config.ts` reserves an `agent`
scope but no schema, defaults, or `LayeredConfigStore` instance for it has
been wired in the daemon. Adapter-specific agent options are passed through
the profile-level [`adapter.config`](#profile-adapter) bag.

Per-pilot configuration (see [Pilot Settings](#pilot-settings)) is the
closest analogue to per-agent configuration and is how operational options
are scoped to individual pilots today.
