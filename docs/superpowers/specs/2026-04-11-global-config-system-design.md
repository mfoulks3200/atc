# Global Configuration System — Design

**Status:** Draft
**Date:** 2026-04-11
**Scope:** `@atc/daemon` global configuration read/write plumbing, with a generic primitive reusable for project and agent configuration in later work.

## Motivation

Today, `GlobalConfig` is loaded once at daemon startup from `<atcDir>/config.json` by `loadGlobalConfig` in `packages/daemon/src/config/loader.ts`. There is no writer. Any change requires hand-editing the file and restarting the daemon. The configuration surface will grow (profile, project, agent scopes), and the web dashboard and future CLI both need live read/write access.

This design introduces a unified read/write primitive, starting with global configuration. Project and agent configuration are out of scope for this task but the primitive is designed so they can be added without new infrastructure.

## Goals

1. Global config is readable and writable at runtime from three sources: REST, WebSocket, and direct disk edits.
2. Writes persist only fields that differ from the canonical defaults (sparse on-disk shape).
3. Reads always return a fully-merged view: defaults plus overrides.
4. External edits to `config.json` take effect live without restarting the daemon.
5. All mutations broadcast over the existing WebSocket `ChannelRegistry` so subscribers see a consistent view.
6. Validation uses Zod. The existing hand-written `validatePartialProfileConfig` is migrated to Zod at the same time so the codebase has one validation style.
7. Unknown fields in config files are preserved through round-trips with a one-time warning per key per load.
8. The primitive is generic enough that `ProjectConfigStore` and `AgentConfigStore` can reuse it with no new infrastructure.

## Non-goals

- Standing up a project or agent configuration store. Only the schema of `ProfileConfig` migrates to Zod; profile config itself remains read-once at startup.
- Authentication or authorization on config mutations. They inherit the daemon's existing trust model (loopback binding, no auth).
- Building a CLI. The REST/WS surface is designed so a future CLI is a thin wrapper.
- Deep (nested-object) diff-against-defaults. v1 uses shallow top-level diffing.
- Tests against real editors' atomic-save behavior. Tests simulate external edits via direct file writes.

## Architecture

A single generic primitive, `LayeredConfigStore<T>`, owns all state for one configuration scope. `GlobalConfigStore` is a thin wrapper that instantiates it with the global schema, defaults, file path, and pub/sub channel name.

### `LayeredConfigStore<T>`

Lives at `packages/daemon/src/config/layered-store.ts`. Constructor parameters:

- `schema: z.ZodType<T>` — Zod schema. Unknown fields are allowed and preserved (no `.strict()`).
- `defaults: T` — canonical defaults.
- `filePath: string` — absolute path to the JSON file backing this store.
- `channel: string` — pub/sub channel name for broadcasts (e.g. `"config:global"`).
- `publish: (channel: string, data: unknown) => void` — injected `ChannelRegistry.publish` bound method.
- `logger: Logger` — for unknown-field warnings and invalid-edit reports.

In-memory state:

1. `overrides: Partial<T> & Record<string, unknown>` — the sparse object actually on disk. Known keys that differ from defaults plus any preserved unknown keys.
2. `merged: T` — defaults ∪ overrides, fully hydrated. This is what reads return.
3. `unknownKeys: Set<string>` — currently-preserved unknown keys. Used to emit a single warning per key per load.
4. `lastWrite: { mtimeMs: number; contentHash: string } | null` — fingerprint of the last self-initiated write, used to suppress file-watch echo.

### Method surface

```ts
class LayeredConfigStore<T extends object> {
  // reads
  get(): T;
  getOverrides(): Partial<T> & Record<string, unknown>;

  // writes — all three funnel through applyCandidate()
  replace(next: T): Promise<T>;
  patch(partial: Partial<T>): Promise<T>;
  unset(key: keyof T & string): Promise<T>;

  // lifecycle
  load(): Promise<void>;
  start(): void;
  stop(): Promise<void>;

  // events
  on(event: "change", listener: (merged: T, source: ChangeSource) => void): void;
  on(event: "invalid_external_edit", listener: (error: ConfigValidationError) => void): void;
}

type ChangeSource = "api" | "file" | "init";
```

### The `applyCandidate` internal path

Every successful mutation — REST, WS, or file watcher — goes through one private method:

```ts
private async applyCandidate(candidate: unknown, source: ChangeSource): Promise<T>;
```

Steps:

1. **Validate** `candidate` against `schema`. On failure, throw `ConfigValidationError` with the `ZodIssue[]`.
2. **Compute sparse diff.** Top-level key-by-key comparison against `defaults`. A key is kept if `!isEqual(candidate[k], defaults[k])`. For primitives this is `===`; for nested objects/arrays, equality uses a stable `JSON.stringify` comparison (sufficient for v1 — fields are small and JSON-serializable by definition). The diff is "shallow" in the sense that a nested object is treated as a single value: if any sub-field of `adapter` differs, the whole `adapter` object is persisted.
3. **Merge preserved unknown keys** from the existing `overrides` into the new sparse object. Unknown keys cannot be added via API writes (those go through Zod validation of the known shape), so they only enter via file edits.
4. **Serialize** to JSON (2-space indent, trailing newline).
5. **Atomic write**: write to `${filePath}.tmp`, `fsync`, then `rename` over `filePath`. Matches the atomic-write pattern used by the existing state stores.
6. **Record fingerprint**: `lastWrite = { mtimeMs, contentHash }` where `contentHash` is a stable hash of the serialized bytes.
7. **Update in-memory state**: `overrides` and `merged`.
8. **Emit** `change` event with the merged snapshot and the source.
9. **Publish** on the injected channel with payload `{ config: merged, source }`.

Steps 5–9 run only if validation and diffing succeed. A failure at step 1 leaves in-memory state and the disk file untouched.

### File watching

`start()` uses `fs.watch` (Node built-in, no new dependency). Event handling:

- **Debounce** with a 50 ms trailing window so editors that write in multiple syscalls produce one reload.
- **Self-write echo suppression**: on each fired event, read `filePath` and compute `{ mtimeMs, contentHash }`. If it matches `lastWrite`, ignore.
- **External edit detected**: read and parse `filePath`, then call `applyCandidate(parsed, "file")`.
- **Parse error or validation error**: log a structured error, leave in-memory state untouched, emit an `invalid_external_edit` event with the error. The store remains usable; a subsequent valid edit applies normally.
- **File deleted**: treat as revert-to-defaults. `overrides = {}`, `merged = { ...defaults }`, emit `change` with `source: "file"`. Do not recreate the file until the next write.

`stop()` closes the watcher and awaits any in-flight write.

### `load()` semantics

`load()` is separate from `applyCandidate`. It reads the file once, validates, populates `overrides`/`merged`/`unknownKeys`, and emits a single `change` event with `source: "init"`. It does **not** write back to disk — if the file contains preserved unknown keys or is absent, no I/O happens until the first real mutation. This keeps startup idempotent and avoids rewriting files the user hasn't asked us to touch.

### Unknown fields

On `load()`, any key present in the file but not in the Zod schema's known shape is:

1. Kept in `overrides` verbatim.
2. Added to `unknownKeys`.
3. Logged once at `warn` level: `"Unknown config field in ${filePath}: ${key}"`.
4. Excluded from the merged view returned by `get()` (the merged view is typed as `T`, so only schema-known fields are surfaced).

On external edits, any newly introduced unknown key repeats steps 1–3. Known-key updates don't re-emit warnings for already-known unknown keys.

On API writes (`replace`, `patch`, `unset`), unknown keys can't be added or removed — those methods' bodies are validated against the Zod schema, which only knows the declared shape. Unknown keys from prior file edits persist through API writes because step 3 of `applyCandidate` merges them back in.

## Scope-specific wiring: `GlobalConfigStore`

`packages/daemon/src/config/global-store.ts`:

```ts
export function createGlobalConfigStore(
  atcDir: string,
  publish: ChannelRegistry["publish"],
  logger: Logger,
): LayeredConfigStore<GlobalConfig> {
  return new LayeredConfigStore<GlobalConfig>({
    schema: GLOBAL_CONFIG_SCHEMA,
    defaults: GLOBAL_CONFIG_DEFAULTS,
    filePath: join(atcDir, "config.json"),
    channel: "config:global",
    publish,
    logger,
  });
}
```

Wired into the daemon bootstrap (`packages/daemon/src/daemon.ts` or equivalent) so it is constructed after the `ChannelRegistry` is available, `load()`ed, and `start()`ed before the HTTP/WS server begins accepting connections. `stop()` is called during daemon shutdown.

The existing `loadGlobalConfig` function in `loader.ts` is deleted. Callers use the store.

## Schema migration to Zod

`packages/daemon/src/config/schema.ts` is rewritten:

```ts
import { z } from "zod";

export const GLOBAL_CONFIG_SCHEMA = z.object({
  defaultProfile: z.string(),
});

export const PROFILE_CONFIG_SCHEMA = z.object({
  port: z.number().int().min(1).max(65535),
  host: z.string(),
  logLevel: z.enum(["debug", "info", "warn", "error"]),
  autoRecover: z.boolean(),
  wsHeartbeatInterval: z.number(),
  stateFlushInterval: z.number(),
  adapter: z.object({
    type: z.string(),
    config: z.record(z.unknown()),
  }),
});

export type GlobalConfig = z.infer<typeof GLOBAL_CONFIG_SCHEMA>;
export type ProfileConfig = z.infer<typeof PROFILE_CONFIG_SCHEMA>;

export const GLOBAL_CONFIG_DEFAULTS: GlobalConfig = { defaultProfile: "default" };

export const PROFILE_CONFIG_DEFAULTS: ProfileConfig = {
  port: 7700,
  host: "127.0.0.1",
  logLevel: "info",
  autoRecover: false,
  wsHeartbeatInterval: 15,
  stateFlushInterval: 30,
  adapter: { type: "claude-agent-sdk", config: {} },
};
```

The hand-written `GlobalConfig` and `ProfileConfig` interfaces in `packages/daemon/src/types.ts` are removed and imported from `config/schema.ts` instead. `validatePartialProfileConfig`, `isValidPort`, `isValidLogLevel` are deleted — callers switch to `PROFILE_CONFIG_SCHEMA.parse()` / `.safeParse()`.

`loadProfileConfig` in `loader.ts` is updated to use `PROFILE_CONFIG_SCHEMA` but keeps its current read-once semantics. It is **not** promoted to a `LayeredConfigStore` in this task — that is a follow-up when project/agent config lands.

**New dependency:** `zod` is added to `packages/daemon/package.json`.

## REST API

New file `packages/daemon/src/server/routes/config.ts`, routes registered under `/api/v1/config`:

| Method | Path | Body | Success response | Notes |
|---|---|---|---|---|
| `GET` | `/api/v1/config/global` | — | `200 { config: T, overrides: Partial<T> }` | Merged view plus sparse on-disk shape. |
| `PUT` | `/api/v1/config/global` | `T` | `200 { config: T }` | Full replace; omitted known fields revert to default. |
| `PATCH` | `/api/v1/config/global` | `Partial<T>` | `200 { config: T }` | Shallow merge; omitted fields untouched. |
| `DELETE` | `/api/v1/config/global/:key` | — | `200 { config: T }` | Reverts one known key to default. `404` if key is not in the schema. |

Path segment is `/config/global` so `/config/projects/:id` and `/config/agents/:id` slot in later without restructuring.

### Error mapping

A Fastify `setErrorHandler` (or per-route `try`/`catch`) maps:

- `ConfigValidationError` → `400 { error: { code: "INVALID_CONFIG", message, issues: ZodIssue[] } }`.
- `UnknownConfigKeyError` (from `DELETE /:key` on a key not in the schema) → `404 { error: { code: "UNKNOWN_CONFIG_KEY", message } }`.
- Anything else → `500` via the existing handler.

## WebSocket API

Two pieces, both in `packages/daemon/src/server/websocket/handler.ts`.

### Change broadcasts

The `LayeredConfigStore` already publishes on its configured channel inside `applyCandidate`. No handler changes are required for broadcasts themselves — clients subscribe to `"config:global"` (or the glob `"config:*"`) using the existing subscribe protocol and receive `{ config, source }` payloads.

### Mutations over WebSocket

New message types handled in the WS handler:

```ts
{ type: "config.patch",   scope: "global", body: Partial<T>, requestId: string }
{ type: "config.replace", scope: "global", body: T,          requestId: string }
{ type: "config.unset",   scope: "global", key: string,      requestId: string }
```

Each is dispatched to `globalConfigStore.patch() / replace() / unset()` and produces an ack:

```ts
{ type: "config.ack", requestId, ok: true,  config: T }
{ type: "config.ack", requestId, ok: false, error: { code, message, issues? } }
```

The `scope` field is present from the start so `scope: "project"` / `scope: "agent"` slot in later. For this task only `"global"` is accepted; other scopes return `{ ok: false, error: { code: "UNKNOWN_SCOPE" } }`.

## Errors

New error class in `packages/errors/src/config.ts` (or colocated with existing error classes following the package's convention):

```ts
export class ConfigValidationError extends AtcError {
  readonly ruleId = "RULE-CFG-1";
  readonly scope: "global" | "profile" | "project" | "agent";
  readonly issues: ZodIssue[];

  constructor(scope: ConfigValidationError["scope"], issues: ZodIssue[], message?: string);
}
```

`RULE-CFG-1` is a placeholder. Adding a `CFG` rule family to `docs/specification.md` (and Appendix A's Rule Index) is a follow-up — not in scope for this task, but the rule id is chosen now so code and spec stay aligned when the rule lands.

## Data flow summary

```
                     ┌──────────────────────────────┐
                     │       GlobalConfigStore       │
                     │   (LayeredConfigStore<T>)     │
                     └──────────────┬───────────────┘
                                    │
           ┌───────────┬────────────┴────────────┬─────────────┐
           │           │                         │             │
     REST route   WS handler                File watcher   daemon boot
     (config.ts)  (handler.ts)               (start())      (load())
           │           │                         │             │
           ▼           ▼                         ▼             ▼
                     applyCandidate(candidate, source)
                                    │
          ┌─────────────┬───────────┼──────────┬────────────┐
          ▼             ▼           ▼          ▼            ▼
       Zod parse   sparse diff   atomic   update in-   publish
                                 write    memory state  config:global
```

## Testing

Colocated `*.test.ts` files per existing repo convention. Target ≥ 90% coverage on touched files per `docs/contributing.md`.

### `config/schema.test.ts`

- Zod schemas for global and profile accept valid shapes.
- Each invalid field produces a readable `ZodIssue`.
- Unknown fields pass through (not stripped).
- Migration parity: every case currently covered by `validatePartialProfileConfig` still rejects or accepts the same way under the new schema.

### `config/layered-store.test.ts`

Tests the generic primitive against a tiny synthetic schema so they don't depend on global/profile specifics.

- `load()` with missing file: `get()` returns defaults; `getOverrides()` returns `{}`.
- `load()` with partial file: merged view fills gaps; overrides preserved verbatim.
- `load()` with an unknown field: warning logged once; field preserved in `overrides`; absent from `get()`.
- `load()` with an invalid field value: throws `ConfigValidationError`.
- `replace()` with input matching defaults exactly: writes `{}` to disk.
- `replace()` with partial non-default input: disk contains only the diff.
- `patch()`: merges into current state; fields that equal defaults after merge are dropped from disk.
- `unset()` on a known key that is currently overridden: reverts to default, removes from `overrides`.
- `unset()` on a known key that is already at default: no-op, still emits a `change` event for consistency.
- `unset()` on a key not in the schema: throws `UnknownConfigKeyError` (distinct from `ConfigValidationError`), mapped to 404 at the REST layer.
- Every successful mutation emits exactly one `change` event with `source: "api"`.
- Writes are atomic: assert the write sequence (temp file + rename) by mocking `fs` or observing fs events.

### `config/layered-store.watch.test.ts`

Isolated so the main suite stays fast.

- External edit → `change` event with `source: "file"`, merged view updates.
- Self-write echo → no extra event beyond the one emitted by the write path.
- Debounce → two external writes within 50 ms produce one event.
- File deletion → revert-to-defaults event.
- Invalid external edit → `invalid_external_edit` event, in-memory state unchanged, store remains usable; a subsequent valid edit applies normally.
- Unknown key added externally → warning logged, field preserved in `overrides`, `change` event fires.

### `config/global-store.test.ts`

Thin. Constructs `createGlobalConfigStore` against a tmpdir, verifies it is wired to `GLOBAL_CONFIG_SCHEMA`, `GLOBAL_CONFIG_DEFAULTS`, channel `"config:global"`, and `config.json` path. No re-testing of generic semantics.

### `server/routes/config.test.ts`

Fastify route tests using `fastify.inject()`:

- `GET` returns merged-plus-overrides shape.
- `PUT` with valid body → 200, store state updated.
- `PUT` with invalid body → 400 with `INVALID_CONFIG` code and `issues` array.
- `PATCH` semantics: partial, omitted keys untouched.
- `DELETE /:key` on known key reverts; on unknown key returns 404.
- Each successful mutation publishes on `config:global` (assert against a mock `ChannelRegistry`).

### `server/websocket/handler.test.ts`

Extends the existing WS handler tests:

- `config.patch`, `config.replace`, `config.unset` each produce a matching `config.ack` with `ok: true` and the merged config.
- Invalid body → `config.ack` with `ok: false` and serialized error.
- `scope` other than `"global"` → `config.ack` with `ok: false` and `UNKNOWN_SCOPE`.
- A successful WS mutation causes a `config:global` publish that reaches a separately-subscribed mock client.

### Integration smoke test

In `daemon.test.ts`: boot the daemon with a tmpdir `atcDir`, PATCH over HTTP, assert the on-disk file contains only the diff, assert a subscribed WS client receives the `config:global` broadcast. One test — unit suites carry the weight.

## Extensibility to future scopes

When project and agent configuration land as a follow-up task:

1. Define `PROJECT_CONFIG_SCHEMA`, `PROJECT_CONFIG_DEFAULTS`, `AGENT_CONFIG_SCHEMA`, `AGENT_CONFIG_DEFAULTS` in `config/schema.ts`.
2. Add `createProjectConfigStore(projectDir, ...)` and `createAgentConfigStore(agentDir, ...)` helpers following the same shape as `createGlobalConfigStore`. Each project and each agent gets its own store instance keyed by id.
3. Add `/api/v1/config/projects/:id` and `/api/v1/config/agents/:id` routes, reusing the same handler shape from `config.ts`.
4. Extend the WS handler's `scope` dispatch: `"project"` and `"agent"` resolve to the right store via id lookup.
5. Channel names follow the pattern `config:project:${id}` and `config:agent:${id}`. Clients subscribe with the glob `"config:*"` to see everything.

No new infrastructure. The generic `LayeredConfigStore<T>` and its test suite carry over as-is.

## Open questions

None. All decisions made during brainstorming are captured above.

## Follow-up work (not in this task)

- Promote profile config to its own `ProfileConfigStore` when multi-profile runtime switching is needed.
- Add a `CFG` rule family to `docs/specification.md` and wire `RULE-CFG-1` into `ConfigValidationError`.
- Stand up `ProjectConfigStore` and `AgentConfigStore` per the Extensibility section.
- Build `@atc/cli` as a thin wrapper around the REST API.
