---
title: Configuration Reference
sidebar_label: Configuration
sidebar_position: 3
---

# Configuration Reference

This document enumerates every configuration option recognized by the ATC
daemon. Configuration is layered into three scopes: **global**, **project**
(per-profile), and **agent**. Each scope has its own backing JSON file and is
loaded by `LayeredConfigStore` (see
`packages/daemon/src/config/layered-store.ts`), which persists only the sparse
diff against defaults and broadcasts change events on a pub/sub channel.

The canonical schemas and defaults live in
`packages/daemon/src/config/schema.ts`. Project metadata (per-project, not
per-profile) lives alongside the profile and is defined in
`packages/daemon/src/types.ts`.

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

## Project Settings {#project-settings}

ATC distinguishes two file-backed configurations at the project tier:

1. **Profile config** — per-profile daemon runtime settings persisted at
   `<profileDir>/config.json`. Loaded once at boot by `loadProfileConfig`
   (`packages/daemon/src/config/loader.ts`). Schema is `PROFILE_CONFIG_SCHEMA`
   with passthrough enabled.
2. **Project metadata** — per-project descriptors persisted at
   `<projectDir>/metadata.json`. Loaded by `loadProjectMetadata`
   (`packages/daemon/src/config/loader.ts`). Type is `ProjectMetadata`
   (`packages/daemon/src/types.ts`).

The `ConfigScope` enum in `packages/errors/src/config.ts` reserves a `project`
scope, but no `LayeredConfigStore` for it has been wired yet — project
metadata is read-only at boot.

### Profile config (`<profileDir>/config.json`)

#### `port` {#profile-port}

- **Type:** `number` (integer, 1-65535)
- **Default:** `7700`
- **Description:** TCP port the Fastify HTTP/WebSocket server listens on.
- **Defined in:** `packages/daemon/src/config/schema.ts`
  (`PROFILE_CONFIG_DEFAULTS`)

#### `host` {#profile-host}

- **Type:** `string`
- **Default:** `"127.0.0.1"`
- **Description:** Host interface the daemon binds to. Use `"0.0.0.0"` to
  accept connections on all interfaces.
- **Defined in:** `packages/daemon/src/config/schema.ts`

#### `logLevel` {#profile-logLevel}

- **Type:** `"debug" | "info" | "warn" | "error"`
- **Default:** `"info"`
- **Description:** Minimum severity of log records the daemon emits.
- **Defined in:** `packages/daemon/src/config/schema.ts`

#### `autoRecover` {#profile-autoRecover}

- **Type:** `boolean`
- **Default:** `false`
- **Description:** Whether the daemon attempts to resume previously running
  agents and crafts on start.
- **Defined in:** `packages/daemon/src/config/schema.ts`

#### `wsHeartbeatInterval` {#profile-wsHeartbeatInterval}

- **Type:** `number` (seconds)
- **Default:** `15`
- **Description:** Interval between WebSocket heartbeat pings sent to
  connected clients. See
  `packages/daemon/src/server/websocket/heartbeat.ts`.
- **Defined in:** `packages/daemon/src/config/schema.ts`

#### `stateFlushInterval` {#profile-stateFlushInterval}

- **Type:** `number` (seconds)
- **Default:** `30`
- **Description:** Interval at which in-memory daemon state stores flush to
  their backing JSON files (see `packages/daemon/src/state/persistence.ts`).
- **Defined in:** `packages/daemon/src/config/schema.ts`

#### `adapter` {#profile-adapter}

- **Type:** `{ type: string; config: Record<string, unknown> }`
- **Default:** `{ type: "claude-agent-sdk", config: {} }`
- **Description:** Selects which agent adapter the daemon uses to spawn
  pilots, plus an opaque adapter-specific config bag passed through to the
  adapter at construction. Validated by `ADAPTER_CONFIG_SCHEMA`.
- **Defined in:** `packages/daemon/src/config/schema.ts`
- **Used in:** `packages/daemon/src/adapters/registry.ts`

### Project metadata (`<projectDir>/metadata.json`)

`ProjectMetadata` is required and has no defaults — `loadProjectMetadata`
throws if the file is missing.

#### `name` {#project-name}

- **Type:** `string`
- **Default:** _required_
- **Description:** Human-readable project name.
- **Defined in:** `packages/daemon/src/types.ts`

#### `remoteUrl` {#project-remoteUrl}

- **Type:** `string`
- **Default:** _required_
- **Description:** Git remote URL for the project repository. Used by the
  bare-repo and worktree git utilities (`packages/daemon/src/git/`).

#### `categories` {#project-categories}

- **Type:** `string[]`
- **Default:** _required_
- **Description:** Category tags used to match incoming crafts to this
  project.

#### `checklist` {#project-checklist}

- **Type:** `ChecklistItemConfig[]` — each item is
  `{ name: string; command: string; timeout?: number }`
- **Default:** _required_
- **Description:** Ordered shell commands the tower runs as the landing
  checklist before merging a craft. `timeout` is in milliseconds. See
  `packages/daemon/src/checklist/runner.ts` and RULE-LCHK-4.

#### `mcpServers` {#project-mcpServers}

- **Type:** `Record<string, McpServerConfig>` — each entry is
  `{ command: string; args: string[]; env?: Record<string, string> }`
- **Default:** _required_ (may be an empty object)
- **Description:** Named MCP (Model Context Protocol) server processes
  available to agents working on this project.

## Agent Settings {#agent-settings}

There is currently no file-backed agent configuration store. The
`ConfigScope` enum in `packages/errors/src/config.ts` reserves an `agent`
scope, but no schema, defaults, or `LayeredConfigStore` instance for it has
been wired in the daemon. Adapter-specific agent options are passed through
the profile-level [`adapter.config`](#profile-adapter) bag.

The closest analogue to per-agent configuration is `PilotRecord`
(`packages/daemon/src/types.ts`), which carries `certifications` and
`mcpServers` per pilot. Pilot records are persisted by `PilotStore`
(`packages/daemon/src/state/pilot-store.ts`) to `<stateDir>/pilots.json`
using the same atomic-write pattern as agents and crafts. They are loaded
on daemon startup and flushed on the periodic state flush interval and on
graceful shutdown.
