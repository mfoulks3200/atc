# @atc/daemon

Long-running ATC daemon process. Provides a Fastify-based REST API and WebSocket channels for managing agents, crafts, vectors, pilots, and tower operations. Handles configuration loading, state persistence, git worktree management, adapter registration, PID file lifecycle, and graceful shutdown.

## Installation

```bash
pnpm add @atc/daemon
```

This is an internal workspace package (`workspace:*`).

## API Reference

### `Daemon` Class

Top-level orchestrator for a running ATC daemon instance. Create one per process.

```typescript
import { Daemon } from "@atc/daemon";

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

#### `loadGlobalConfig(): Promise<GlobalConfig>`

Loads the global ATC configuration.

#### `loadProfileConfig(profileDir: string): Promise<ProfileConfig>`

Loads profile-specific configuration from a profile directory.

#### `loadProjectMetadata(): Promise<ProjectMetadata>`

Loads project metadata for the current working directory.

#### `resolveProfilePath(profileName: string): string`

Resolves the filesystem path for a named profile.

#### Config Defaults

- `GLOBAL_CONFIG_DEFAULTS` — Default values for global configuration
- `PROFILE_CONFIG_DEFAULTS` — Default values for profile configuration

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
| `@atc/types` | Domain types and enums |
| `@atc/errors` | Error classes |
| `@atc/core` | Craft lifecycle and controls logic |
| `@atc/tower` | Merge coordination |
| `@atc/checklist` | Landing checklist |
| `fastify` | HTTP server framework |
| `@fastify/websocket` | WebSocket support |

## Related Packages

- [`@atc/adapter-claude-agent-sdk`](../adapter-claude-agent-sdk/) — Claude Agent SDK adapter implementing `AgentAdapter`
- [`@atc/core`](../core/) — Runtime logic consumed by daemon routes
- [`@atc/tower`](../tower/) — Tower logic managed by the daemon
