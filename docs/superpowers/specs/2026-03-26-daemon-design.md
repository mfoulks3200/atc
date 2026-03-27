# ATC Daemon — Design Specification

**Version:** 0.1.0
**Status:** Draft
**Date:** 2026-03-26
**Packages:** `@atc/daemon`, `@atc/adapter-claude-agent-sdk`

## 1. Overview

The ATC daemon is a long-running central process that orchestrates all agent operations within the ATC system. It hosts one Tower instance per registered git project, manages agent lifecycles through a pluggable adapter system, and exposes both a REST API for control and a WebSocket API for real-time event streaming.

### 1.1 Goals

- Serve as the single control plane for all ATC operations.
- Spawn, pause, resume, and terminate agents via a pluggable adapter system.
- Persist all runtime state to disk for crash recovery and session resumability — including intercom history so agents can resume with prior context.
- Provide a REST API for CLI and future web dashboard consumption.
- Provide a WebSocket API for real-time monitoring of crafts, agents, tower operations, and intercom traffic.

### 1.2 Out of Scope

- CLI package (`@atc/cli`) — will be a separate spec.
- Web dashboard — will be a separate spec.
- Authentication/authorization on the API (daemon binds to localhost by default).

## 2. Filesystem Layout

All daemon data lives under `~/.atc/`, organized by profiles.

```
~/.atc/
├── config.json                              # Global config
└── profiles/
    └── <profile-name>/                      # One folder per profile (default: "default")
        ├── config.json                      # Profile config
        ├── daemon.pid                       # PID file (present when daemon is running)
        ├── logs/
        │   ├── daemon.log                   # Daemon process log
        │   └── agents/
        │       └── <agent-id>.log           # Per-agent log files
        ├── state/                           # Persisted runtime state (JSON)
        │   ├── agents.json                  # Agent records
        │   └── projects/
        │       └── <project-name>/
        │           ├── tower.json           # Tower merge queue state
        │           └── crafts/
        │               └── <callsign>/
        │                   ├── craft.json   # Craft state, intercom, black box
        │                   └── usage.json   # Agent usage/analytics (append-only)
        ├── workspaces/                      # Agent working directories
        │   └── <agent-id>/
        └── projects/                        # Git project storage
            └── <project-name>/
                ├── metadata.json            # Project metadata
                ├── repo.git/                # Bare git repo
                └── crafts/                  # Worktrees (one per craft branch)
                    └── <callsign>/
```

### 2.1 Key Decisions

- **State is separated from git storage.** `state/` holds serialized runtime state; `projects/` holds git data. This keeps git operations clean and state easy to inspect independently.
- **Intercom history is stored inside each craft's JSON file** — it is per-craft context. On agent resume, the daemon loads the craft JSON and feeds the intercom back to the adapter.
- **Agent logs are per-agent files** so individual agent output can be tailed independently.
- **Usage analytics are per-craft** in an append-only file, enabling cost tracking per unit of work.

## 3. Configuration

### 3.1 Global Config

**Path:** `~/.atc/config.json`

```json
{
  "defaultProfile": "default"
}
```

Points to which profile to use when none is specified.

### 3.2 Profile Config

**Path:** `~/.atc/profiles/<name>/config.json`

```json
{
  "port": 7700,
  "host": "127.0.0.1",
  "logLevel": "info",
  "autoRecover": false,
  "wsHeartbeatInterval": 15,
  "stateFlushInterval": 30,
  "adapter": {
    "type": "claude-agent-sdk",
    "config": {
      "model": "claude-sonnet-4-20250514",
      "maxTurns": 200
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | `number` | `7700` | HTTP/WS server port. |
| `host` | `string` | `"127.0.0.1"` | Bind address. Localhost by default. |
| `logLevel` | `string` | `"info"` | Log verbosity: `debug`, `info`, `warn`, `error`. |
| `autoRecover` | `boolean` | `false` | When `true`, automatically resume dead agents on startup. When `false`, dead agents are marked `suspended` and require explicit recovery. |
| `wsHeartbeatInterval` | `number` | `15` | WebSocket ping interval in seconds. |
| `stateFlushInterval` | `number` | `30` | Periodic state flush interval in seconds. |
| `adapter.type` | `string` | `"claude-agent-sdk"` | Agent adapter to use. |
| `adapter.config` | `object` | `{}` | Adapter-specific configuration, passed through opaquely. |

### 3.3 Project Metadata

**Path:** `~/.atc/profiles/<name>/projects/<project>/metadata.json`

```json
{
  "name": "my-app",
  "remoteUrl": "git@github.com:org/my-app.git",
  "categories": ["backend", "frontend", "infrastructure"],
  "checklist": [
    {
      "name": "Tests",
      "command": "pnpm run test",
      "timeout": 300
    },
    {
      "name": "Lint",
      "command": "pnpm run lint",
      "timeout": 60
    },
    {
      "name": "Build",
      "command": "pnpm run build",
      "timeout": 120
    },
    {
      "name": "Format",
      "command": "pnpm run format:check",
      "timeout": 30
    }
  ],
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

**Checklist items:**
- Each item has a `name`, a shell `command`, and an optional `timeout` (seconds, defaults to 120).
- Commands run sequentially in the craft's worktree directory. Exit code 0 = pass, non-zero = fail.
- First failure triggers a go-around (per RULE-LCHK-3).
- stdout/stderr are captured and included in the checklist result for the agent and black box.

**MCP servers:**
- Project-level MCP servers are available to all pilots on the project.
- Format matches the Claude Code / Agent SDK convention (`command`, `args`, `env`).
- Environment variable references (`${VAR}`) are resolved at agent launch time from the daemon's environment.

## 4. Daemon Lifecycle

### 4.1 Starting

- **Foreground:** `atc daemon start` — runs in the terminal, stdout/stderr to console.
- **Background:** `atc daemon start -d` — forks to background, writes PID to `daemon.pid`, logs to `logs/daemon.log`.

**Startup sequence:**
1. Load profile config.
2. Read persisted state from `state/`.
3. Check each persisted agent via `adapter.isAlive(handle)`:
   - **Alive:** Reconnect — re-attach message/status listeners.
   - **Dead + `autoRecover: true`:** Re-launch with full `AgentResumeContext` including intercom history.
   - **Dead + `autoRecover: false`:** Mark as `suspended`. Operator must explicitly recover.
4. Restore tower state (merge queues) for each project.
5. Start Fastify server (HTTP + WebSocket).

### 4.2 Stopping

- `atc daemon stop` — sends SIGTERM to the PID in `daemon.pid`.

**Shutdown sequence:**
1. Stop accepting new connections.
2. Persist all current state to `state/` (agents, crafts, tower queues, intercom).
3. Signal each agent to pause gracefully via the adapter (current turn completes, then stop).
4. Close WebSocket connections.
5. Remove `daemon.pid`.
6. Exit.

### 4.3 Recovery

- `atc daemon recover` — resume all `suspended` agents.
- `atc daemon recover --agent <id>` — resume a single agent.
- Also available via `POST /api/v1/agents/recover`.

Recovery loads the agent's assigned craft JSON, passes intercom history to the adapter's `resume()` method, and re-launches the agent.

### 4.4 Other Commands

- `atc daemon status` — checks PID file + process liveness, prints port, active project/craft/agent counts.
- `atc daemon restart` — stop + start (state preserved through persist/resume cycle).

### 4.5 State Persistence

| File | Contents | Write Frequency |
|------|----------|-----------------|
| `agents.json` | Agent records: id, adapter type, PID, craft assignment, status, adapter metadata | On change + periodic flush |
| `projects/<name>/tower.json` | Merge queue entries (callsign, requestedAt) | On change |
| `projects/<name>/crafts/<callsign>/craft.json` | Full craft state: status, crew, flight plan, vectors, controls, black box, intercom history | On change + periodic flush |
| `projects/<name>/crafts/<callsign>/usage.json` | Append-only usage/analytics reports | On report received |

- **Periodic flush:** Every `stateFlushInterval` seconds (default 30), the daemon writes all dirty state to disk. Bounds data loss on crash to one flush interval.
- **Atomic writes:** Write to `.tmp` file, then rename over original. Prevents corruption from partial writes.
- **Single writer:** The daemon is the only process writing to `state/`. No file locking needed.

## 5. Agent Adapter System

### 5.1 Adapter Interface

```typescript
interface AgentAdapter {
  // Lifecycle
  launch(options: AgentLaunchOptions): Promise<AgentHandle>;
  pause(handle: AgentHandle): Promise<void>;
  resume(handle: AgentHandle, context: AgentResumeContext): Promise<void>;
  terminate(handle: AgentHandle): Promise<void>;
  isAlive(handle: AgentHandle): Promise<boolean>;

  // Communication
  sendMessage(handle: AgentHandle, message: IntercomMessage): Promise<void>;
  onMessage(handle: AgentHandle, callback: (message: IntercomMessage) => void): void;
  onStatusChange(handle: AgentHandle, callback: (status: AgentStatus) => void): void;

  // Analytics
  onUsageReport(handle: AgentHandle, callback: (report: AgentUsageReport) => void): void;
}

interface AgentLaunchOptions {
  agentId: string;
  worktreePath: string;
  craft: CraftState;
  systemPrompt: string;
  intercomHistory: IntercomMessage[];
  adapterConfig: Record<string, unknown>;
  mcpServers: Record<string, McpServerConfig>;
}

interface AgentHandle {
  agentId: string;
  pid?: number;
  adapterMeta: Record<string, unknown>;
}

interface AgentResumeContext {
  craft: CraftState;
  intercomHistory: IntercomMessage[];
  lastKnownState: string;
}

interface AgentUsageReport {
  agentId: string;
  callsign: string;
  timestamp: Date;
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
  tools: { name: string; calls: number; failures: number }[];
  skills: { name: string; invocations: number }[];
  duration: number;
}

interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}
```

### 5.2 Adapter Registry

Adapters are registered by name. The profile config's `adapter.type` selects which one to use. The daemon ships with `claude-agent-sdk` as the default (provided by the `@atc/adapter-claude-agent-sdk` package).

### 5.3 Per-Pilot MCP Servers

Pilots can have their own MCP server configurations:

```json
{
  "identifier": "agent-frontend-01",
  "certifications": ["frontend"],
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-figma"],
      "env": { "FIGMA_TOKEN": "${FIGMA_TOKEN}" }
    }
  }
}
```

**Merge strategy:** When an agent launches, it receives project-level MCP servers plus its pilot-level servers. Pilot-level servers override project-level servers with the same name.

## 6. Default Adapter: `@atc/adapter-claude-agent-sdk`

This is an independent package (`packages/adapter-claude-agent-sdk`) to avoid coupling with the daemon.

### 6.1 Package Structure

```
packages/adapter-claude-agent-sdk/
├── package.json          # Depends on @atc/types, @atc/errors, claude_agent_sdk
├── tsconfig.json
└── src/
    ├── index.ts          # Barrel export
    ├── adapter.ts        # AgentAdapter implementation
    └── prompt-builder.ts # Build system prompt from operating manual + context
```

### 6.2 Behavior

- **`launch()`** spawns a Node subprocess running an Agent SDK loop. The system prompt is built from `docs/agent/operating-manual.md` plus project context. The agent is given tools for git operations, running commands in the worktree, and reporting vectors to the tower.
- **`pause()`** lets the current turn complete, then breaks the agent loop.
- **`resume()`** creates a new Agent SDK session, injects intercom history as conversation context, and resumes the loop. A system message indicates resumption.
- **`isAlive()`** checks the subprocess PID.
- **`onUsageReport()`** extracts token/tool/skill usage from the Agent SDK's response metadata and emits reports after each agent turn.

## 7. REST API

All routes prefixed with `/api/v1`. Fastify JSON Schema validation on all request/response bodies.

### 7.1 Daemon

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check, uptime, version |
| GET | `/status` | Daemon status (profile, active projects, agent count) |

### 7.2 Projects

| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects` | Register a project (clones bare repo, sets up folder structure) |
| GET | `/projects` | List all projects |
| GET | `/projects/:name` | Project details + metadata |
| DELETE | `/projects/:name` | Remove a project |
| PATCH | `/projects/:name` | Update project metadata (checklist, categories, MCP servers) |
| POST | `/projects/:name/sync` | Fetch latest from remote into bare repo |

### 7.3 Crafts

| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:name/crafts` | Create a craft (creates branch, worktree, assigns captain) |
| GET | `/projects/:name/crafts` | List crafts (filterable by status) |
| GET | `/projects/:name/crafts/:callsign` | Craft details (status, crew, flight plan, controls) |
| DELETE | `/projects/:name/crafts/:callsign` | Remove a craft (cleanup worktree + branch) |
| POST | `/projects/:name/crafts/:callsign/launch` | Transition Taxiing → InFlight |
| POST | `/projects/:name/crafts/:callsign/checklist` | Run landing checklist |
| POST | `/projects/:name/crafts/:callsign/emergency` | Declare emergency |

### 7.4 Vectors

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/:name/crafts/:callsign/vectors` | Flight plan status |
| POST | `/projects/:name/crafts/:callsign/vectors/:vectorName/report` | File a vector report |

### 7.5 Tower

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/:name/tower` | Tower status (merge queue) |
| POST | `/projects/:name/tower/clearance` | Request landing clearance for a craft |

### 7.6 Agents

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agents` | Launch an agent (assign to a craft) |
| GET | `/agents` | List all agents across projects |
| GET | `/agents/:id` | Agent details (status, craft assignment, adapter info) |
| POST | `/agents/:id/pause` | Pause an agent |
| POST | `/agents/:id/resume` | Resume a paused agent |
| POST | `/agents/recover` | Recover all suspended agents |
| DELETE | `/agents/:id` | Terminate an agent |
| GET | `/agents/:id/usage` | Agent usage/analytics |

### 7.7 Pilots

| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:name/pilots` | Register a pilot (identifier, certifications, MCP servers) |
| GET | `/projects/:name/pilots` | List pilots for a project |
| GET | `/projects/:name/pilots/:id` | Pilot details |
| PATCH | `/projects/:name/pilots/:id` | Update pilot config (certifications, MCP servers) |

### 7.8 Intercom

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/:name/crafts/:callsign/intercom` | Get intercom history |
| POST | `/projects/:name/crafts/:callsign/intercom` | Send a message to a craft's intercom |

### 7.9 Black Box

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/:name/crafts/:callsign/blackbox` | Get black box entries |

### 7.10 Usage Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/:name/crafts/:callsign/usage` | Usage analytics for a craft |

### 7.11 Key Decisions

- **Agents are a top-level resource** (not nested under projects) because an agent is a process managed by the daemon — its craft assignment is a property, not its identity.
- **Pilots are per-project** because certifications and MCP servers are project-contextual.
- **Lifecycle transitions are explicit action endpoints** (`/launch`, `/checklist`, `/emergency`) rather than PATCH-ing status directly. This enforces the state machine — the daemon validates preconditions per the spec rules.
- **Tower operations are per-project** in line with RULE-TOWER-1 (one tower per repo).

## 8. WebSocket API

### 8.1 Connection

Clients connect to `ws://<host>:<port>/ws`.

On connection, the server sends:
```json
{ "type": "connected", "version": "0.1.0", "channels": ["daemon", "projects:*", "crafts:*", "..."] }
```

### 8.2 Subscribe / Unsubscribe

**Client → Server:**
```json
{ "type": "subscribe", "channel": "crafts:my-app:*" }
{ "type": "unsubscribe", "channel": "crafts:my-app:*" }
```

### 8.3 Channels

| Channel | Events |
|---------|--------|
| `*` | Firehose — all events |
| `daemon` | Daemon lifecycle (started, stopping, agent-launched, agent-terminated) |
| `projects:*` | All project events |
| `projects:<name>` | Events for a specific project (sync, craft created/removed) |
| `crafts:<project>:*` | All craft events for a project |
| `crafts:<project>:<callsign>` | Single craft (status changes, vector reports, checklist results, controls) |
| `intercom:<project>:<callsign>` | Real-time intercom messages for a craft |
| `agents:*` | All agent events |
| `agents:<id>` | Single agent (status changes, log output) |
| `tower:<project>` | Tower events (queue changes, clearance granted/denied, merges) |

Channel wildcards use `*` for glob-style prefix matching.

### 8.4 Events

**Server → Client:**
```json
{
  "type": "event",
  "channel": "crafts:my-app:alpha-1",
  "event": "status_changed",
  "timestamp": "2026-03-26T14:30:00Z",
  "data": {
    "callsign": "alpha-1",
    "from": "InFlight",
    "to": "LandingChecklist"
  }
}
```

```json
{
  "type": "event",
  "channel": "intercom:my-app:alpha-1",
  "event": "message",
  "timestamp": "2026-03-26T14:30:05Z",
  "data": {
    "from": "agent-01",
    "content": "All vectors passed, beginning landing checklist.",
    "seat": "captain"
  }
}
```

```json
{
  "type": "event",
  "channel": "tower:my-app",
  "event": "clearance_granted",
  "timestamp": "2026-03-26T14:31:00Z",
  "data": {
    "callsign": "alpha-1",
    "queuePosition": 0
  }
}
```

### 8.5 Keepalive

- **Server sends `ping`** on a configurable interval (default 15 seconds):
  ```json
  { "type": "ping", "timestamp": "2026-03-26T14:30:00Z" }
  ```
- **Client responds with `pong`**:
  ```json
  { "type": "pong", "timestamp": "2026-03-26T14:30:00Z" }
  ```
- **Server drops clients** that miss 3 consecutive pongs (3x the heartbeat interval).
- **Clients may also send `ping`** — server replies with `pong`. Allows CLI tools to do a quick liveness check.
- Interval configurable via `wsHeartbeatInterval` in profile config.

## 9. Daemon Package Structure

**Package:** `@atc/daemon` at `packages/daemon`

```
packages/daemon/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                  # Barrel export
    ├── daemon.ts                 # Top-level daemon class (start, stop, recover)
    ├── config/
    │   ├── loader.ts             # Read/validate global + profile configs
    │   └── schema.ts             # JSON Schema definitions for config files
    ├── server/
    │   ├── app.ts                # Fastify app factory (registers routes + WS)
    │   ├── routes/
    │   │   ├── health.ts
    │   │   ├── projects.ts
    │   │   ├── crafts.ts
    │   │   ├── vectors.ts
    │   │   ├── tower.ts
    │   │   ├── agents.ts
    │   │   ├── pilots.ts
    │   │   ├── intercom.ts
    │   │   └── blackbox.ts
    │   └── websocket/
    │       ├── handler.ts        # Connection handling, subscribe/unsubscribe
    │       ├── channels.ts       # Channel registry, glob matching
    │       └── heartbeat.ts      # Ping/pong keepalive
    ├── state/
    │   ├── persistence.ts        # Atomic JSON read/write, periodic flush
    │   ├── agent-store.ts        # Agent state management
    │   ├── craft-store.ts        # Craft state (includes intercom, black box)
    │   └── tower-store.ts        # Tower/merge queue state per project
    ├── git/
    │   ├── bare-repo.ts          # Clone, fetch, bare repo operations
    │   └── worktree.ts           # Create/remove worktrees for crafts
    ├── adapters/
    │   ├── adapter.ts            # AgentAdapter interface + types
    │   └── registry.ts           # Adapter registration + lookup by name
    ├── checklist/
    │   └── runner.ts             # Execute checklist commands in worktree
    └── process/
        ├── pid.ts                # PID file management
        └── signals.ts            # SIGTERM/SIGINT handling, graceful shutdown
```

**Dependencies:**
- `fastify`, `@fastify/websocket` — HTTP + WebSocket server
- `@atc/types`, `@atc/errors`, `@atc/core`, `@atc/tower`, `@atc/checklist` — workspace dependencies
- `@atc/adapter-claude-agent-sdk` — default adapter (workspace dependency)

## 10. Spec Compliance

The daemon implements and enforces the following rules from `docs/specification.md`:

| Rule | Enforcement |
|------|-------------|
| RULE-TOWER-1 | One Tower instance per registered project |
| RULE-TOWER-2 | `/tower/clearance` verifies all vectors passed before granting |
| RULE-TOWER-3 | Merge execution verifies branch is up to date with main |
| RULE-CRAFT-1–5 | `POST /crafts` validates all required fields at creation |
| RULE-LIFE-1–8 | Lifecycle endpoints enforce valid transitions only |
| RULE-VEC-1–5 | Vector reporting endpoints enforce ordering and completeness |
| RULE-LCHK-1–4 | Checklist runner executes project-configured commands |
| RULE-TMRG-1–4 | Tower merge protocol enforced via clearance + merge sequence |
| RULE-EMER-1–4 | Emergency endpoint validates captain-only, records to black box |
| RULE-BBOX-1–4 | Craft state includes append-only black box, provided on emergency |
| RULE-SEAT-1–4 | Pilot/crew assignment validated against certifications |
| RULE-CTRL-1–7 | Controls state tracked per craft, transfers recorded in black box |
| RULE-ICOM-1–5 | Intercom endpoints enforce radio discipline; all traffic persisted in craft state |
| RULE-VRPT-1–4 | Vector report endpoint validates required fields, updates flight plan |
