# @airtrafficcontrol/daemon

Long-running ATC daemon process. Provides a Fastify-based REST API and WebSocket channels for managing agents, crafts, vectors, pilots, and tower operations. Handles configuration loading, state persistence, git worktree management, adapter registration, PID file lifecycle, and graceful shutdown.

## Installation

```bash
pnpm add @airtrafficcontrol/daemon
```

This is an internal workspace package (`workspace:*`).

## API Reference

### `Daemon` Class

Top-level orchestrator for a running ATC daemon instance. Create one per process.

```typescript
import { Daemon } from "@airtrafficcontrol/daemon";

const daemon = new Daemon("/home/user/.atc/profiles/default");
await daemon.start();
console.log(`Listening on port ${daemon.port}`);
```

#### `constructor(profileDir: string)`

Creates a daemon instance for the given profile directory (must contain `config.json`).

#### `start(): Promise<void>`

Starts the daemon. Sequence:
1. Load profile config
2. Initialize state stores (agent, craft, tower)
3. Create Fastify app with REST routes and WebSocket channels
4. Bind to configured host/port
5. Start periodic state flush scheduler
6. Write PID file
7. Register SIGTERM/SIGINT handlers for graceful shutdown

#### `stop(): Promise<void>`

Stops the daemon gracefully. Flushes state to disk, stops the scheduler, closes the server, and removes the PID file.

#### Properties

| Property | Type | Description |
|---|---|---|
| `isRunning` | `boolean` | Whether the daemon is currently accepting connections |
| `port` | `number` | The bound TCP port (meaningful after `start()` resolves) |

### Server

#### `createApp(options: AppOptions): FastifyInstance`

Creates the Fastify application with all REST routes and WebSocket support.

#### REST Routes

| Route Group | Prefix | Purpose |
|---|---|---|
| Health | `/health` | Liveness and readiness checks |
| Projects | `/projects` | Project metadata |
| Crafts | `/crafts` | Craft CRUD and lifecycle |
| Vectors | `/vectors` | Vector reporting and status |
| Tower | `/tower` | Landing clearance and merge queue |
| Agents | `/agents` | Agent lifecycle management |
| Pilots | `/pilots` | Pilot registration and assignment |
| Intercom | `/intercom` | Inter-pilot messaging |
| Black Box | `/blackbox` | Append-only event logging |
| Config | `/api/v1/config/global` | Read, replace, patch, and unset keys on the global config store |

### Adapter System

#### `AgentAdapter` Interface

Contract for pluggable agent runtime backends. Adapters abstract how the daemon launches, communicates with, and controls agent processes.

| Method | Description |
|---|---|
| `launch(options)` | Launch a new agent, return a handle |
| `pause(handle)` | Pause without terminating |
| `resume(handle, context)` | Resume a paused agent |
| `terminate(handle)` | Permanently terminate |
| `isAlive(handle)` | Check liveness |
| `sendMessage(handle, message)` | Send intercom message |
| `onMessage(handle, callback)` | Listen for messages |
| `onStatusChange(handle, callback)` | Listen for status changes |
| `onUsageReport(handle, callback)` | Listen for usage reports |

#### `AgentHandle`

Opaque handle returned when an agent is launched.

| Property | Type | Description |
|---|---|---|
| `agentId` | `string` | Unique agent identifier (UUID) |
| `pid` | `number?` | OS process ID if subprocess-backed |
| `adapterMeta` | `Record<string, unknown>` | Adapter-specific metadata |

#### `AgentLaunchOptions`

| Property | Type | Description |
|---|---|---|
| `agentId` | `string` | UUID to assign |
| `worktreePath` | `string` | Absolute path to git worktree |
| `craft` | `CraftState` | Full persisted craft state |
| `systemPrompt` | `string` | System prompt for agent context |
| `intercomHistory` | `IntercomMessage[]` | Prior messages to replay |
| `adapterConfig` | `Record<string, unknown>` | Adapter-specific config |
| `mcpServers` | `Record<string, McpServerConfig>` | MCP server configurations |

#### `AdapterRegistry`

Registry for managing adapter implementations by name.

### State Stores

#### `AgentStore`

Persists agent records to disk. Supports `load()` and `save()`.

#### `CraftStore`

Persists craft state to disk. Supports `saveAll()`.

#### `TowerStore`

Persists tower/merge queue state.

### Configuration

Config schemas are validated with [Zod](https://zod.dev). Global, profile, project, and agent scopes share the same layered-store abstraction: in-memory merged view, sparse on-disk diff against defaults, atomic writes, and a single apply path for REST, WebSocket, and file-watch mutations.

#### `LayeredConfigStore<T>`

Generic, runtime-editable config store for a single scope. Owns in-memory state, persists only the sparse diff against defaults, and funnels all mutations through one internal apply path so REST, WebSocket, and file-watcher writes stay consistent. Free of daemon-specific wiring — project and agent scopes can reuse it by instantiating with a different schema, defaults, file path, and channel.

| Method | Description |
|---|---|
| `load()` | One-shot read of the backing file. Populates in-memory state and emits a single `change` event with source `"init"`. |
| `get()` | Returns the fully-merged view (defaults + overrides). |
| `getOverrides()` | Returns only the sparse on-disk shape. |
| `replace(next)` | Full replace. Missing known fields revert to default. Throws `ConfigValidationError` on schema failure. |
| `patch(partial)` | Partial merge. Omitted fields are left untouched. |
| `unset(key)` | Revert one known key to its default. Throws `UnknownConfigKeyError` if the key is not in the schema. |
| `start()` | Begin watching the backing file for external edits (debounced `fs.watch` with mtime + sha256 fingerprinting to skip self-writes). |
| `stop()` | Stop watching and await any in-flight write. |
| `on("change", fn)` | Subscribe to change events: `(merged, source: "api" \| "file" \| "init") => void`. |
| `on("invalid_external_edit", fn)` | Subscribe to invalid-external-edit events; fires when a file-watch reload fails validation. In-memory state is preserved. |

Every mutation is also published on the store's configured pub/sub channel (e.g. `config:global`) so WebSocket subscribers see the same change stream.

#### `createGlobalConfigStore(atcDir, publish, logger)`

Factory that wires a `LayeredConfigStore<GlobalConfig>` to `GLOBAL_CONFIG_SCHEMA`, `GLOBAL_CONFIG_DEFAULTS`, `<atcDir>/config.json`, and the `config:global` channel. The daemon constructs one during bootstrap and exposes it on the Fastify instance as `app.globalConfigStore` so REST and WebSocket handlers share a single instance.

#### Legacy Loaders

- `loadGlobalConfig(): Promise<GlobalConfig>` — one-shot read of the global config, used at bootstrap before the store is constructed.
- `loadProfileConfig(profileDir: string): Promise<ProfileConfig>` — loads profile-specific configuration from a profile directory.
- `loadProjectMetadata(): Promise<ProjectMetadata>` — loads project metadata for the current working directory.
- `resolveProfilePath(profileName: string): string` — resolves the filesystem path for a named profile.

All loaders parse through Zod and surface structured issues via `ConfigValidationError` from `@airtrafficcontrol/errors`.

#### Config Defaults

- `GLOBAL_CONFIG_DEFAULTS` — Default values for global configuration
- `PROFILE_CONFIG_DEFAULTS` — Default values for profile configuration

#### WebSocket Config Dispatch

Clients can mutate the global config through the WebSocket surface as well as REST. Messages are routed to the same `app.globalConfigStore` and receive a `config.ack` reply.

| Client message | Handler |
|---|---|
| `config.patch` | `store.patch(body)` |
| `config.replace` | `store.replace(body)` |
| `config.unset` | `store.unset(key)` |

Validation failures return `config.ack` frames with structured error details (`INVALID_CONFIG` or `UNKNOWN_CONFIG_KEY`).

### Git Utilities

#### `initBareRepo(path: string): Promise<void>`

Initializes a bare git repository at the given path.

#### `cloneBareRepo(url: string, path: string): Promise<void>`

Clones a repository as a bare repo.

#### `fetchBareRepo(path: string): Promise<void>`

Fetches updates into a bare repository.

#### `createWorktree(bareRepoPath: string, worktreePath: string, branch: string): Promise<void>`

Creates a git worktree from a bare repository.

#### `removeWorktree(bareRepoPath: string, worktreePath: string): Promise<void>`

Removes a git worktree.

### WebSocket Channels

#### `ChannelRegistry`

Manages WebSocket channels for real-time event streaming.

### Checklist Runner

#### `runChecklist(items): Promise<ChecklistResult>`

Runs the landing checklist pipeline within the daemon context.

### Process Utilities

#### `writePidFile(path: string): Promise<void>`

Writes the current process ID to a file.

#### `readPidFile(path: string): Promise<number | null>`

Reads a PID from a file.

#### `removePidFile(path: string): Promise<void>`

Removes a PID file.

#### `isProcessAlive(pid: number): boolean`

Checks whether a process is alive by PID.

### Key Types

| Type | Description |
|---|---|
| `GlobalConfig` | Global ATC configuration |
| `ProfileConfig` | Profile-specific configuration |
| `AdapterConfig` | Adapter configuration |
| `ProjectMetadata` | Project metadata |
| `CraftState` | Full persisted craft state |
| `PilotRecord` | Persisted pilot record |
| `AgentRecord` | Persisted agent record |
| `AgentStatus` | Agent lifecycle status |
| `IntercomMessage` | Inter-pilot message |
| `WsEvent` | WebSocket event |
| `WsClientMessage` | Client-to-server WebSocket message |
| `WsServerMessage` | Server-to-client WebSocket message |
| `TokenUsage` | Token consumption report |
| `ToolUsageEntry` | Tool usage tracking |
| `SkillUsageEntry` | Skill usage tracking |
| `AgentUsageReport` | Aggregate agent usage report |

## Dependencies

| Package | Purpose |
|---|---|
| `@airtrafficcontrol/types` | Domain types and enums |
| `@airtrafficcontrol/errors` | Error classes |
| `@airtrafficcontrol/core` | Craft lifecycle and controls logic |
| `@airtrafficcontrol/tower` | Merge coordination |
| `@airtrafficcontrol/checklist` | Landing checklist |
| `fastify` | HTTP server framework |
| `@fastify/websocket` | WebSocket support |
| `zod` | Config schema validation |

## Related Packages

- [`@airtrafficcontrol/adapter-claude-agent-sdk`](../adapter-claude-agent-sdk/) — Claude Agent SDK adapter implementing `AgentAdapter`
- [`@airtrafficcontrol/core`](../core/) — Runtime logic consumed by daemon routes
- [`@airtrafficcontrol/tower`](../tower/) — Tower logic managed by the daemon
