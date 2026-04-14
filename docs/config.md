# ATC Configuration Reference

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

<h2 id="global-settings">Global Settings</h2>

Global config is persisted at `<atcDir>/config.json` (typically
`~/.atc/config.json`). Loaded by `createGlobalConfigStore` in
`packages/daemon/src/config/global-store.ts`. Mutated via the
`/api/v1/config/global` REST routes
(`packages/daemon/src/server/routes/config.ts`) or the `config:global`
WebSocket channel. Schema is `GLOBAL_CONFIG_SCHEMA` with passthrough enabled,
so unknown top-level fields are preserved across writes.

<h3 id="global-defaultProfile">defaultProfile</h3>

- **Type:** `string`
- **Default:** `"default"`
- **Description:** Name of the profile the daemon loads when no profile
  argument is supplied on the command line. The profile directory is resolved
  by `resolveProfilePath` as `<atcDir>/profiles/<defaultProfile>`.
- **Defined in:** `packages/daemon/src/config/schema.ts`
  (`GLOBAL_CONFIG_DEFAULTS`)
- **Used in:** `packages/daemon/src/config/loader.ts`
  (`resolveProfilePath`), `packages/daemon/src/start.ts`

<h2 id="profile-settings">Profile Settings</h2>

Profile config is per-profile daemon runtime settings persisted at
`<profileDir>/config.json`. Loaded once at boot by `loadProfileConfig`
(`packages/daemon/src/config/loader.ts`). Schema is `PROFILE_CONFIG_SCHEMA`
with passthrough enabled. Profile config is currently read-only at runtime —
mutations require a daemon restart.

<h3 id="profile-port">port</h3>

- **Type:** `number` (integer, 1-65535)
- **Default:** `7700`
- **Description:** TCP port the Fastify HTTP/WebSocket server listens on.
- **Defined in:** `packages/daemon/src/config/schema.ts`
  (`PROFILE_CONFIG_DEFAULTS`)

<h3 id="profile-host">host</h3>

- **Type:** `string`
- **Default:** `"127.0.0.1"`
- **Description:** Host interface the daemon binds to. Use `"0.0.0.0"` to
  accept connections on all interfaces.
- **Defined in:** `packages/daemon/src/config/schema.ts`

<h3 id="profile-logLevel">logLevel</h3>

- **Type:** `"debug" | "info" | "warn" | "error"`
- **Default:** `"info"`
- **Description:** Minimum severity of log records the daemon emits.
- **Defined in:** `packages/daemon/src/config/schema.ts`

<h3 id="profile-autoRecover">autoRecover</h3>

- **Type:** `boolean`
- **Default:** `false`
- **Description:** Whether the daemon attempts to resume previously running
  agents and crafts on start.
- **Defined in:** `packages/daemon/src/config/schema.ts`

<h3 id="profile-wsHeartbeatInterval">wsHeartbeatInterval</h3>

- **Type:** `number` (seconds)
- **Default:** `15`
- **Description:** Interval between WebSocket heartbeat pings sent to
  connected clients. See
  `packages/daemon/src/server/websocket/heartbeat.ts`.
- **Defined in:** `packages/daemon/src/config/schema.ts`

<h3 id="profile-stateFlushInterval">stateFlushInterval</h3>

- **Type:** `number` (seconds)
- **Default:** `30`
- **Description:** Interval at which in-memory daemon state stores flush to
  their backing JSON files (see `packages/daemon/src/state/persistence.ts`).
- **Defined in:** `packages/daemon/src/config/schema.ts`

<h3 id="profile-adapter">adapter</h3>

- **Type:** `{ type: string; config: Record<string, unknown> }`
- **Default:** `{ type: "claude-agent-sdk", config: {} }`
- **Description:** Selects which agent adapter the daemon uses to spawn
  pilots, plus an opaque adapter-specific config bag passed through to the
  adapter at construction. Validated by `ADAPTER_CONFIG_SCHEMA`.
- **Defined in:** `packages/daemon/src/config/schema.ts`
- **Used in:** `packages/daemon/src/adapters/registry.ts`

<h2 id="project-settings">Project Settings</h2>

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

<h3 id="project-name">name</h3>

- **Type:** `string`
- **Default:** `""` (seeded with the project name when the store is
  created via `createProjectConfigStore(projectName, ...)`)
- **Description:** Human-readable project name. Preserved across PATCH
  mutations.
- **Defined in:** `packages/daemon/src/config/schema.ts`
  (`PROJECT_METADATA_DEFAULTS`)

<h3 id="project-remoteUrl">remoteUrl</h3>

- **Type:** `string`
- **Default:** `""`
- **Description:** Git remote URL for the project repository. Used by the
  bare-repo and worktree git utilities (`packages/daemon/src/git/`).

<h3 id="project-categories">categories</h3>

- **Type:** `string[]`
- **Default:** `[]`
- **Description:** Category tags used to match incoming crafts to this
  project.

<h3 id="project-checklist">checklist</h3>

- **Type:** `ChecklistItemConfig[]` — each item is
  `{ name: string; command: string; timeout?: number }`
- **Default:** `[]`
- **Description:** Ordered shell commands the tower runs as the landing
  checklist before merging a craft. `timeout` is in milliseconds. See
  `packages/daemon/src/checklist/runner.ts` and RULE-LCHK-4.

<h3 id="project-mcpServers">mcpServers</h3>

- **Type:** `Record<string, McpServerConfig>` — each entry is
  `{ command: string; args: string[]; env?: Record<string, string> }`
- **Default:** `{}`
- **Description:** Named MCP (Model Context Protocol) server processes
  available to agents working on this project.

<h2 id="pilot-settings">Pilot Settings</h2>

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

<h3 id="pilot-certifications">certifications</h3>

- **Type:** `string[]`
- **Default:** `[]`
- **Description:** Craft categories the pilot is certified to captain or
  first-officer. Used by `canHoldControls` / `isPilotCertified` (RULE-PILOT-2,
  RULE-SEAT-2).
- **Defined in:** `packages/daemon/src/config/schema.ts`
  (`PILOT_CONFIG_DEFAULTS`)

<h3 id="pilot-mcpServers">mcpServers</h3>

- **Type:** `Record<string, McpServerConfig>`
- **Default:** `{}`
- **Description:** Pilot-specific MCP server configurations layered on top of
  any project-level MCP servers.

<h3 id="pilot-skills">skills</h3>

- **Type:** `string[]`
- **Default:** `[]`
- **Description:** Assigned skill identifiers for this pilot. Placeholder for
  the Skills roadmap — not yet consumed by the adapter.

<h2 id="agent-settings">Agent Settings</h2>

There is currently no file-backed per-agent configuration store. The
`ConfigScope` enum in `packages/errors/src/config.ts` reserves an `agent`
scope but no schema, defaults, or `LayeredConfigStore` instance for it has
been wired in the daemon. Adapter-specific agent options are passed through
the profile-level [`adapter.config`](#profile-adapter) bag.

Per-pilot configuration (see [Pilot Settings](#pilot-settings)) is the
closest analogue to per-agent configuration and is how operational options
are scoped to individual pilots today.
