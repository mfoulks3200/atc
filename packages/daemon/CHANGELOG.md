# @airtrafficcontrol/daemon Changelog

## Unreleased

### Added

- `CraftState.createdAt: string` (ISO-8601) — required field set at craft creation and exposed via the REST API.
- `CraftStore.loadProject` backfills missing `createdAt` on legacy `craft.json` files from the earliest black-box entry, falling back to the current time when the log is empty. In-memory migration only; the on-disk file is not rewritten.
- `LayeredConfigStore<T>` — generic, runtime-editable config store that owns in-memory state for a single scope, persists only the sparse diff against defaults, and funnels all mutations (REST, WebSocket, file-watch) through one apply path. Emits `change` events on an injected pub/sub channel and exposes `load`, `get`, `getOverrides`, `replace`, `patch`, `unset`, `start`, `stop`, and `on("change" | "invalid_external_edit", …)`.
- File-watch behavior on `LayeredConfigStore`: debounced `fs.watch` reloads with last-write fingerprinting (mtime + sha256 content hash) to skip self-writes. Invalid external edits are logged and emitted as `invalid_external_edit` events without corrupting in-memory state.
- `createGlobalConfigStore(atcDir, publish, logger)` — factory that wires a `LayeredConfigStore<GlobalConfig>` to the canonical schema, defaults, `<atcDir>/config.json` path, and `config:global` channel. Constructed by daemon bootstrap and exposed to the HTTP/WS layer as `app.globalConfigStore`.
- REST routes under `/api/v1/config/global`: `GET` (returns merged config and sparse overrides), `PUT` (full replace), `PATCH` (partial merge), `DELETE /:key` (revert one known key to default). `ConfigValidationError` maps to `400 INVALID_CONFIG` with Zod issues attached; `UnknownConfigKeyError` maps to `404 UNKNOWN_CONFIG_KEY`; absence of the store returns `503 UNAVAILABLE`.
- WebSocket client messages `config.patch`, `config.replace`, and `config.unset` dispatch to the same store, returning `config.ack` frames with either the merged result or a structured error.
- Integration smoke test covering the global-config HTTP and WebSocket surface end-to-end.

### Changed

- Config schemas migrated from hand-rolled validation to Zod (`GLOBAL_CONFIG_SCHEMA`, `PROFILE_CONFIG_SCHEMA`). Loaders now parse through Zod and surface structured issues via `ConfigValidationError`.

### Dependencies

- Added `zod` as a runtime dependency for config validation.
