# Configuration Roadmap — Design Spec

Implements all items under the **Configuration** header in `docs/roadmap.md`.

## Scope

1. Project config REST routes (with `LayeredConfigStore` refactor)
2. Pilot config REST routes (in-memory stub)
3. Global settings UI (three sub-pages)
4. Project settings UI
5. Pilot settings UI
6. About page (build-time data + daemon endpoint)
7. WebSocket broadcasting for project and pilot config

---

## 1. Project Config — LayeredConfigStore Refactor + REST Routes

### Current State

`ProjectMetadata` is loaded/saved as a full JSON blob via `atomicWriteJson`. Project routes (PATCH, DELETE) mutate it directly in `packages/daemon/src/server/routes/projects.ts`.

### Changes

Wrap each project's metadata in a `LayeredConfigStore<ProjectMetadata>`:

- Add `ProjectMetadataSchema` (Zod) and `PROJECT_METADATA_DEFAULTS` to `packages/daemon/src/config/schema.ts`.
- Add `createProjectConfigStore()` factory in a new file `packages/daemon/src/config/project-store.ts`, mirroring `createGlobalConfigStore()`.
- Manage a `Map<string, LayeredConfigStore<ProjectMetadata>>` in the daemon, one store per project. Created when a project is created, loaded at startup for all existing projects.
- Refactor existing project routes to read/write through the store instead of raw file I/O.
- Add dedicated config routes under `/api/v1/projects/:name/config` in a new route file:
  - `GET` — returns `{ config, overrides }`
  - `PUT` — full replace
  - `PATCH` — partial merge
  - `DELETE /:key` — revert key to default
- Broadcast changes on `config:project:{name}` channel.

The existing project CRUD routes (`POST /projects`, `GET /projects`, `PATCH /projects/:name`, `DELETE /projects/:name`) remain for project lifecycle management. The new `/config` routes handle the configuration subset.

### Error Responses

Same shape as global config:
- `400 INVALID_CONFIG` — validation failure with `issues[]`
- `404 UNKNOWN_CONFIG_KEY` — for DELETE of unknown key
- `500 INTERNAL` — unexpected errors

---

## 2. Pilot Config Routes (In-Memory Stub)

Pilot persistence is not yet implemented (separate roadmap item). These routes create the API surface with in-memory backing, to be upgraded to `LayeredConfigStore` later.

### Routes

Under `/api/v1/projects/:name/pilots/:id/config`:
- `GET` — returns `{ config, overrides }`
- `PUT` — full replace
- `PATCH` — partial merge
- `DELETE /:key` — revert key to default

### Schema

New `PilotConfig` type in `packages/daemon/src/config/schema.ts`:

```typescript
{
  certifications: string[];
  mcpServers: Record<string, McpServerConfig>;
  skills: string[];  // placeholder for Skills roadmap
}
```

### Backing Store

In-memory `Map<string, PilotConfig>` keyed by pilot ID. Route handlers follow the same error response shapes as global config. No file persistence — data is lost on restart.

### Broadcasting

WebSocket broadcasting on `config:pilot:{id}` channel, wired even in the in-memory implementation so the UI works from day one.

---

## 3. Daemon About Endpoint

### Route

`GET /api/v1/about`

### Response

```typescript
{ version: string }
```

Reads version from the daemon's `package.json` at startup, serves as a static value. No auth, no config store.

---

## 4. Global Settings UI

### Routes

```
/settings          -> redirects to /settings/general
/settings/general  -> Global config (defaultProfile)
/settings/profile  -> Profile config (scalar fields)
/settings/about    -> Version, changelog, contributors
```

### Sidebar

When on any `/settings/*` route, the sidebar shows a contextual SETTINGS section (same pattern as the PROJECT section):

```
SETTINGS
|- General
|- Profile
|- About
```

Each item links to the corresponding route.

### Settings/General Page

Card with the `defaultProfile` field — text input with save button.

Data: `GET /api/v1/config/global`, mutations via PATCH.

### Settings/Profile Page

Card with scalar profile config fields:
- Port (number input)
- Host (text input)
- Log Level (dropdown: debug, info, warn, error)
- Auto-Recover (toggle)
- WebSocket Heartbeat Interval (number input, seconds)
- State Flush Interval (number input, seconds)

Adapter config is excluded from the UI for now.

### Settings/About Page

Build-time data via Vite (`define` block or virtual module):
- **Version** — from monorepo `package.json`
- **Changelog** — recent entries (last 5-10 releases), rendered from markdown
- **Contributors** — from git history or maintained list, baked at build time

---

## 5. Project Settings UI

### Routes

Accessible from the project detail view (link/button to settings):

```
/settings/project/:name          -> redirects to /settings/project/:name/general
/settings/project/:name/general  -> Categories, checklist items
/settings/project/:name/mcp-servers -> MCP server configurations
```

### Sidebar

When on project settings routes:

```
PROJECT SETTINGS: {name}
|- General
|- MCP Servers
```

### General Page

- Categories — editable tag list (add/remove)
- Checklist items — editable list of `{ name, command, timeout? }` with add/remove/reorder

### MCP Servers Page

- Table of configured MCP servers: name, command, args, env
- Add/edit/remove capabilities

### Data Flow

- Hooks: `GET /api/v1/projects/:name/config`
- Mutations: PATCH
- Real-time: WebSocket subscription on `config:project:{name}`

---

## 6. Pilot Settings UI

### Routes

Accessible from the pilot detail view:

```
/settings/pilot/:id          -> redirects to /settings/pilot/:id/general
/settings/pilot/:id/general  -> Certifications
/settings/pilot/:id/mcp-servers -> Pilot-specific MCP servers
```

### Sidebar

When on pilot settings routes:

```
PILOT SETTINGS: {identifier}
|- General
|- MCP Servers
```

### General Page

- Certifications — toggle chips (same pattern as the create pilot modal)

### MCP Servers Page

- Pilot-specific MCP server configurations, same UI pattern as project MCP servers

Skills are omitted — they arrive with the Skills roadmap items.

### Data Flow

- Hooks: `GET /api/v1/projects/:name/pilots/:id/config`
- Mutations: PATCH
- Real-time: WebSocket subscription on `config:pilot:{id}`

---

## 7. WebSocket Broadcasting

### New Channels

- `config:project:{name}` — broadcasts on any project config mutation
- `config:pilot:{id}` — broadcasts on any pilot config mutation

### Payload Shape

Same as global config:

```typescript
{ config: T, source: "api" | "file" | "init" }
```

### Client Messages

Extend `WsClientMessage` to support project/pilot scopes:

```typescript
| { type: "config.patch"; scope: "project"; project: string; body: Record<string, unknown>; requestId: string }
| { type: "config.replace"; scope: "project"; project: string; body: Record<string, unknown>; requestId: string }
| { type: "config.unset"; scope: "project"; project: string; key: string; requestId: string }
| { type: "config.patch"; scope: "pilot"; pilotId: string; body: Record<string, unknown>; requestId: string }
| { type: "config.replace"; scope: "pilot"; pilotId: string; body: Record<string, unknown>; requestId: string }
| { type: "config.unset"; scope: "pilot"; pilotId: string; key: string; requestId: string }
```

### Pattern Matching

Clients can subscribe to:
- `config:project:myproject` — specific project
- `config:project:*` — all project config changes
- `config:pilot:*` — all pilot config changes
- `config:*` — all config changes (global + project + pilot)

The existing `ChannelRegistry` already supports prefix-glob patterns — no changes needed.

---

## Packages Affected

| Package | Changes |
|---------|---------|
| `daemon` | Project config store, pilot config store (in-memory), config routes, about endpoint, WebSocket message types, broadcasting |
| `web` | Settings routes (general, profile, about), project settings, pilot settings, sidebar navigation, API hooks, build-time about data |

---

## Dependencies

```
project config routes
  -> project settings UI
  -> pilot config routes (for consistency)
       -> pilot settings UI
  -> WebSocket broadcasting (project + pilot)

global settings UI (independent)
about page (independent)
daemon about endpoint (independent)
```
