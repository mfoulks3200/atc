---
title: REST API Reference
sidebar_label: REST API
sidebar_position: 4
---

# REST API Reference

This document describes the REST endpoints exposed by the ATC daemon (the
Fastify server in `packages/daemon`). All routes are mounted under
`/api/v1`. WebSocket endpoints (`/ws`) are documented elsewhere.

The API is currently unauthenticated. Several routes enforce domain
preconditions drawn from the [specification](../specification.md) (referenced
inline by `RULE-*` identifier where applicable).

Request and response bodies are JSON unless otherwise noted. Error
responses use the shape `{ "error": "<message>" }` except for the config
routes (global, project, and pilot), which return
`{ "error": { "code": "...", "message": "...", ... } }`.

## Endpoint Index

### Health

| Method | Path             | Purpose                          |
| ------ | ---------------- | -------------------------------- |
| GET    | `/api/v1/health` | Liveness check, version, uptime. |
| GET    | `/api/v1/status` | Profile name and entity counts.  |
| GET    | `/api/v1/about`  | Daemon version.                  |

### Projects

| Method | Path                          | Purpose                               |
| ------ | ----------------------------- | ------------------------------------- |
| POST   | `/api/v1/projects`            | Create a new project.                 |
| GET    | `/api/v1/projects`            | List all registered projects.         |
| GET    | `/api/v1/projects/:name`      | Get one project by name.              |
| PATCH  | `/api/v1/projects/:name`      | Patch project metadata.               |
| DELETE | `/api/v1/projects/:name`      | Remove a project entirely.            |
| POST   | `/api/v1/projects/:name/sync` | Fetch latest from the project remote. |

### Crafts

| Method | Path                                                | Purpose                         |
| ------ | --------------------------------------------------- | ------------------------------- |
| POST   | `/api/v1/projects/:name/crafts`                     | Create a craft.                 |
| GET    | `/api/v1/projects/:name/crafts`                     | List crafts in a project.       |
| GET    | `/api/v1/projects/:name/crafts/:callsign`           | Get one craft.                  |
| DELETE | `/api/v1/projects/:name/crafts/:callsign`           | Remove a craft.                 |
| POST   | `/api/v1/projects/:name/crafts/:callsign/launch`    | Transition Taxiing -> InFlight. |
| POST   | `/api/v1/projects/:name/crafts/:callsign/checklist` | Run the landing checklist.      |
| POST   | `/api/v1/projects/:name/crafts/:callsign/emergency` | Declare an emergency.           |

### Vectors

| Method | Path                                                                 | Purpose               |
| ------ | -------------------------------------------------------------------- | --------------------- |
| GET    | `/api/v1/projects/:name/crafts/:callsign/vectors`                    | List flight plan.     |
| POST   | `/api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/report` | Report vector passed. |

### Tower

| Method | Path                                     | Purpose                    |
| ------ | ---------------------------------------- | -------------------------- |
| GET    | `/api/v1/projects/:name/tower`           | View landing queue.        |
| POST   | `/api/v1/projects/:name/tower/clearance` | Request landing clearance. |

### Agents

| Method | Path                        | Purpose                           |
| ------ | --------------------------- | --------------------------------- |
| POST   | `/api/v1/agents`            | Create an agent record.           |
| GET    | `/api/v1/agents`            | List agents.                      |
| GET    | `/api/v1/agents/:id`        | Get one agent.                    |
| POST   | `/api/v1/agents/:id/pause`  | Pause an agent.                   |
| POST   | `/api/v1/agents/:id/resume` | Resume a paused agent.            |
| POST   | `/api/v1/agents/recover`    | Recover all suspended agents.     |
| DELETE | `/api/v1/agents/:id`        | Terminate and remove an agent.    |
| GET    | `/api/v1/agents/:id/usage`  | Read usage reports for the craft. |

### Pilots

| Method | Path                                | Purpose          |
| ------ | ----------------------------------- | ---------------- |
| POST   | `/api/v1/projects/:name/pilots`     | Create a pilot.  |
| GET    | `/api/v1/projects/:name/pilots`     | List pilots.     |
| GET    | `/api/v1/projects/:name/pilots/:id` | Get one pilot.   |
| PATCH  | `/api/v1/projects/:name/pilots/:id` | Update a pilot.  |
| DELETE | `/api/v1/projects/:name/pilots/:id` | Delete a pilot.  |

### Intercom

| Method | Path                                               | Purpose                   |
| ------ | -------------------------------------------------- | ------------------------- |
| GET    | `/api/v1/projects/:name/crafts/:callsign/intercom` | List intercom messages.   |
| POST   | `/api/v1/projects/:name/crafts/:callsign/intercom` | Send an intercom message. |

### Black Box

| Method | Path                                               | Purpose                     |
| ------ | -------------------------------------------------- | --------------------------- |
| GET    | `/api/v1/projects/:name/crafts/:callsign/blackbox` | Read the craft's event log. |

### Global Config

| Method | Path                         | Purpose                                  |
| ------ | ---------------------------- | ---------------------------------------- |
| GET    | `/api/v1/config/global`      | Read merged global config and overrides. |
| PUT    | `/api/v1/config/global`      | Replace the global config overrides.     |
| PATCH  | `/api/v1/config/global`      | Patch (merge) global config overrides.   |
| DELETE | `/api/v1/config/global/:key` | Unset a single global config override.   |

### Project Config

| Method | Path                                 | Purpose                                   |
| ------ | ------------------------------------ | ----------------------------------------- |
| GET    | `/api/v1/projects/:name/config`      | Read merged project config and overrides. |
| PUT    | `/api/v1/projects/:name/config`      | Replace the project config overrides.     |
| PATCH  | `/api/v1/projects/:name/config`      | Patch (merge) project config overrides.   |
| DELETE | `/api/v1/projects/:name/config/:key` | Unset a single project config override.   |

### Pilot Config

| Method | Path                                            | Purpose                                 |
| ------ | ----------------------------------------------- | --------------------------------------- |
| GET    | `/api/v1/projects/:name/pilots/:id/config`      | Read merged pilot config and overrides. |
| PUT    | `/api/v1/projects/:name/pilots/:id/config`      | Replace the pilot config overrides.     |
| PATCH  | `/api/v1/projects/:name/pilots/:id/config`      | Patch (merge) pilot config overrides.   |
| DELETE | `/api/v1/projects/:name/pilots/:id/config/:key` | Unset a single pilot config override.   |

### Temporary Flight Restrictions

| Method | Path                    | Purpose                                     |
| ------ | ----------------------- | ------------------------------------------- |
| POST   | `/api/v1/tfrs`          | Issue a new TFR.                            |
| GET    | `/api/v1/tfrs`          | List TFRs (optional `?active=true` filter). |
| POST   | `/api/v1/tfrs/:id/lift` | Lift an active TFR.                         |

---

## Health

Implemented in `packages/daemon/src/server/routes/health.ts`.

### `GET /api/v1/health`

Liveness check. Always returns 200.

Response (`200 OK`):

```ts
{
  status: "ok",
  version: string,   // hard-coded daemon version
  uptime: number     // seconds since process start
}
```

### `GET /api/v1/status`

Runtime status summary. Returns the active profile name and entity
counts. The counts are placeholders and currently always zero.

Response (`200 OK`):

```ts
{
  profile: string,   // currently always "default"
  projects: number,  // placeholder, always 0
  crafts: number,    // placeholder, always 0
  agents: number     // placeholder, always 0
}
```

### `GET /api/v1/about`

Daemon version endpoint. Returns the running daemon's version string
(hard-coded in `packages/daemon/src/server/routes/health.ts`).

Response (`200 OK`):

```ts
{
  version: string
}
```

---

## Projects

Implemented in `packages/daemon/src/server/routes/projects.ts`. Project
state is persisted under `<profileDir>/projects/<name>/metadata.json`,
with a sibling `crafts/` directory and a bare git clone at `repo.git/`.

### `POST /api/v1/projects`

Create a new project. Creates the project directory, writes
`metadata.json`, initializes the `crafts/` subdirectory, and attempts to
clone the bare repo from `remoteUrl`. Clone failure is non-fatal -- the
directory layout is always created.

Request body:

```ts
{
  name: string,
  remoteUrl: string,
  categories: string[],
  checklist: Array<{ name: string, command: string, timeout?: number }>,
  mcpServers?: Record<string, { command: string, args: string[], env?: Record<string, string> }>
}
```

Response (`201 Created`): the persisted `ProjectMetadata` object.

### `GET /api/v1/projects`

List all registered projects. Reads each subdirectory under
`<profileDir>/projects/` and loads its `metadata.json`. Subdirectories
without valid metadata are silently skipped. If the projects directory
does not exist yet, returns an empty array.

Response (`200 OK`): `ProjectMetadata[]`.

### `GET /api/v1/projects/:name`

Retrieve a single project by name.

Response:

- `200 OK` -- `ProjectMetadata`.
- `404 Not Found` -- project directory missing or has no valid
  `metadata.json`.

### `PATCH /api/v1/projects/:name`

Partially update a project's metadata. The request body is shallow-merged
onto the existing metadata; the `name` field is always preserved.

Request body:

```ts
{
  remoteUrl?: string,
  categories?: string[],
  checklist?: Array<{ name: string, command: string, timeout?: number }>,
  mcpServers?: Record<string, { command: string, args: string[], env?: Record<string, string> }>
}
```

Response:

- `200 OK` -- the updated `ProjectMetadata`.
- `404 Not Found` -- project does not exist.

### `DELETE /api/v1/projects/:name`

Remove a project and all its stored state. Recursively deletes the
project directory.

Response: `204 No Content`. Always succeeds (uses `rm -rf`-style
deletion with `force: true`).

### `POST /api/v1/projects/:name/sync`

Synchronize the project's bare repo with its remote (`git fetch --all`).

Response:

- `200 OK` -- `{ synced: true }`.
- `404 Not Found` -- project does not exist.

---

## Crafts

Implemented in `packages/daemon/src/server/routes/crafts.ts`. Crafts are
held in the `CraftStore` and (best-effort) backed by a git worktree under
`<profileDir>/projects/<name>/crafts/<callsign>/worktree`.

### `POST /api/v1/projects/:name/crafts`

Create a new craft. Initializes its flight plan, sets status to
`Taxiing`, and gives the captain exclusive controls. Attempts to create
a worktree from the project's bare repo (non-fatal on failure).

Path params: `name` (project name).

Request body:

```ts
{
  callsign: string,
  branch: string,
  cargo: string,
  category: string,
  captain: string,                    // pilot id
  firstOfficers?: string[],           // defaults to []
  jumpseaters?: string[],             // defaults to []
  flightPlan: Array<{ name: string, acceptanceCriteria: string }>
}
```

Response (`201 Created`): the new `CraftState` (status `Taxiing`,
controls `{ mode: "exclusive", holder: captain }`, all vectors `Pending`).

### `GET /api/v1/projects/:name/crafts`

List crafts in a project, optionally filtered by status.

Query parameters:

- `status` (optional) -- exact `CraftStatus` value to filter on
  (e.g. `InFlight`, `Taxiing`).

Response (`200 OK`): `CraftState[]`.

### `GET /api/v1/projects/:name/crafts/:callsign`

Retrieve a single craft.

Response:

- `200 OK` -- `CraftState`.
- `404 Not Found` -- craft does not exist.

### `DELETE /api/v1/projects/:name/crafts/:callsign`

Remove a craft from the store. Always returns `204 No Content` (the
underlying store call is unconditional).

### `POST /api/v1/projects/:name/crafts/:callsign/launch`

Transition the craft from `Taxiing` to `InFlight`. Implements the
launch preconditions of RULE-LIFE-3.

Preconditions:

- Craft must be in status `Taxiing` -- otherwise `409 Conflict`.
- Craft must have a captain, cargo, and at least one vector in the
  flight plan -- otherwise `400 Bad Request`.

Response:

- `200 OK` -- updated `CraftState` with status `InFlight`.
- `404`, `409`, `400` -- see preconditions above.

### `POST /api/v1/projects/:name/crafts/:callsign/checklist`

Run the project's landing checklist for the craft. Transitions the craft
to `LandingChecklist`, executes each checklist item via the shell
runner, then transitions to `ClearedToLand` on success or `GoAround` on
failure (RULE-LCHK-3).

Preconditions:

- Craft must be in status `InFlight` or `GoAround` -- otherwise
  `409 Conflict`.

Response:

- `200 OK` -- `{ ...checklistResult, status: CraftStatus }`. The
  `checklistResult` carries `passed: boolean` and per-item details from
  the runner.
- `404 Not Found` -- craft or project does not exist.
- `409 Conflict` -- craft not in a valid entry status.

### `POST /api/v1/projects/:name/crafts/:callsign/emergency`

Declare an emergency on the craft. Appends an `EmergencyDeclaration`
black box entry and transitions to `Emergency`.

Request body:

```ts
{
  pilotId: string,   // must equal craft.captain
  reason: string
}
```

Preconditions:

- Only the captain may declare an emergency (RULE-EMER-1) -- otherwise
  `403 Forbidden`.
- Craft must currently be in `GoAround` (lifecycle transition 7) --
  otherwise `400 Bad Request`.

Response:

- `200 OK` -- updated `CraftState` with status `Emergency`.
- `404 Not Found` -- craft does not exist.

---

## Vectors

Implemented in `packages/daemon/src/server/routes/vectors.ts`.

### `GET /api/v1/projects/:name/crafts/:callsign/vectors`

List the craft's flight plan (its ordered `VectorState[]`).

Response:

- `200 OK` -- `VectorState[]`.
- `404 Not Found` -- craft does not exist.

### `POST /api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/report`

Report a vector as passed with evidence. Enforces RULE-VEC-2: the
reported vector must be the next `Pending` vector in flight plan order.
Marks the vector `Passed`, records `evidence`, and stamps `reportedAt`.

Request body:

```ts
{
  evidence: string;
}
```

Response:

- `200 OK` -- the updated `VectorState[]`.
- `404 Not Found` -- craft or vector does not exist.
- `409 Conflict` -- the named vector is not the next `Pending` one.

---

## Tower

Implemented in `packages/daemon/src/server/routes/tower.ts`. Note: only
clearance enqueueing is implemented; the actual merge execution
(RULE-TOWER-3, RULE-TMRG-2, RULE-TMRG-3) is not yet wired up.

### `GET /api/v1/projects/:name/tower`

Read the tower's landing queue for the project.

Response (`200 OK`): the queue as returned by `TowerStore.getQueue` (an
ordered list of callsigns).

### `POST /api/v1/projects/:name/tower/clearance`

Request landing clearance. Verifies all vectors have passed (RULE-TOWER-2)
and enqueues the craft on the tower's landing queue.

Request body:

```ts
{
  callsign: string;
}
```

Response:

- `200 OK` -- `{ granted: true }`.
- `404 Not Found` -- craft does not exist.
- `409 Conflict` -- not all vectors have passed.

---

## Temporary Flight Restrictions

Implemented in `packages/daemon/src/server/routes/tfr.ts`. TFRs pause
agent activity on affected crafts by setting a `holdingPattern` flag as
an overlay -- they do not alter lifecycle state.
See [the specification](../specification.md) §2.6 and §4.5.

### POST `/api/v1/tfrs`

Issue a new Temporary Flight Restriction. The system persists the TFR,
sets `holdingPattern: true` on every affected craft (RULE-TFR-5), and
records a `TFRIssued` entry in each affected craft's black box
(RULE-TFRP-5).

Request body:

```ts
{
  scope: "global" | "project" | "craft";
  target: string | null;                 // project name or callsign; null for global
  mode: "graceful" | "immediate";
  reason: string;
  issuedBy: "user" | "tower";
  projectName?: string;                  // scopes the craft fan-out for affected-craft updates
}
```

Response:

- `201 Created` -- the created `TfrState` with `identifier`, `issuedAt`, and `liftedAt: null`.
- `400 Bad Request` -- scope/target mismatch (RULE-TFR-2): global TFR with non-null target, or project/craft TFR missing a target.
- `403 Forbidden` -- tower attempted to issue a global TFR (RULE-TFR-4).

### GET `/api/v1/tfrs`

List all Temporary Flight Restrictions. By default returns both active
and lifted records (RULE-TFRP-7).

Query parameters:

- `active` -- if `true`, return only TFRs where `liftedAt` is null.

Response (`200 OK`): an array of `TfrState` objects.

### POST `/api/v1/tfrs/:id/lift`

Lift an active TFR (RULE-TFRP-3). Sets `liftedAt` on the record and
records a `TFRLifted` entry on every craft the TFR was affecting
(RULE-TFRP-5). `holdingPattern` is cleared only on crafts where no other
active TFR still applies (RULE-TFR-8).

Query parameters:

- `projectName` -- scopes the craft fan-out to this project when updating
  `holdingPattern` and black box entries.

Response:

- `200 OK` -- the updated `TfrState` with `liftedAt` set.
- `404 Not Found` -- TFR with the given id does not exist.
- `409 Conflict` -- TFR is already lifted.

---

## Agents

Implemented in `packages/daemon/src/server/routes/agents.ts`. Agent
records have a non-spec `AgentStatus` (`running`, `paused`, `suspended`,
`terminated`).

### `POST /api/v1/agents`

Create a new agent record. The new record always starts with
`status: "running"` and an empty `adapterMeta` map.

Request body:

```ts
{
  id: string,
  adapterType: string,
  projectName: string,
  callsign: string
}
```

Response (`201 Created`): the persisted `AgentRecord`.

### `GET /api/v1/agents`

List all agent records.

Response (`200 OK`): `AgentRecord[]`.

### `GET /api/v1/agents/:id`

Retrieve a single agent record.

Response:

- `200 OK` -- `AgentRecord`.
- `404 Not Found` -- unknown agent id.

### `POST /api/v1/agents/:id/pause`

Set the agent's status to `paused`.

Response:

- `200 OK` -- the updated `AgentRecord`.
- `404 Not Found` -- unknown agent id.

### `POST /api/v1/agents/:id/resume`

Set the agent's status to `running`.

Response:

- `200 OK` -- the updated `AgentRecord`.
- `404 Not Found` -- unknown agent id.

### `POST /api/v1/agents/recover`

Recover every agent currently in `suspended` status by transitioning it
back to `running`. Takes no body.

Response (`200 OK`): `{ recovered: number }` -- the count of agents
restored.

### `DELETE /api/v1/agents/:id`

Mark an agent as `terminated` and remove its record from the store.

Response:

- `204 No Content`.
- `404 Not Found` -- unknown agent id.

### `GET /api/v1/agents/:id/usage`

Read the line-delimited usage report log
(`<profileDir>/projects/<projectName>/crafts/<callsign>/usage.json`)
for the agent's craft.

Response:

- `200 OK` -- an array of parsed JSON objects (one per line). Returns an
  empty array if the file is missing or unreadable.
- `404 Not Found` -- unknown agent id.

---

## Pilots

Implemented in `packages/daemon/src/server/routes/pilots.ts`. Pilot
records are persisted by `PilotStore`
(`packages/daemon/src/state/pilot-store.ts`), which backs a two-level
`Map<project, Map<identifier, PilotRecord>>` with an atomic JSON file
(`pilots.json`) in the state directory. Records are loaded on daemon
startup and flushed alongside agents and crafts on the periodic state
flush interval and on graceful shutdown.

### `POST /api/v1/projects/:name/pilots`

Create or replace a pilot record within the project. The supplied
`identifier` is used as the map key.

Request body:

```ts
{
  identifier: string,
  certifications: string[],
  mcpServers?: Record<string, { command: string, args: string[], env?: Record<string, string> }>
}
```

Response (`201 Created`): the new `PilotRecord`.

### `GET /api/v1/projects/:name/pilots`

List all pilots for a project. Returns `[]` if the project has no
pilot map yet.

Response (`200 OK`): `PilotRecord[]`.

### `GET /api/v1/projects/:name/pilots/:id`

Retrieve a single pilot.

Response:

- `200 OK` -- `PilotRecord`.
- `404 Not Found` -- pilot not found.

### `PATCH /api/v1/projects/:name/pilots/:id`

Partially update a pilot. The body is shallow-merged onto the existing
record; `identifier` is always preserved.

Request body:

```ts
{
  certifications?: string[],
  mcpServers?: Record<string, { command: string, args: string[], env?: Record<string, string> }>
}
```

Response:

- `200 OK` -- the updated `PilotRecord`.
- `404 Not Found` -- pilot not found.

### `DELETE /api/v1/projects/:name/pilots/:id`

Remove a pilot record from the project.

Response:

- `204 No Content` -- pilot deleted.
- `404 Not Found` -- pilot not found.

---

## Intercom

Implemented in `packages/daemon/src/server/routes/intercom.ts`.

### `GET /api/v1/projects/:name/crafts/:callsign/intercom`

Read the craft's intercom message log.

Response:

- `200 OK` -- `IntercomMessage[]`.
- `404 Not Found` -- craft does not exist.

### `POST /api/v1/projects/:name/crafts/:callsign/intercom`

Append a message to the craft's intercom log. The server stamps
`timestamp` with the current ISO time.

Request body:

```ts
{
  from: string,    // pilot identifier
  seat: string,    // seat type as a string
  content: string
}
```

Response:

- `200 OK` -- the appended `IntercomMessage` (including the
  server-generated `timestamp`).
- `404 Not Found` -- craft does not exist.

Note: this route does not validate the `seat` value or check that the
sender is a member of the craft's crew.

---

## Black Box

Implemented in `packages/daemon/src/server/routes/blackbox.ts`. The
black box is read-only over REST; entries are appended internally as
side effects of other operations (for example, `POST .../emergency`).

### `GET /api/v1/projects/:name/crafts/:callsign/blackbox`

Read the craft's append-only event log.

Response:

- `200 OK` -- `BlackBoxEntry[]`.
- `404 Not Found` -- craft does not exist.

---

## Global Config

Implemented in `packages/daemon/src/server/routes/config.ts`. All
mutations funnel through the daemon's `LayeredConfigStore<GlobalConfig>`,
which atomically persists the sparse override diff against defaults and
broadcasts change events on the `config:global` WebSocket channel.

If no global config store is wired to the Fastify instance, every route
in this section short-circuits with `503 Service Unavailable` and the
body `{ "error": { "code": "UNAVAILABLE", "message": "Global config store not available" } }`.

Errors from the underlying store are mapped as follows:

- `ConfigValidationError` -> `400 Bad Request`,
  `{ "error": { "code": "INVALID_CONFIG", "message": ..., "issues": [...] } }`.
- `UnknownConfigKeyError` -> `404 Not Found`,
  `{ "error": { "code": "UNKNOWN_CONFIG_KEY", "message": ... } }`.
- Anything else -> `500 Internal Server Error`,
  `{ "error": { "code": "INTERNAL", "message": ... } }`.

### `GET /api/v1/config/global`

Read the merged effective global config and the sparse overrides
currently set on top of defaults.

Response (`200 OK`):

```ts
{
  config: GlobalConfig,            // merged defaults + overrides
  overrides: Partial<GlobalConfig> // raw override map persisted to disk
}
```

### `PUT /api/v1/config/global`

Replace all overrides with the supplied object. Validates the resulting
config against the schema.

Request body: a `GlobalConfig` (object).

Response:

- `200 OK` -- `{ config: GlobalConfig }` (the merged result).
- `400`, `404`, `500` -- see error mapping above.

### `PATCH /api/v1/config/global`

Patch the overrides by shallow-merging the request body into the current
overrides. Validates the resulting config.

Request body: `Partial<GlobalConfig>`.

Response:

- `200 OK` -- `{ config: GlobalConfig }` (the merged result).
- `400`, `404`, `500` -- see error mapping above.

### `DELETE /api/v1/config/global/:key`

Unset a single override key, falling back to its default. The `:key`
path parameter must be a known top-level key of `GlobalConfig`.

Response:

- `200 OK` -- `{ config: GlobalConfig }` (the merged result).
- `404 Not Found` -- unknown config key.
- `400`, `500` -- see error mapping above.

---

## Project Config

Implemented in `packages/daemon/src/server/routes/project-config.ts`.
Each registered project is backed by its own
`LayeredConfigStore<ProjectMetadataConfig>` created by
`createProjectConfigStore` (see
`packages/daemon/src/config/project-store.ts`). The store atomically
persists the sparse override diff against defaults to
`<profileDir>/projects/<name>/metadata.json` and broadcasts change events
on the `config:project:<name>` WebSocket channel.

If the project has no registered config store, every route in this
section short-circuits with `404 Not Found` and the body
`{ "error": { "code": "PROJECT_NOT_FOUND", "message": "Project not found: <name>" } }`.

Errors from the underlying store are mapped the same way as global
config routes (`INVALID_CONFIG` -> 400, `UNKNOWN_CONFIG_KEY` -> 404,
anything else -> 500).

### `GET /api/v1/projects/:name/config`

Read the merged effective project config and the sparse overrides
currently set on top of defaults.

Response (`200 OK`):

```ts
{
  config: ProjectMetadataConfig,            // merged defaults + overrides
  overrides: Partial<ProjectMetadataConfig> // raw override map persisted to disk
}
```

### `PUT /api/v1/projects/:name/config`

Replace all overrides with the supplied object. Validates the resulting
config against `PROJECT_METADATA_SCHEMA`.

Request body: a `ProjectMetadataConfig` (object).

Response:

- `200 OK` -- `{ config: ProjectMetadataConfig }`.
- `400`, `404`, `500` -- see error mapping above.

### `PATCH /api/v1/projects/:name/config`

Patch the overrides by shallow-merging the request body into the current
overrides. Validates the resulting config.

Request body: `Partial<ProjectMetadataConfig>`.

Response:

- `200 OK` -- `{ config: ProjectMetadataConfig }`.
- `400`, `404`, `500` -- see error mapping above.

### `DELETE /api/v1/projects/:name/config/:key`

Unset a single override key, falling back to its default. The `:key`
path parameter must be a known top-level key of `ProjectMetadataConfig`.

Response:

- `200 OK` -- `{ config: ProjectMetadataConfig }`.
- `404 Not Found` -- unknown config key or unknown project.
- `400`, `500` -- see error mapping above.

---

## Pilot Config

Implemented in `packages/daemon/src/server/routes/pilot-config.ts`.
Backed by the in-memory `PilotConfigStore`
(`packages/daemon/src/config/pilot-config-store.ts`) keyed by pilot id.
The store provides the same surface as `LayeredConfigStore` but has no
file persistence -- overrides are lost on daemon restart. Changes
broadcast on the `config:pilot:<id>` WebSocket channel.

The `:name` path parameter is accepted but unused; pilot config is keyed
only by `:id`. Unknown pilots return the config defaults for a fresh
pilot (no 404).

### `GET /api/v1/projects/:name/pilots/:id/config`

Read the merged pilot config and sparse overrides.

Response (`200 OK`):

```ts
{
  config: PilotConfig,            // merged defaults + overrides
  overrides: Partial<PilotConfig> // raw override map in memory
}
```

### `PUT /api/v1/projects/:name/pilots/:id/config`

Replace all overrides with the supplied object. Validates the resulting
config against `PILOT_CONFIG_SCHEMA`.

Request body: a `PilotConfig` (object).

Response:

- `200 OK` -- `{ config: PilotConfig }`.
- `400 Bad Request` -- `{ "error": { "code": "INVALID_CONFIG", "message": ... } }`.

### `PATCH /api/v1/projects/:name/pilots/:id/config`

Patch the overrides by shallow-merging the request body into the current
overrides.

Request body: `Partial<PilotConfig>`.

Response (`200 OK`): `{ config: PilotConfig }`.

### `DELETE /api/v1/projects/:name/pilots/:id/config/:key`

Unset a single override key, falling back to its default. The `:key`
path parameter must be a known top-level key of `PilotConfig`.

Response:

- `200 OK` -- `{ config: PilotConfig }`.
- `404 Not Found` -- unknown config key.
- `500 Internal Server Error` -- anything else.
