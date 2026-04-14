# @airtrafficcontrol/daemon Changelog

## Unreleased

### Added

- `publishCraftEvent` / `publishCraftRemoved` helpers (`src/server/routes/broadcast.ts`) — fan out craft mutations to both the per-craft (`craft:<callsign>`) and per-project (`project:<name>`) WebSocket channels as structured `WsEvent` payloads. Called from every mutation route (craft create/delete/launch/checklist/emergency, vector report, intercom post, tower clearance) so subscribed clients receive live updates without polling. Tower clearance additionally emits a `tower:<project>` `tower.queue.changed` event.
- `AgentManager` (`src/process/agent-manager.ts`) — owns agent subprocess lifecycles. Resolves adapters via `AdapterRegistry`, delegates launch/stop to the adapter, tracks live `AgentHandle`s keyed by agent id, and keeps `AgentStore` in sync. Supports crash detection via `reap()` (polls PIDs through the `isProcessAlive` probe and marks dead agents `terminated`) and daemon-restart re-attach via `reattach()` (rebuilds handles for records whose PID is still live, marks the rest `terminated`).
- `POST /api/v1/agents/launch` — launches a new agent for a craft through the `AgentManager`. Resolves the craft and its captain pilot, validates the adapter type, then calls `adapterRegistry.get(adapterType).launch(...)` and persists the returned handle as an `AgentRecord`. Returns `201` with the record, `404` for missing craft/captain, `400` for missing captain/unknown adapter, `503` if the manager is not configured.
- `AppOptions.agentManager` / `FastifyInstance.agentManager` decoration so routes can reach the shared manager instance. `DELETE /api/v1/agents/:id` now routes through `agentManager.stop(...)` when the manager is configured, so the adapter's `terminate` hook is invoked before the record is removed.
- `Daemon.start()` constructs an `AdapterRegistry` + `AgentManager`, calls `reattach()` on the persisted `AgentStore`, and passes both into `createApp`.
- `seedDemo(options)` and `pnpm run seed:demo` — first-run seeder that creates a throwaway `demo` project, a captain pilot, and a two-vector `demo-flight-001` craft pointing at a local scratch bare repo under `<profileDir>/scratch/demo-repo.git`. Idempotent by default; pass `--force` / `force: true` to wipe and recreate. Exposed via the package barrel alongside `DEMO_PROJECT_NAME`, `DEMO_PILOT_ID`, `DEMO_CALLSIGN`, `DEMO_BRANCH`, `SeedDemoOptions`, and `SeedDemoResult`.
- `CraftState.createdAt: string` (ISO-8601) — required field set at craft creation and exposed via the REST API.
- `CraftStore.loadProject` backfills missing `createdAt` on legacy `craft.json` files from the earliest black-box entry, falling back to the current time when the log is empty. In-memory migration only; the on-disk file is not rewritten.
- `LayeredConfigStore<T>` — generic, runtime-editable config store that owns in-memory state for a single scope, persists only the sparse diff against defaults, and funnels all mutations (REST, WebSocket, file-watch) through one apply path. Emits `change` events on an injected pub/sub channel and exposes `load`, `get`, `getOverrides`, `replace`, `patch`, `unset`, `start`, `stop`, and `on("change" | "invalid_external_edit", …)`.
- File-watch behavior on `LayeredConfigStore`: debounced `fs.watch` reloads with last-write fingerprinting (mtime + sha256 content hash) to skip self-writes. Invalid external edits are logged and emitted as `invalid_external_edit` events without corrupting in-memory state.
- `createGlobalConfigStore(atcDir, publish, logger)` — factory that wires a `LayeredConfigStore<GlobalConfig>` to the canonical schema, defaults, `<atcDir>/config.json` path, and `config:global` channel. Constructed by daemon bootstrap and exposed to the HTTP/WS layer as `app.globalConfigStore`.
- REST routes under `/api/v1/config/global`: `GET` (returns merged config and sparse overrides), `PUT` (full replace), `PATCH` (partial merge), `DELETE /:key` (revert one known key to default). `ConfigValidationError` maps to `400 INVALID_CONFIG` with Zod issues attached; `UnknownConfigKeyError` maps to `404 UNKNOWN_CONFIG_KEY`; absence of the store returns `503 UNAVAILABLE`.
- WebSocket client messages `config.patch`, `config.replace`, and `config.unset` dispatch to the same store, returning `config.ack` frames with either the merged result or a structured error.
- Integration smoke test covering the global-config HTTP and WebSocket surface end-to-end.
- `TfrStore` — in-memory store for Temporary Flight Restrictions backed by atomic JSON persistence at `<stateDir>/tfrs.json`. Supports `get`, `set`, `list`, `listActive`, `findAffecting(projectName, callsign)` (RULE-TFR-7), plus `save`/`load`. Active and lifted TFRs are retained together for audit (RULE-TFRP-7).
- `TfrState` interface — daemon representation of a TFR with ISO-8601 timestamps and lowercase scope/mode strings.
- `CraftState.holdingPattern: boolean` — overlay flag set on affected crafts while a TFR is active. @see RULE-TFR-5
- REST routes for TFRs:
  - `POST /api/v1/tfrs` — issues a new TFR. Validates scope/target (RULE-TFR-2, returns 400) and rejects tower-issued global TFRs (RULE-TFR-4, returns 403). Accepts an optional `projectName` to scope the fan-out; sets `holdingPattern: true` and records a `TFRIssued` black box entry on every affected craft (RULE-TFRP-5).
  - `GET /api/v1/tfrs` — lists all TFRs; `?active=true` filters to only non-lifted records.
  - `POST /api/v1/tfrs/:id/lift` — lifts an active TFR (RULE-TFRP-3). Returns 404 if missing, 409 if already lifted. Clears `holdingPattern` on affected crafts only when no other active TFR still applies (RULE-TFR-8) and records a `TFRLifted` black box entry (RULE-TFRP-5).
- `app.tfrStore` decoration — exposes the TfrStore to route handlers.
- `tfr:global` WebSocket channel — published by the TFR routes when a global-scoped TFR is issued (`event: "tfr.issued"`) or lifted (`event: "tfr.lifted"`). Payload is a `WsEvent` with `data: { tfr: TfrState }`. Project- and craft-scoped TFRs do not publish on this channel. Enables dashboards and scripts to react to global TFR state changes without polling.

### Changed

- Config schemas migrated from hand-rolled validation to Zod (`GLOBAL_CONFIG_SCHEMA`, `PROFILE_CONFIG_SCHEMA`). Loaders now parse through Zod and surface structured issues via `ConfigValidationError`.

### Dependencies

- Added `zod` as a runtime dependency for config validation.
