# Global Configuration System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runtime read/write global configuration system for `@atc/daemon` that persists only fields differing from defaults, exposes the config over REST, WebSocket, and a file watcher, and provides a generic `LayeredConfigStore<T>` primitive so project and agent scopes can reuse the same machinery later.

**Architecture:** A generic `LayeredConfigStore<T>` owns in-memory state (`overrides`, `merged`, `unknownKeys`), atomic writes, file watching, and `change` event emission. `GlobalConfigStore` is a thin wrapper that instantiates it with `GLOBAL_CONFIG_SCHEMA`, `GLOBAL_CONFIG_DEFAULTS`, `<atcDir>/config.json`, and the `"config:global"` channel. All three write paths (REST routes, WS handler, file watcher) funnel through a single private `applyCandidate(candidate, source)` method.

**Tech Stack:** TypeScript (Node16 modules, strict), Zod for validation, Fastify for HTTP, `@fastify/websocket`, Node `fs.watch` for file watching, vitest for tests.

**Design spec:** `docs/superpowers/specs/2026-04-11-global-config-system-design.md`

---

## File Structure

**New files:**
- `packages/errors/src/config.ts` — `ConfigValidationError`, `UnknownConfigKeyError`
- `packages/errors/src/config.test.ts`
- `packages/daemon/src/config/layered-store.ts` — generic `LayeredConfigStore<T>`
- `packages/daemon/src/config/layered-store.test.ts` — write / read / diff tests with synthetic schema
- `packages/daemon/src/config/layered-store.watch.test.ts` — file-watch behavior tests
- `packages/daemon/src/config/global-store.ts` — `createGlobalConfigStore`
- `packages/daemon/src/config/global-store.test.ts`
- `packages/daemon/src/server/routes/config.ts` — REST routes
- `packages/daemon/src/server/routes/config.test.ts`

**Modified files:**
- `packages/daemon/package.json` — add `zod` dependency
- `packages/daemon/src/config/schema.ts` — Zod schemas replace hand-written interfaces + validators
- `packages/daemon/src/config/schema.test.ts` — **new** (was previously untested)
- `packages/daemon/src/types.ts` — remove `GlobalConfig` / `ProfileConfig` / `AdapterConfig` interfaces, re-export from `config/schema.ts`
- `packages/daemon/src/config/loader.ts` — delete `loadGlobalConfig`; update `loadProfileConfig` to use `PROFILE_CONFIG_SCHEMA.parse()`
- `packages/daemon/src/config/loader.test.ts` — update to cover the Zod-based profile loader
- `packages/daemon/src/daemon.ts` — construct/load/start/stop `GlobalConfigStore`; pass `atcDir` through constructor
- `packages/daemon/src/start.ts` — derive `atcDir` from env / argv and pass to `Daemon`
- `packages/daemon/src/daemon.test.ts` — add integration smoke test for global config write → disk + WS broadcast
- `packages/daemon/src/server/app.ts` — accept `globalConfigStore` in `AppOptions`, decorate instance, register `config.ts` routes
- `packages/daemon/src/server/websocket/handler.ts` — dispatch `config.patch` / `config.replace` / `config.unset`
- `packages/daemon/src/server/websocket/handler.test.ts` — cover new dispatch cases
- `packages/daemon/src/types.ts` — extend `WsClientMessage` and `WsServerMessage` with `config.*` variants
- `packages/errors/src/index.ts` — re-export new error classes

---

## Task 1: Add `zod` dependency to `@atc/daemon`

**Files:**
- Modify: `packages/daemon/package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Install zod into the daemon package**

Run:
```bash
pnpm add zod --filter @atc/daemon
```

Expected: `package.json` gains `"zod": "^3.x"` under `dependencies`; lockfile updated.

- [ ] **Step 2: Verify install**

Run:
```bash
pnpm --filter @atc/daemon exec node -e "import('zod').then(z => console.log('zod', z.z ? 'ok' : Object.keys(z).slice(0,3)))"
```

Expected: prints `zod ok` or a list of Zod exports.

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/package.json pnpm-lock.yaml
git commit -m "chore(daemon): add zod dependency for config validation"
```

---

## Task 2: Add `ConfigValidationError` and `UnknownConfigKeyError` to `@atc/errors`

**Files:**
- Create: `packages/errors/src/config.ts`
- Create: `packages/errors/src/config.test.ts`
- Modify: `packages/errors/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/errors/src/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ConfigValidationError, UnknownConfigKeyError } from "./config.js";
import { AtcError } from "./base.js";

describe("ConfigValidationError", () => {
  it("extends AtcError and carries the placeholder rule id", () => {
    const err = new ConfigValidationError("global", [
      { code: "invalid_type", path: ["defaultProfile"], message: "Expected string" },
    ]);
    expect(err).toBeInstanceOf(AtcError);
    expect(err).toBeInstanceOf(ConfigValidationError);
    expect(err.ruleId).toBe("RULE-CFG-1");
    expect(err.scope).toBe("global");
    expect(err.issues).toHaveLength(1);
    expect(err.message).toContain("defaultProfile");
  });

  it("accepts an explicit message override", () => {
    const err = new ConfigValidationError("profile", [], "custom message");
    expect(err.message).toBe("custom message");
    expect(err.scope).toBe("profile");
  });
});

describe("UnknownConfigKeyError", () => {
  it("extends AtcError, carries rule id, and reports scope + key", () => {
    const err = new UnknownConfigKeyError("global", "nope");
    expect(err).toBeInstanceOf(AtcError);
    expect(err).toBeInstanceOf(UnknownConfigKeyError);
    expect(err.ruleId).toBe("RULE-CFG-1");
    expect(err.scope).toBe("global");
    expect(err.key).toBe("nope");
    expect(err.message).toContain("nope");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm run test -- packages/errors/src/config.test.ts
```

Expected: FAIL with `Cannot find module './config.js'` or similar.

- [ ] **Step 3: Implement the error classes**

Create `packages/errors/src/config.ts`:

```ts
import { AtcError } from "./base.js";

/**
 * The scope a configuration error applies to. Matches the tiers in the
 * layered config system: the top-level global config, a profile, a project,
 * or an agent.
 */
export type ConfigScope = "global" | "profile" | "project" | "agent";

/**
 * Minimal shape of a Zod issue used by ConfigValidationError. Declared
 * locally to avoid a runtime dependency on zod from the @atc/errors package.
 */
export interface ConfigIssue {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/**
 * Error thrown when a config payload fails schema validation.
 *
 * Carries the scope the bad payload applies to and the list of Zod issues
 * so transport layers (REST, WebSocket) can serialize them verbatim to
 * clients.
 *
 * @see RULE-CFG-1 (placeholder — rule family not yet in the spec)
 */
export class ConfigValidationError extends AtcError {
  override readonly name: string = "ConfigValidationError";
  readonly scope: ConfigScope;
  readonly issues: readonly ConfigIssue[];

  /**
   * @param scope - Which configuration tier failed validation.
   * @param issues - Zod-compatible issue list describing the failures.
   * @param message - Optional human-readable override; a default is built
   *   from the first issue if omitted.
   */
  constructor(scope: ConfigScope, issues: readonly ConfigIssue[], message?: string) {
    const resolved =
      message ??
      (issues.length > 0
        ? `Invalid ${scope} config: ${issues[0]!.path.join(".")}: ${issues[0]!.message}`
        : `Invalid ${scope} config`);
    super(resolved, "RULE-CFG-1");
    this.scope = scope;
    this.issues = issues;
  }
}

/**
 * Error thrown when a DELETE-by-key or unset() call names a key that is
 * not part of the scope's declared schema.
 *
 * @see RULE-CFG-1 (placeholder — rule family not yet in the spec)
 */
export class UnknownConfigKeyError extends AtcError {
  override readonly name: string = "UnknownConfigKeyError";
  readonly scope: ConfigScope;
  readonly key: string;

  constructor(scope: ConfigScope, key: string) {
    super(`Unknown ${scope} config key: ${key}`, "RULE-CFG-1");
    this.scope = scope;
    this.key = key;
  }
}
```

- [ ] **Step 4: Re-export from the package index**

Edit `packages/errors/src/index.ts` to append:

```ts
export { ConfigValidationError, UnknownConfigKeyError } from "./config.js";
export type { ConfigScope, ConfigIssue } from "./config.js";
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
pnpm run test -- packages/errors/src/config.test.ts
```

Expected: PASS, both `describe` blocks green.

- [ ] **Step 6: Type-check**

Run:
```bash
pnpm run build
```

Expected: `tsc --build` succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/errors/src/config.ts packages/errors/src/config.test.ts packages/errors/src/index.ts
git commit -m "feat(errors): add ConfigValidationError and UnknownConfigKeyError"
```

---

## Task 3: Migrate `schema.ts` to Zod (global + profile)

**Files:**
- Modify: `packages/daemon/src/config/schema.ts`
- Create: `packages/daemon/src/config/schema.test.ts`
- Modify: `packages/daemon/src/types.ts`

- [ ] **Step 1: Write the failing schema test**

Create `packages/daemon/src/config/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  GLOBAL_CONFIG_SCHEMA,
  PROFILE_CONFIG_SCHEMA,
  GLOBAL_CONFIG_DEFAULTS,
  PROFILE_CONFIG_DEFAULTS,
} from "./schema.js";

describe("GLOBAL_CONFIG_SCHEMA", () => {
  it("accepts defaults", () => {
    expect(() => GLOBAL_CONFIG_SCHEMA.parse(GLOBAL_CONFIG_DEFAULTS)).not.toThrow();
  });

  it("rejects a non-string defaultProfile", () => {
    const result = GLOBAL_CONFIG_SCHEMA.safeParse({ defaultProfile: 42 });
    expect(result.success).toBe(false);
  });

  it("preserves unknown top-level fields (passthrough)", () => {
    const parsed = GLOBAL_CONFIG_SCHEMA.parse({
      defaultProfile: "main",
      unknownKey: "kept",
    }) as Record<string, unknown>;
    expect(parsed["unknownKey"]).toBe("kept");
  });
});

describe("PROFILE_CONFIG_SCHEMA", () => {
  it("accepts defaults", () => {
    expect(() => PROFILE_CONFIG_SCHEMA.parse(PROFILE_CONFIG_DEFAULTS)).not.toThrow();
  });

  it("rejects out-of-range port", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      port: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer port", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      port: 1234.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a bad logLevel", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      logLevel: "trace",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean autoRecover", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      autoRecover: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-object adapter", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      adapter: "claude",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string adapter.type", () => {
    const result = PROFILE_CONFIG_SCHEMA.safeParse({
      ...PROFILE_CONFIG_DEFAULTS,
      adapter: { type: 1, config: {} },
    });
    expect(result.success).toBe(false);
  });

  it("preserves unknown top-level fields", () => {
    const parsed = PROFILE_CONFIG_SCHEMA.parse({
      ...PROFILE_CONFIG_DEFAULTS,
      extra: true,
    }) as Record<string, unknown>;
    expect(parsed["extra"]).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm run test -- packages/daemon/src/config/schema.test.ts
```

Expected: FAIL — `GLOBAL_CONFIG_SCHEMA` / `PROFILE_CONFIG_SCHEMA` do not exist yet.

- [ ] **Step 3: Rewrite `schema.ts` to use Zod**

Replace the full contents of `packages/daemon/src/config/schema.ts` with:

```ts
/**
 * Zod schemas and defaults for @atc/daemon configuration tiers.
 *
 * These schemas are the single source of truth for both the runtime
 * shape of `GlobalConfig` / `ProfileConfig` and their validation.
 * Unknown top-level fields are preserved (passthrough) so manual edits
 * and cross-version config files survive round-trips through the
 * layered config store.
 */

import { z } from "zod";

/**
 * Schema for the top-level global daemon configuration persisted at
 * `<atcDir>/config.json`.
 */
export const GLOBAL_CONFIG_SCHEMA = z
  .object({
    defaultProfile: z.string(),
  })
  .passthrough();

/**
 * Schema for an adapter configuration block nested inside a profile.
 */
export const ADAPTER_CONFIG_SCHEMA = z.object({
  type: z.string(),
  config: z.record(z.unknown()),
});

/**
 * Schema for a single profile's runtime configuration persisted at
 * `<profileDir>/config.json`.
 */
export const PROFILE_CONFIG_SCHEMA = z
  .object({
    port: z.number().int().min(1).max(65535),
    host: z.string(),
    logLevel: z.enum(["debug", "info", "warn", "error"]),
    autoRecover: z.boolean(),
    wsHeartbeatInterval: z.number(),
    stateFlushInterval: z.number(),
    adapter: ADAPTER_CONFIG_SCHEMA,
  })
  .passthrough();

/** Inferred TypeScript type for global config. */
export type GlobalConfig = z.infer<typeof GLOBAL_CONFIG_SCHEMA>;

/** Inferred TypeScript type for adapter config. */
export type AdapterConfig = z.infer<typeof ADAPTER_CONFIG_SCHEMA>;

/** Inferred TypeScript type for profile config. */
export type ProfileConfig = z.infer<typeof PROFILE_CONFIG_SCHEMA>;

/**
 * Default global configuration. Returned when `config.json` is absent from
 * `<atcDir>` or any field is omitted.
 */
export const GLOBAL_CONFIG_DEFAULTS: GlobalConfig = {
  defaultProfile: "default",
};

/**
 * Default per-profile configuration. Returned when a profile's `config.json`
 * is absent or any field is omitted.
 */
export const PROFILE_CONFIG_DEFAULTS: ProfileConfig = {
  port: 7700,
  host: "127.0.0.1",
  logLevel: "info",
  autoRecover: false,
  wsHeartbeatInterval: 15,
  stateFlushInterval: 30,
  adapter: {
    type: "claude-agent-sdk",
    config: {},
  },
};
```

Note: the old hand-written `isValidPort`, `isValidLogLevel`, `validatePartialProfileConfig` exports are intentionally removed. Any caller that imported them will break — they will be updated in Task 4.

- [ ] **Step 4: Update `types.ts` to re-export from schema**

Edit `packages/daemon/src/types.ts`:

Remove the `GlobalConfig`, `ProfileConfig`, and `AdapterConfig` interface definitions (lines that define each of the three interfaces in the "Configuration types" section). Replace them with:

```ts
export type { GlobalConfig, ProfileConfig, AdapterConfig } from "./config/schema.js";
```

Leave the leading doc comment for the section intact. Do not touch any other type in this file.

- [ ] **Step 5: Run the schema test to verify it passes**

Run:
```bash
pnpm run test -- packages/daemon/src/config/schema.test.ts
```

Expected: PASS, all cases green.

- [ ] **Step 6: Run the full test suite**

Run:
```bash
pnpm run test
```

Expected: `packages/daemon/src/config/loader.test.ts` and `packages/daemon/src/types.test.ts` may fail because they import the old validator exports. That's fine — Task 4 fixes them. Note the exact failures.

- [ ] **Step 7: Commit (wait until Task 4 is done before committing this task's changes; proceed directly to Task 4)**

_Do not commit yet._ The build and tests are intentionally broken between Task 3 and Task 4. Task 4 restores them and commits both tasks together.

---

## Task 4: Update `loader.ts` and dependent tests to use Zod

**Files:**
- Modify: `packages/daemon/src/config/loader.ts`
- Modify: `packages/daemon/src/config/loader.test.ts`
- Modify: `packages/daemon/src/types.test.ts` (if it imports removed validators)

- [ ] **Step 1: Delete `loadGlobalConfig` and switch `loadProfileConfig` to Zod**

Replace the full contents of `packages/daemon/src/config/loader.ts` with:

```ts
/**
 * Config loader for @atc/daemon profile directories.
 *
 * The global config loader has moved to `LayeredConfigStore` (see
 * `./global-store.ts`). This module now only handles one-shot profile
 * reads used during daemon boot.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigValidationError } from "@atc/errors";
import {
  PROFILE_CONFIG_DEFAULTS,
  PROFILE_CONFIG_SCHEMA,
  type ProfileConfig,
  type GlobalConfig,
} from "./schema.js";
import type { ProjectMetadata } from "../types.js";

/**
 * Reads a JSON file and parses it, returning `null` if absent.
 * Propagates any error that is not ENOENT.
 */
async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const contents = await readFile(filePath, "utf-8");
    return JSON.parse(contents) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Returns the filesystem path for a named profile directory.
 *
 * @param atcDir - Path to the `.atc` directory.
 * @param profileName - Optional profile name; defaults to `"default"`.
 */
export function resolveProfilePath(atcDir: string, profileName?: string): string {
  return join(atcDir, "profiles", profileName ?? "default");
}

/**
 * Loads a profile config from `<profileDir>/config.json`, merges it with
 * defaults, and validates all present fields using the Zod schema.
 *
 * @param profileDir - Path to the profile directory.
 * @throws {ConfigValidationError} if any field has an invalid type or value.
 */
export async function loadProfileConfig(profileDir: string): Promise<ProfileConfig> {
  const raw = await readJsonFile(join(profileDir, "config.json"));
  if (raw === null || typeof raw !== "object") {
    return {
      ...PROFILE_CONFIG_DEFAULTS,
      adapter: { ...PROFILE_CONFIG_DEFAULTS.adapter },
    };
  }

  const candidate = {
    ...PROFILE_CONFIG_DEFAULTS,
    ...(raw as Record<string, unknown>),
    adapter: {
      ...PROFILE_CONFIG_DEFAULTS.adapter,
      ...((raw as Record<string, unknown>)["adapter"] &&
      typeof (raw as Record<string, unknown>)["adapter"] === "object"
        ? ((raw as Record<string, unknown>)["adapter"] as Record<string, unknown>)
        : {}),
    },
  };

  const result = PROFILE_CONFIG_SCHEMA.safeParse(candidate);
  if (!result.success) {
    throw new ConfigValidationError("profile", result.error.issues);
  }
  return result.data;
}

/**
 * Loads project metadata from `<projectDir>/metadata.json`.
 * Throws if the file is missing.
 */
export async function loadProjectMetadata(projectDir: string): Promise<ProjectMetadata> {
  const filePath = join(projectDir, "metadata.json");
  const raw = await readJsonFile(filePath);
  if (raw === null) {
    throw new Error(`Missing required file: metadata.json not found in ${projectDir}`);
  }
  return raw as ProjectMetadata;
}

// Re-exported for callers that previously imported from loader.
export type { ProfileConfig, GlobalConfig };
```

- [ ] **Step 2: Update `loader.test.ts` to match the new contract**

Open `packages/daemon/src/config/loader.test.ts` and:

1. Delete any test that imports or asserts `loadGlobalConfig`, `isValidPort`, `isValidLogLevel`, or `validatePartialProfileConfig`. Those exports no longer exist.
2. Replace any test that previously asserted a thrown `Error` from an invalid profile config so that it now asserts the thrown value `instanceof ConfigValidationError` and has `scope === "profile"`.
3. Leave the "absent file returns defaults" and "partial file merges with defaults" tests in place — they should continue to pass with no change.

Add this test near the top of the file if it's not already present (add the `ConfigValidationError` import at the top of the file: `import { ConfigValidationError } from "@atc/errors";`):

```ts
it("throws ConfigValidationError when profile config has an invalid port", async () => {
  const dir = await createTempProfileDir({ port: 0 }); // existing helper, or write to disk
  await expect(loadProfileConfig(dir)).rejects.toBeInstanceOf(ConfigValidationError);
});
```

If `createTempProfileDir` does not exist, inline it: use `fs.mkdtemp` under `os.tmpdir()`, write `config.json` with the given fields, return the path.

- [ ] **Step 3: Update `types.test.ts` if it references removed exports**

Run:
```bash
pnpm run test -- packages/daemon/src/types.test.ts
```

If it fails because it imported `GlobalConfig` / `ProfileConfig` / `AdapterConfig` directly from `./types`, no change is needed — those are still re-exported. If it fails because it imported the old validator functions, delete those test cases (they are now covered by `schema.test.ts`).

- [ ] **Step 4: Run the full daemon test suite**

Run:
```bash
pnpm run test -- packages/daemon
```

Expected: all daemon tests pass. If `schema.test.ts`, `loader.test.ts`, and `types.test.ts` all pass, proceed.

- [ ] **Step 5: Type-check**

Run:
```bash
pnpm run build
```

Expected: clean build.

- [ ] **Step 6: Commit (Tasks 3 + 4 together)**

```bash
git add packages/daemon/src/config/schema.ts \
        packages/daemon/src/config/schema.test.ts \
        packages/daemon/src/config/loader.ts \
        packages/daemon/src/config/loader.test.ts \
        packages/daemon/src/types.ts \
        packages/daemon/src/types.test.ts
git commit -m "refactor(daemon): migrate config schemas to zod"
```

---

## Task 5: Implement `LayeredConfigStore<T>` — core write / read / diff (no watcher)

**Files:**
- Create: `packages/daemon/src/config/layered-store.ts`
- Create: `packages/daemon/src/config/layered-store.test.ts`

- [ ] **Step 1: Write the failing test suite for core store behavior**

Create `packages/daemon/src/config/layered-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ConfigValidationError, UnknownConfigKeyError } from "@atc/errors";
import { LayeredConfigStore } from "./layered-store.js";

const TEST_SCHEMA = z
  .object({
    name: z.string(),
    count: z.number().int(),
    flag: z.boolean(),
  })
  .passthrough();

type TestConfig = z.infer<typeof TEST_SCHEMA>;

const TEST_DEFAULTS: TestConfig = { name: "alice", count: 0, flag: false };

async function makeStore(initial?: Record<string, unknown>) {
  const dir = await mkdtemp(join(tmpdir(), "atc-layered-"));
  const filePath = join(dir, "config.json");
  if (initial !== undefined) {
    await writeFile(filePath, JSON.stringify(initial, null, 2), "utf8");
  }
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const publish = vi.fn();
  const store = new LayeredConfigStore<TestConfig>({
    schema: TEST_SCHEMA,
    defaults: TEST_DEFAULTS,
    filePath,
    channel: "config:test",
    scope: "global",
    publish,
    logger,
  });
  return { store, dir, filePath, logger, publish };
}

describe("LayeredConfigStore — load()", () => {
  let cleanup: string[] = [];
  afterEach(async () => {
    for (const d of cleanup) await rm(d, { recursive: true, force: true });
    cleanup = [];
  });

  it("returns defaults when the file is absent", async () => {
    const { store, dir } = await makeStore();
    cleanup.push(dir);
    await store.load();
    expect(store.get()).toEqual(TEST_DEFAULTS);
    expect(store.getOverrides()).toEqual({});
  });

  it("merges a partial file with defaults", async () => {
    const { store, dir } = await makeStore({ count: 7 });
    cleanup.push(dir);
    await store.load();
    expect(store.get()).toEqual({ name: "alice", count: 7, flag: false });
    expect(store.getOverrides()).toEqual({ count: 7 });
  });

  it("preserves unknown fields and warns once", async () => {
    const { store, dir, logger } = await makeStore({ count: 1, mystery: "kept" });
    cleanup.push(dir);
    await store.load();
    expect(store.get()).toEqual({ name: "alice", count: 1, flag: false });
    expect(store.getOverrides()).toEqual({ count: 1, mystery: "kept" });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect((logger.warn.mock.calls[0]?.[0] ?? "") as string).toContain("mystery");
  });

  it("throws ConfigValidationError on invalid file contents", async () => {
    const { store, dir } = await makeStore({ count: "not-a-number" });
    cleanup.push(dir);
    await expect(store.load()).rejects.toBeInstanceOf(ConfigValidationError);
  });

  it("emits a change event with source 'init' on load", async () => {
    const { store, dir } = await makeStore({ count: 3 });
    cleanup.push(dir);
    const listener = vi.fn();
    store.on("change", listener);
    await store.load();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[1]).toBe("init");
  });
});

describe("LayeredConfigStore — replace()", () => {
  let cleanup: string[] = [];
  afterEach(async () => {
    for (const d of cleanup) await rm(d, { recursive: true, force: true });
    cleanup = [];
  });

  it("writes an empty overrides file when input matches defaults exactly", async () => {
    const { store, dir, filePath } = await makeStore();
    cleanup.push(dir);
    await store.load();
    await store.replace({ ...TEST_DEFAULTS });
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({});
  });

  it("persists only fields that differ from defaults", async () => {
    const { store, dir, filePath } = await makeStore();
    cleanup.push(dir);
    await store.load();
    await store.replace({ name: "alice", count: 42, flag: true });
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({ count: 42, flag: true });
    expect(store.get()).toEqual({ name: "alice", count: 42, flag: true });
  });

  it("throws ConfigValidationError on invalid input and does not touch disk", async () => {
    const { store, dir, filePath } = await makeStore({ count: 5 });
    cleanup.push(dir);
    await store.load();
    await expect(
      store.replace({ name: "bob", count: 1.5 as unknown as number, flag: false }),
    ).rejects.toBeInstanceOf(ConfigValidationError);
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({ count: 5 });
  });

  it("preserves unknown keys from prior file state through API writes", async () => {
    const { store, dir, filePath } = await makeStore({ mystery: "kept" });
    cleanup.push(dir);
    await store.load();
    await store.replace({ name: "alice", count: 2, flag: false });
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({ count: 2, mystery: "kept" });
  });

  it("emits one change event with source 'api' and publishes on the channel", async () => {
    const { store, dir, publish } = await makeStore();
    cleanup.push(dir);
    await store.load();
    const listener = vi.fn();
    store.on("change", listener);
    await store.replace({ name: "alice", count: 5, flag: false });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[1]).toBe("api");
    expect(publish).toHaveBeenCalledWith(
      "config:test",
      expect.objectContaining({
        config: { name: "alice", count: 5, flag: false },
        source: "api",
      }),
    );
  });
});

describe("LayeredConfigStore — patch()", () => {
  let cleanup: string[] = [];
  afterEach(async () => {
    for (const d of cleanup) await rm(d, { recursive: true, force: true });
    cleanup = [];
  });

  it("merges partial into current state", async () => {
    const { store, dir, filePath } = await makeStore({ count: 5 });
    cleanup.push(dir);
    await store.load();
    await store.patch({ flag: true });
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({ count: 5, flag: true });
    expect(store.get()).toEqual({ name: "alice", count: 5, flag: true });
  });

  it("drops a field from disk when the patch brings it back to default", async () => {
    const { store, dir, filePath } = await makeStore({ count: 9, flag: true });
    cleanup.push(dir);
    await store.load();
    await store.patch({ count: 0 });
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({ flag: true });
    expect(store.get().count).toBe(0);
  });

  it("throws ConfigValidationError on an invalid partial", async () => {
    const { store, dir } = await makeStore();
    cleanup.push(dir);
    await store.load();
    await expect(
      store.patch({ count: "nope" as unknown as number }),
    ).rejects.toBeInstanceOf(ConfigValidationError);
  });
});

describe("LayeredConfigStore — unset()", () => {
  let cleanup: string[] = [];
  afterEach(async () => {
    for (const d of cleanup) await rm(d, { recursive: true, force: true });
    cleanup = [];
  });

  it("reverts an overridden key to default", async () => {
    const { store, dir, filePath } = await makeStore({ count: 99 });
    cleanup.push(dir);
    await store.load();
    await store.unset("count");
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toEqual({});
    expect(store.get().count).toBe(0);
  });

  it("is a no-op but still emits a change event when the key is already at default", async () => {
    const { store, dir } = await makeStore();
    cleanup.push(dir);
    await store.load();
    const listener = vi.fn();
    store.on("change", listener);
    await store.unset("flag");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get().flag).toBe(false);
  });

  it("throws UnknownConfigKeyError for a key not in the schema", async () => {
    const { store, dir } = await makeStore();
    cleanup.push(dir);
    await store.load();
    await expect(store.unset("nope" as keyof TestConfig)).rejects.toBeInstanceOf(
      UnknownConfigKeyError,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm run test -- packages/daemon/src/config/layered-store.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `LayeredConfigStore`**

Create `packages/daemon/src/config/layered-store.ts`:

```ts
/**
 * Generic layered configuration store.
 *
 * Owns in-memory state for a single config scope, persists only the sparse
 * diff against defaults, and funnels all mutations through one internal
 * apply path so REST, WebSocket, and file-watcher writes stay consistent.
 *
 * This class is deliberately free of daemon-specific wiring so project and
 * agent scopes can reuse it by instantiating with a different schema,
 * defaults, file path, and channel.
 */

import { createHash } from "node:crypto";
import { stat, watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import type { z } from "zod";
import { ConfigValidationError, UnknownConfigKeyError, type ConfigScope } from "@atc/errors";
import { atomicWriteJson } from "../state/persistence.js";

/** Source of a config change event. */
export type ChangeSource = "api" | "file" | "init";

/** Minimal logger shape the store depends on. */
export interface ConfigLogger {
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** Options accepted by the LayeredConfigStore constructor. */
export interface LayeredConfigStoreOptions<T extends object> {
  /** Zod schema describing the known shape of the config. */
  readonly schema: z.ZodType<T>;
  /** Canonical defaults; every known field has a value here. */
  readonly defaults: T;
  /** Absolute path to the JSON file backing this store. */
  readonly filePath: string;
  /** Pub/sub channel to broadcast change events on. */
  readonly channel: string;
  /** Scope tag attached to validation errors for this store. */
  readonly scope: ConfigScope;
  /** Function used to publish change events to subscribers. */
  readonly publish: (channel: string, data: unknown) => void;
  /** Logger for warnings (unknown fields, invalid external edits). */
  readonly logger: ConfigLogger;
  /** Debounce window in milliseconds for file-watch events. Defaults to 50ms. */
  readonly watchDebounceMs?: number;
}

/** Change event payload emitted by the store. */
export type ChangeListener<T> = (merged: T, source: ChangeSource) => void;

/** Invalid external edit listener payload. */
export type InvalidExternalEditListener = (error: ConfigValidationError | Error) => void;

/**
 * Generic layered config store. Instantiate one per scope.
 */
export class LayeredConfigStore<T extends object> {
  private readonly _opts: Required<
    Omit<LayeredConfigStoreOptions<T>, "watchDebounceMs">
  > & { readonly watchDebounceMs: number };

  private _overrides: Record<string, unknown> = {};
  private _merged: T;
  private _unknownKeys: Set<string> = new Set();
  private _lastWrite: { mtimeMs: number; contentHash: string } | null = null;
  private _watcher: FSWatcher | null = null;
  private _watchTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingWrite: Promise<void> | null = null;

  private _changeListeners: ChangeListener<T>[] = [];
  private _invalidListeners: InvalidExternalEditListener[] = [];

  constructor(opts: LayeredConfigStoreOptions<T>) {
    this._opts = {
      schema: opts.schema,
      defaults: opts.defaults,
      filePath: opts.filePath,
      channel: opts.channel,
      scope: opts.scope,
      publish: opts.publish,
      logger: opts.logger,
      watchDebounceMs: opts.watchDebounceMs ?? 50,
    };
    this._merged = { ...opts.defaults };
  }

  /** Returns the fully-merged view (defaults + overrides). */
  get(): T {
    return this._merged;
  }

  /** Returns only the sparse on-disk shape. */
  getOverrides(): Record<string, unknown> {
    return { ...this._overrides };
  }

  /** Subscribe to change events or invalid-external-edit events. */
  on(event: "change", listener: ChangeListener<T>): void;
  on(event: "invalid_external_edit", listener: InvalidExternalEditListener): void;
  on(event: "change" | "invalid_external_edit", listener: unknown): void {
    if (event === "change") {
      this._changeListeners.push(listener as ChangeListener<T>);
    } else {
      this._invalidListeners.push(listener as InvalidExternalEditListener);
    }
  }

  /**
   * One-shot read of the backing file. Populates in-memory state and
   * emits a single `change` event with source `"init"`. Does not write.
   */
  async load(): Promise<void> {
    const raw = await this._readFile();
    if (raw === null) {
      this._overrides = {};
      this._merged = { ...this._opts.defaults };
      this._unknownKeys.clear();
      this._emitChange("init");
      return;
    }
    this._ingest(raw, "init");
  }

  /**
   * Full replace. Missing known fields revert to default.
   */
  async replace(next: T): Promise<T> {
    return this._applyCandidate(next, "api");
  }

  /**
   * Partial merge. Omitted fields are left untouched.
   */
  async patch(partial: Partial<T>): Promise<T> {
    const candidate = { ...this._merged, ...partial } as T;
    return this._applyCandidate(candidate, "api");
  }

  /**
   * Revert one known key to its default.
   */
  async unset(key: keyof T & string): Promise<T> {
    if (!this._isKnownKey(key)) {
      throw new UnknownConfigKeyError(this._opts.scope, key);
    }
    const candidate = { ...this._merged, [key]: this._opts.defaults[key] } as T;
    return this._applyCandidate(candidate, "api");
  }

  /** Begin watching the backing file for external edits. */
  start(): void {
    if (this._watcher !== null) return;
    try {
      this._watcher = watch(this._opts.filePath, () => this._scheduleReload());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // Watch the parent dir so we can pick up file creation later.
        // For v1 we log and skip; first write will create the file and a
        // subsequent start() call will attach.
        this._opts.logger.warn(
          `LayeredConfigStore: cannot watch ${this._opts.filePath} yet (file absent)`,
        );
        return;
      }
      throw err;
    }
  }

  /** Stop watching and await any in-flight write. */
  async stop(): Promise<void> {
    if (this._watchTimer !== null) {
      clearTimeout(this._watchTimer);
      this._watchTimer = null;
    }
    if (this._watcher !== null) {
      this._watcher.close();
      this._watcher = null;
    }
    if (this._pendingWrite !== null) {
      await this._pendingWrite;
    }
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private async _applyCandidate(candidate: unknown, source: ChangeSource): Promise<T> {
    const parsed = this._opts.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new ConfigValidationError(this._opts.scope, parsed.error.issues);
    }
    const validated = parsed.data;

    const sparse = this._computeSparse(validated);
    for (const [k, v] of Object.entries(this._overrides)) {
      if (!this._isKnownKey(k) && !(k in sparse)) {
        sparse[k] = v;
      }
    }

    const write = atomicWriteJson(this._opts.filePath, sparse);
    this._pendingWrite = write;
    try {
      await write;
    } finally {
      this._pendingWrite = null;
    }
    this._lastWrite = await this._fingerprint();

    this._overrides = sparse;
    this._merged = validated;
    this._emitChange(source);
    return this._merged;
  }

  private _ingest(raw: Record<string, unknown>, source: ChangeSource): void {
    const parsed = this._opts.schema.safeParse(raw);
    if (!parsed.success) {
      throw new ConfigValidationError(this._opts.scope, parsed.error.issues);
    }
    const validated = parsed.data;

    const sparse: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(validated as Record<string, unknown>)) {
      if (this._isKnownKey(k)) {
        if (!this._valueEquals(v, (this._opts.defaults as Record<string, unknown>)[k])) {
          sparse[k] = v;
        }
      }
    }
    for (const k of Object.keys(raw)) {
      if (!this._isKnownKey(k)) {
        sparse[k] = raw[k];
        if (!this._unknownKeys.has(k)) {
          this._unknownKeys.add(k);
          this._opts.logger.warn(
            `Unknown config field in ${this._opts.filePath}: ${k}`,
          );
        }
      }
    }

    this._overrides = sparse;
    const mergedKnown: Record<string, unknown> = { ...this._opts.defaults };
    for (const k of this._knownKeys()) {
      if (k in sparse) mergedKnown[k] = sparse[k];
    }
    this._merged = mergedKnown as T;
    this._emitChange(source);
  }

  private _computeSparse(validated: T): Record<string, unknown> {
    const sparse: Record<string, unknown> = {};
    for (const k of this._knownKeys()) {
      const v = (validated as Record<string, unknown>)[k];
      if (!this._valueEquals(v, (this._opts.defaults as Record<string, unknown>)[k])) {
        sparse[k] = v;
      }
    }
    return sparse;
  }

  private _valueEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  private _knownKeys(): string[] {
    return Object.keys(this._opts.defaults);
  }

  private _isKnownKey(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this._opts.defaults, key);
  }

  private async _readFile(): Promise<Record<string, unknown> | null> {
    try {
      const raw = await readFile(this._opts.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async _fingerprint(): Promise<{ mtimeMs: number; contentHash: string } | null> {
    try {
      const buf = await readFile(this._opts.filePath);
      const stats = await new Promise<{ mtimeMs: number }>((resolve, reject) => {
        stat(this._opts.filePath, (err, s) => (err ? reject(err) : resolve(s)));
      });
      const contentHash = createHash("sha256").update(buf).digest("hex");
      return { mtimeMs: stats.mtimeMs, contentHash };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private _scheduleReload(): void {
    if (this._watchTimer !== null) {
      clearTimeout(this._watchTimer);
    }
    this._watchTimer = setTimeout(() => {
      this._watchTimer = null;
      void this._handleReload();
    }, this._opts.watchDebounceMs);
  }

  private async _handleReload(): Promise<void> {
    const fp = await this._fingerprint();
    if (fp === null) {
      this._overrides = {};
      this._merged = { ...this._opts.defaults };
      this._unknownKeys.clear();
      this._emitChange("file");
      return;
    }
    if (
      this._lastWrite !== null &&
      fp.contentHash === this._lastWrite.contentHash &&
      fp.mtimeMs === this._lastWrite.mtimeMs
    ) {
      return;
    }
    try {
      const raw = await this._readFile();
      if (raw === null) {
        this._overrides = {};
        this._merged = { ...this._opts.defaults };
        this._emitChange("file");
        return;
      }
      this._ingest(raw, "file");
    } catch (err) {
      this._opts.logger.error(
        `LayeredConfigStore: invalid external edit to ${this._opts.filePath}`,
        err,
      );
      for (const l of this._invalidListeners) {
        l(err as ConfigValidationError | Error);
      }
    }
  }

  private _emitChange(source: ChangeSource): void {
    for (const l of this._changeListeners) l(this._merged, source);
    this._opts.publish(this._opts.channel, { config: this._merged, source });
  }
}
```

- [ ] **Step 4: Run the core tests to verify they pass**

Run:
```bash
pnpm run test -- packages/daemon/src/config/layered-store.test.ts
```

Expected: all tests in the file pass. (The file-watch tests don't exist yet — that's Task 6.)

- [ ] **Step 5: Type-check**

Run:
```bash
pnpm run build
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/config/layered-store.ts \
        packages/daemon/src/config/layered-store.test.ts
git commit -m "feat(daemon): add LayeredConfigStore core with diff-against-defaults persistence"
```

---

## Task 6: File-watch behavior for `LayeredConfigStore`

**Files:**
- Create: `packages/daemon/src/config/layered-store.watch.test.ts`
- Modify: `packages/daemon/src/config/layered-store.ts` (only if bugs surface)

- [ ] **Step 1: Write the failing file-watch test suite**

Create `packages/daemon/src/config/layered-store.watch.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { LayeredConfigStore } from "./layered-store.js";

const SCHEMA = z.object({ name: z.string(), count: z.number().int() }).passthrough();
type Cfg = z.infer<typeof SCHEMA>;
const DEFAULTS: Cfg = { name: "alice", count: 0 };

async function boot(initial?: Record<string, unknown>) {
  const dir = await mkdtemp(join(tmpdir(), "atc-layered-watch-"));
  const filePath = join(dir, "config.json");
  if (initial !== undefined) {
    await writeFile(filePath, JSON.stringify(initial, null, 2), "utf8");
  } else {
    await writeFile(filePath, "{}", "utf8");
  }
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const publish = vi.fn();
  const store = new LayeredConfigStore<Cfg>({
    schema: SCHEMA,
    defaults: DEFAULTS,
    filePath,
    channel: "config:test",
    scope: "global",
    publish,
    logger,
    watchDebounceMs: 20,
  });
  await store.load();
  store.start();
  return { store, dir, filePath, logger, publish };
}

async function waitForChange(store: LayeredConfigStore<Cfg>): Promise<Cfg> {
  return new Promise((resolve) => {
    const listener = (merged: Cfg) => {
      resolve(merged);
    };
    store.on("change", listener);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("LayeredConfigStore — file watching", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    while (dirs.length > 0) {
      const d = dirs.pop()!;
      await rm(d, { recursive: true, force: true });
    }
  });

  it("reloads when the file is edited externally", async () => {
    const { store, dir, filePath } = await boot();
    dirs.push(dir);
    const waiter = waitForChange(store);
    await writeFile(filePath, JSON.stringify({ count: 9 }), "utf8");
    const merged = await waiter;
    await store.stop();
    expect(merged).toEqual({ name: "alice", count: 9 });
  });

  it("does not re-emit for self-written files", async () => {
    const { store, dir, publish } = await boot();
    dirs.push(dir);
    publish.mockClear();
    await store.replace({ name: "alice", count: 5 });
    await sleep(60);
    await store.stop();
    // Exactly one publish — the one from replace(). No echo.
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[1]).toMatchObject({ source: "api" });
  });

  it("debounces rapid external writes into one event", async () => {
    const { store, dir, filePath, publish } = await boot();
    dirs.push(dir);
    publish.mockClear();
    await writeFile(filePath, JSON.stringify({ count: 1 }), "utf8");
    await writeFile(filePath, JSON.stringify({ count: 2 }), "utf8");
    await writeFile(filePath, JSON.stringify({ count: 3 }), "utf8");
    await sleep(80);
    await store.stop();
    const fileEvents = publish.mock.calls.filter(
      (c) => (c[1] as { source: string }).source === "file",
    );
    expect(fileEvents.length).toBeLessThanOrEqual(1);
    expect(store.get().count).toBe(3);
  });

  it("reverts to defaults when the file is deleted", async () => {
    const { store, dir, filePath } = await boot({ count: 7 });
    dirs.push(dir);
    const waiter = waitForChange(store);
    await unlink(filePath);
    const merged = await waiter;
    await store.stop();
    expect(merged).toEqual(DEFAULTS);
  });

  it("emits invalid_external_edit on bad input without mutating state", async () => {
    const { store, dir, filePath } = await boot({ count: 1 });
    dirs.push(dir);
    const invalid = vi.fn();
    store.on("invalid_external_edit", invalid);
    await writeFile(filePath, JSON.stringify({ count: "nope" }), "utf8");
    await sleep(80);
    await store.stop();
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ name: "alice", count: 1 });
  });

  it("warns once and preserves unknown keys added externally", async () => {
    const { store, dir, filePath, logger } = await boot({ count: 1 });
    dirs.push(dir);
    const waiter = waitForChange(store);
    await writeFile(filePath, JSON.stringify({ count: 2, mystery: "kept" }), "utf8");
    await waiter;
    await store.stop();
    expect(logger.warn.mock.calls.some((c) => String(c[0]).includes("mystery"))).toBe(true);
    expect(store.getOverrides()).toMatchObject({ count: 2, mystery: "kept" });
  });
});
```

- [ ] **Step 2: Run the watch tests**

Run:
```bash
pnpm run test -- packages/daemon/src/config/layered-store.watch.test.ts
```

Expected: most pass out of the box from Task 5's implementation. If any fail, fix the implementation in `layered-store.ts` — the common causes are (a) debounce timer accumulating events instead of resetting, (b) `_fingerprint()` racing with the watch event because `fs.watch` fires before the write is flushed (add a small retry or wait one event loop tick), (c) deletion path not clearing `_unknownKeys`.

If a retry is needed for (b), wrap `_fingerprint()` call inside `_handleReload()` with: read the file; if parse fails because of a write-in-flight, wait 10ms and retry once before treating it as invalid.

- [ ] **Step 3: Re-run all config tests**

Run:
```bash
pnpm run test -- packages/daemon/src/config
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/config/layered-store.watch.test.ts packages/daemon/src/config/layered-store.ts
git commit -m "feat(daemon): add file-watch behavior to LayeredConfigStore"
```

---

## Task 7: `createGlobalConfigStore` helper

**Files:**
- Create: `packages/daemon/src/config/global-store.ts`
- Create: `packages/daemon/src/config/global-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/daemon/src/config/global-store.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGlobalConfigStore } from "./global-store.js";
import { GLOBAL_CONFIG_DEFAULTS } from "./schema.js";

describe("createGlobalConfigStore", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    while (dirs.length > 0) {
      const d = dirs.pop()!;
      await rm(d, { recursive: true, force: true });
    }
  });

  it("wires the store to <atcDir>/config.json and channel 'config:global'", async () => {
    const atcDir = await mkdtemp(join(tmpdir(), "atc-global-"));
    dirs.push(atcDir);
    const publish = vi.fn();
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const store = createGlobalConfigStore(atcDir, publish, logger);
    await store.load();
    expect(store.get()).toEqual(GLOBAL_CONFIG_DEFAULTS);

    await store.replace({ ...GLOBAL_CONFIG_DEFAULTS, defaultProfile: "staging" });
    const raw = JSON.parse(
      await readFile(join(atcDir, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(raw).toEqual({ defaultProfile: "staging" });
    expect(publish).toHaveBeenCalledWith(
      "config:global",
      expect.objectContaining({ source: "api" }),
    );
    await store.stop();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm run test -- packages/daemon/src/config/global-store.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helper**

Create `packages/daemon/src/config/global-store.ts`:

```ts
/**
 * Factory for the daemon's global configuration store.
 *
 * Wires a LayeredConfigStore<GlobalConfig> to the canonical global schema,
 * defaults, file path, and channel. The daemon bootstrap constructs one
 * instance and passes it to the HTTP/WS layer.
 */

import { join } from "node:path";
import { LayeredConfigStore, type ConfigLogger } from "./layered-store.js";
import {
  GLOBAL_CONFIG_DEFAULTS,
  GLOBAL_CONFIG_SCHEMA,
  type GlobalConfig,
} from "./schema.js";

/**
 * Creates a global config store rooted at `<atcDir>/config.json`.
 *
 * @param atcDir - Absolute path to the `.atc` directory.
 * @param publish - Channel-publish function (typically `ChannelRegistry.publish` bound).
 * @param logger - Logger for warnings and error reports.
 */
export function createGlobalConfigStore(
  atcDir: string,
  publish: (channel: string, data: unknown) => void,
  logger: ConfigLogger,
): LayeredConfigStore<GlobalConfig> {
  return new LayeredConfigStore<GlobalConfig>({
    schema: GLOBAL_CONFIG_SCHEMA,
    defaults: GLOBAL_CONFIG_DEFAULTS,
    filePath: join(atcDir, "config.json"),
    channel: "config:global",
    scope: "global",
    publish,
    logger,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm run test -- packages/daemon/src/config/global-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/config/global-store.ts packages/daemon/src/config/global-store.test.ts
git commit -m "feat(daemon): add createGlobalConfigStore factory"
```

---

## Task 8: Wire `GlobalConfigStore` into the daemon bootstrap

**Files:**
- Modify: `packages/daemon/src/start.ts`
- Modify: `packages/daemon/src/daemon.ts`
- Modify: `packages/daemon/src/server/app.ts`

- [ ] **Step 1: Update `start.ts` to derive and pass `atcDir`**

Replace the full contents of `packages/daemon/src/start.ts` with:

```ts
/**
 * Entry point for running the ATC daemon from the command line.
 *
 * Usage: node --import tsx packages/daemon/src/start.ts [profileDir]
 *
 * Defaults to ~/.atc/profiles/default. Derives atcDir as two directories up
 * from profileDir (i.e. ~/.atc).
 */

import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import { Daemon } from "./daemon.js";

const profileDir = process.argv[2] ?? join(homedir(), ".atc", "profiles", "default");
const absProfileDir = resolve(profileDir);
const atcDir = dirname(dirname(absProfileDir));

await mkdir(absProfileDir, { recursive: true });
await mkdir(atcDir, { recursive: true });

const daemon = new Daemon(absProfileDir, atcDir);
await daemon.start();

console.log(`ATC daemon listening on port ${daemon.port}`);
```

- [ ] **Step 2: Update `Daemon` to accept and own a `GlobalConfigStore`**

Edit `packages/daemon/src/daemon.ts`. Make these changes:

1. Add imports at the top:
   ```ts
   import { createGlobalConfigStore } from "./config/global-store.js";
   import type { LayeredConfigStore } from "./config/layered-store.js";
   import type { GlobalConfig } from "./config/schema.js";
   import { ChannelRegistry } from "./server/websocket/channels.js";
   ```

2. Change the constructor signature to:
   ```ts
   constructor(profileDir: string, atcDir: string) {
     this._profileDir = profileDir;
     this._atcDir = atcDir;
   }
   ```

3. Add private fields next to `_profileDir`:
   ```ts
   private readonly _atcDir: string;
   private _globalConfigStore: LayeredConfigStore<GlobalConfig> | null = null;
   private _channelRegistry: ChannelRegistry | null = null;
   ```

4. In `start()`, before `createApp` is called, construct the channel registry and global config store and wire them through:
   ```ts
   const channelRegistry = new ChannelRegistry();
   const logger = {
     warn: (msg: string) => console.warn(msg),
     info: (msg: string) => console.info(msg),
     error: (msg: string, err?: unknown) => console.error(msg, err),
   };
   const globalConfigStore = createGlobalConfigStore(
     this._atcDir,
     channelRegistry.publish.bind(channelRegistry),
     logger,
   );
   await globalConfigStore.load();
   globalConfigStore.start();
   ```

5. Pass both to `createApp`:
   ```ts
   const app = createApp({
     profileDir: this._profileDir,
     agentStore,
     craftStore,
     towerStore,
     channelRegistry,
     globalConfigStore,
   });
   ```

6. Assign to the private fields at the end of `start()`:
   ```ts
   this._channelRegistry = channelRegistry;
   this._globalConfigStore = globalConfigStore;
   ```

7. In `stop()`, after closing the app and before removing the PID file, stop the global store:
   ```ts
   if (this._globalConfigStore !== null) {
     await this._globalConfigStore.stop();
   }
   ```

Leave `_channelRegistry` as-is — it's now owned by the daemon but doesn't need a separate lifecycle hook.

- [ ] **Step 3: Update `AppOptions` and `createApp` to accept the global store**

Edit `packages/daemon/src/server/app.ts`:

1. Add import at top:
   ```ts
   import type { LayeredConfigStore } from "../config/layered-store.js";
   import type { GlobalConfig } from "../config/schema.js";
   import { configRoutes } from "./routes/config.js";
   ```

2. Extend `AppOptions`:
   ```ts
   /** Store for global configuration. */
   globalConfigStore?: LayeredConfigStore<GlobalConfig>;
   ```

3. In `createApp`, decorate the instance:
   ```ts
   app.decorate("globalConfigStore", options.globalConfigStore ?? null);
   ```

4. Register `configRoutes` alongside the other route plugins:
   ```ts
   void app.register(configRoutes);
   ```

5. Extend the `FastifyInstance` module augmentation:
   ```ts
   /** Store for global configuration, if wired. */
   globalConfigStore: LayeredConfigStore<GlobalConfig> | null;
   ```

6. In the websocket message handler callback inside `createApp`, pass the global store through:
   ```ts
   handleWsMessage(message, clientId, send, instance.channelRegistry, heartbeat, instance.globalConfigStore);
   ```
   (This will be a compile error until Task 10 updates `handleWsMessage`. That's fine — we'll fix it in Task 10.)

- [ ] **Step 4: Temporary stub for `configRoutes`**

To keep the build green between here and Task 9, create a placeholder `packages/daemon/src/server/routes/config.ts` that exports an empty plugin:

```ts
import type { FastifyInstance } from "fastify";

/**
 * REST routes for configuration management.
 * Populated in Task 9.
 */
export async function configRoutes(_app: FastifyInstance): Promise<void> {
  // Implemented in Task 9.
}
```

- [ ] **Step 5: Temporary stub adjustment for `handleWsMessage` signature**

To avoid a compile error from Step 3.6, update `handleWsMessage` in `packages/daemon/src/server/websocket/handler.ts` to accept an optional extra parameter that it ignores for now:

```ts
import type { LayeredConfigStore } from "../../config/layered-store.js";
import type { GlobalConfig } from "../../config/schema.js";
// ...
export function handleWsMessage(
  message: WsClientMessage,
  clientId: string,
  send: (data: WsServerMessage) => void,
  channels: ChannelRegistry,
  heartbeat: HeartbeatTracker,
  _globalConfigStore: LayeredConfigStore<GlobalConfig> | null = null,
): void {
  // existing body unchanged
}
```

The parameter is wired for real in Task 10.

- [ ] **Step 6: Build and run all tests**

Run:
```bash
pnpm run build && pnpm run test
```

Expected: clean build, all existing tests pass. `daemon.test.ts` may need a small fix — if it constructs `new Daemon(profileDir)` with one arg, pass a second `atcDir` using a temp directory created alongside the existing setup. Find all `new Daemon(` call sites and add the second argument.

If `daemon.test.ts` has its own temp-dir setup, use `dirname(dirname(profileDir))` or create a separate sibling directory.

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/start.ts \
        packages/daemon/src/daemon.ts \
        packages/daemon/src/daemon.test.ts \
        packages/daemon/src/server/app.ts \
        packages/daemon/src/server/routes/config.ts \
        packages/daemon/src/server/websocket/handler.ts
git commit -m "feat(daemon): wire GlobalConfigStore into bootstrap"
```

---

## Task 9: REST routes for `/api/v1/config/global`

**Files:**
- Modify: `packages/daemon/src/server/routes/config.ts`
- Create: `packages/daemon/src/server/routes/config.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `packages/daemon/src/server/routes/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app.js";
import { createGlobalConfigStore } from "../../config/global-store.js";
import { ChannelRegistry } from "../websocket/channels.js";
import { GLOBAL_CONFIG_DEFAULTS } from "../../config/schema.js";

async function bootApp() {
  const atcDir = await mkdtemp(join(tmpdir(), "atc-routes-"));
  const channels = new ChannelRegistry();
  const publishSpy = vi.spyOn(channels, "publish");
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const store = createGlobalConfigStore(atcDir, channels.publish.bind(channels), logger);
  await store.load();
  const app = createApp({
    channelRegistry: channels,
    globalConfigStore: store,
  });
  await app.ready();
  return { app, store, atcDir, publishSpy };
}

describe("GET /api/v1/config/global", () => {
  it("returns merged config and overrides", async () => {
    const { app, atcDir } = await bootApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/config/global" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      config: GLOBAL_CONFIG_DEFAULTS,
      overrides: {},
    });
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });
});

describe("PUT /api/v1/config/global", () => {
  it("replaces config and persists only the diff", async () => {
    const { app, atcDir } = await bootApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/config/global",
      payload: { defaultProfile: "staging" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ config: { defaultProfile: "staging" } });
    const raw = JSON.parse(
      await readFile(join(atcDir, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(raw).toEqual({ defaultProfile: "staging" });
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });

  it("returns 400 INVALID_CONFIG with issues on bad input", async () => {
    const { app, atcDir } = await bootApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/config/global",
      payload: { defaultProfile: 42 },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; issues: unknown[] } };
    expect(body.error.code).toBe("INVALID_CONFIG");
    expect(Array.isArray(body.error.issues)).toBe(true);
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });
});

describe("PATCH /api/v1/config/global", () => {
  it("merges partial input", async () => {
    const { app, atcDir } = await bootApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/config/global",
      payload: { defaultProfile: "dev" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ config: { defaultProfile: "dev" } });
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });
});

describe("DELETE /api/v1/config/global/:key", () => {
  it("reverts a known key to default", async () => {
    const { app, atcDir } = await bootApp();
    await app.inject({
      method: "PATCH",
      url: "/api/v1/config/global",
      payload: { defaultProfile: "dev" },
    });
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/config/global/defaultProfile",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ config: GLOBAL_CONFIG_DEFAULTS });
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });

  it("returns 404 UNKNOWN_CONFIG_KEY for a key not in the schema", async () => {
    const { app, atcDir } = await bootApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/config/global/bogus",
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("UNKNOWN_CONFIG_KEY");
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });
});

describe("publishes on config:global channel", () => {
  it("publishes after a successful PATCH", async () => {
    const { app, atcDir, publishSpy } = await bootApp();
    publishSpy.mockClear();
    await app.inject({
      method: "PATCH",
      url: "/api/v1/config/global",
      payload: { defaultProfile: "dev" },
    });
    const call = publishSpy.mock.calls.find((c) => c[0] === "config:global");
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ source: "api" });
    await app.close();
    await rm(atcDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm run test -- packages/daemon/src/server/routes/config.test.ts
```

Expected: FAIL — routes don't exist yet (or they 404 because the stub plugin is empty).

- [ ] **Step 3: Implement the routes**

Replace the contents of `packages/daemon/src/server/routes/config.ts` with:

```ts
/**
 * REST routes for global configuration management.
 *
 * All mutations funnel through the daemon's GlobalConfigStore, which
 * atomically persists the sparse diff against defaults and broadcasts
 * change events on the `config:global` channel.
 */

import type { FastifyInstance } from "fastify";
import { ConfigValidationError, UnknownConfigKeyError } from "@atc/errors";

/**
 * Registers `/api/v1/config/global` routes on the Fastify instance.
 *
 * If no global config store is wired to the app, the routes return 503.
 */
export async function configRoutes(app: FastifyInstance): Promise<void> {
  const requireStore = () => {
    if (app.globalConfigStore === null) {
      const err = new Error("Global config store not available");
      (err as Error & { statusCode?: number }).statusCode = 503;
      throw err;
    }
    return app.globalConfigStore;
  };

  const mapError = (err: unknown): { statusCode: number; body: unknown } => {
    if (err instanceof ConfigValidationError) {
      return {
        statusCode: 400,
        body: {
          error: {
            code: "INVALID_CONFIG",
            message: err.message,
            issues: err.issues,
          },
        },
      };
    }
    if (err instanceof UnknownConfigKeyError) {
      return {
        statusCode: 404,
        body: {
          error: {
            code: "UNKNOWN_CONFIG_KEY",
            message: err.message,
          },
        },
      };
    }
    return {
      statusCode: 500,
      body: { error: { code: "INTERNAL", message: (err as Error).message } },
    };
  };

  app.get("/api/v1/config/global", async (_request, _reply) => {
    const store = requireStore();
    return { config: store.get(), overrides: store.getOverrides() };
  });

  app.put("/api/v1/config/global", async (request, reply) => {
    const store = requireStore();
    try {
      const merged = await store.replace(request.body as Parameters<typeof store.replace>[0]);
      return { config: merged };
    } catch (err) {
      const { statusCode, body } = mapError(err);
      return reply.code(statusCode).send(body);
    }
  });

  app.patch("/api/v1/config/global", async (request, reply) => {
    const store = requireStore();
    try {
      const merged = await store.patch(request.body as Parameters<typeof store.patch>[0]);
      return { config: merged };
    } catch (err) {
      const { statusCode, body } = mapError(err);
      return reply.code(statusCode).send(body);
    }
  });

  app.delete<{ Params: { key: string } }>(
    "/api/v1/config/global/:key",
    async (request, reply) => {
      const store = requireStore();
      try {
        const merged = await store.unset(
          request.params.key as Parameters<typeof store.unset>[0],
        );
        return { config: merged };
      } catch (err) {
        const { statusCode, body } = mapError(err);
        return reply.code(statusCode).send(body);
      }
    },
  );
}
```

- [ ] **Step 4: Run the route test to verify it passes**

Run:
```bash
pnpm run test -- packages/daemon/src/server/routes/config.test.ts
```

Expected: all cases green.

- [ ] **Step 5: Run the full daemon test suite**

Run:
```bash
pnpm run test -- packages/daemon
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/server/routes/config.ts packages/daemon/src/server/routes/config.test.ts
git commit -m "feat(daemon): add REST routes for global config read/write"
```

---

## Task 10: WebSocket mutation dispatch

**Files:**
- Modify: `packages/daemon/src/types.ts`
- Modify: `packages/daemon/src/server/websocket/handler.ts`
- Modify: `packages/daemon/src/server/websocket/handler.test.ts`

- [ ] **Step 1: Extend `WsClientMessage` and `WsServerMessage`**

In `packages/daemon/src/types.ts`, find the `WsClientMessage` union and replace it with:

```ts
export type WsClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string }
  | { type: "ping" }
  | { type: "pong" }
  | { type: "config.patch"; scope: "global"; body: Record<string, unknown>; requestId: string }
  | { type: "config.replace"; scope: "global"; body: Record<string, unknown>; requestId: string }
  | { type: "config.unset"; scope: "global"; key: string; requestId: string };
```

And replace `WsServerMessage` with:

```ts
export type WsServerMessage =
  | { type: "connected"; sessionId: string }
  | WsEvent
  | { type: "ping" }
  | { type: "pong"; timestamp: string }
  | {
      type: "config.ack";
      requestId: string;
      ok: true;
      config: Record<string, unknown>;
    }
  | {
      type: "config.ack";
      requestId: string;
      ok: false;
      error: { code: string; message: string; issues?: unknown[] };
    };
```

- [ ] **Step 2: Write the failing handler test**

Extend `packages/daemon/src/server/websocket/handler.test.ts` by adding at the bottom (keep all existing tests):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGlobalConfigStore } from "../../config/global-store.js";
import { ChannelRegistry } from "./channels.js";
import { HeartbeatTracker } from "./heartbeat.js";
import { handleWsMessage } from "./handler.js";

async function bootStore() {
  const atcDir = await mkdtemp(join(tmpdir(), "atc-ws-cfg-"));
  const channels = new ChannelRegistry();
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const store = createGlobalConfigStore(atcDir, channels.publish.bind(channels), logger);
  await store.load();
  return { atcDir, channels, store };
}

describe("handleWsMessage — config.* dispatch", () => {
  it("config.patch returns config.ack ok:true with merged config", async () => {
    const { atcDir, channels, store } = await bootStore();
    const sent: unknown[] = [];
    const send = (m: unknown) => sent.push(m);
    const heartbeat = new HeartbeatTracker(3);
    await handleWsMessage(
      {
        type: "config.patch",
        scope: "global",
        body: { defaultProfile: "staging" },
        requestId: "r1",
      },
      "c1",
      send as Parameters<typeof handleWsMessage>[2],
      channels,
      heartbeat,
      store,
    );
    expect(sent).toEqual([
      {
        type: "config.ack",
        requestId: "r1",
        ok: true,
        config: { defaultProfile: "staging" },
      },
    ]);
    await store.stop();
    await rm(atcDir, { recursive: true, force: true });
  });

  it("config.replace with invalid body returns config.ack ok:false", async () => {
    const { atcDir, channels, store } = await bootStore();
    const sent: unknown[] = [];
    const send = (m: unknown) => sent.push(m);
    const heartbeat = new HeartbeatTracker(3);
    await handleWsMessage(
      {
        type: "config.replace",
        scope: "global",
        body: { defaultProfile: 42 as unknown as string },
        requestId: "r2",
      },
      "c1",
      send as Parameters<typeof handleWsMessage>[2],
      channels,
      heartbeat,
      store,
    );
    expect(sent).toHaveLength(1);
    const ack = sent[0] as {
      type: string;
      ok: boolean;
      error: { code: string };
    };
    expect(ack.type).toBe("config.ack");
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe("INVALID_CONFIG");
    await store.stop();
    await rm(atcDir, { recursive: true, force: true });
  });

  it("config.unset on unknown key returns ok:false UNKNOWN_CONFIG_KEY", async () => {
    const { atcDir, channels, store } = await bootStore();
    const sent: unknown[] = [];
    const send = (m: unknown) => sent.push(m);
    const heartbeat = new HeartbeatTracker(3);
    await handleWsMessage(
      { type: "config.unset", scope: "global", key: "bogus", requestId: "r3" },
      "c1",
      send as Parameters<typeof handleWsMessage>[2],
      channels,
      heartbeat,
      store,
    );
    const ack = sent[0] as { ok: boolean; error: { code: string } };
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe("UNKNOWN_CONFIG_KEY");
    await store.stop();
    await rm(atcDir, { recursive: true, force: true });
  });

  it("publishes on config:global after a successful WS mutation", async () => {
    const { atcDir, channels, store } = await bootStore();
    const received: unknown[] = [];
    channels.subscribe("observer", "config:global", (data) => received.push(data));
    const heartbeat = new HeartbeatTracker(3);
    await handleWsMessage(
      {
        type: "config.patch",
        scope: "global",
        body: { defaultProfile: "dev" },
        requestId: "r4",
      },
      "c1",
      ((_m: unknown) => undefined) as Parameters<typeof handleWsMessage>[2],
      channels,
      heartbeat,
      store,
    );
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      config: { defaultProfile: "dev" },
      source: "api",
    });
    await store.stop();
    await rm(atcDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
pnpm run test -- packages/daemon/src/server/websocket/handler.test.ts
```

Expected: FAIL — `handleWsMessage` doesn't dispatch config messages and is not `async`.

- [ ] **Step 4: Implement the dispatch**

Replace the body of `handleWsMessage` in `packages/daemon/src/server/websocket/handler.ts` with:

```ts
/**
 * WebSocket message handler — routes incoming client messages to the
 * appropriate subsystem: channel registry, heartbeat tracker, or
 * global config store.
 */

import { ConfigValidationError, UnknownConfigKeyError } from "@atc/errors";
import type { WsClientMessage, WsServerMessage } from "../../types.js";
import type { ChannelRegistry } from "./channels.js";
import type { HeartbeatTracker } from "./heartbeat.js";
import type { LayeredConfigStore } from "../../config/layered-store.js";
import type { GlobalConfig } from "../../config/schema.js";

/**
 * Process a single incoming WebSocket message from a client.
 *
 * Dispatches on the message type. Config mutations are awaited; subscribe /
 * unsubscribe / ping / pong are synchronous.
 */
export async function handleWsMessage(
  message: WsClientMessage,
  clientId: string,
  send: (data: WsServerMessage) => void,
  channels: ChannelRegistry,
  heartbeat: HeartbeatTracker,
  globalConfigStore: LayeredConfigStore<GlobalConfig> | null = null,
): Promise<void> {
  switch (message.type) {
    case "subscribe":
      channels.subscribe(clientId, message.channel, send as (data: unknown) => void);
      return;
    case "unsubscribe":
      channels.unsubscribe(clientId, message.channel);
      return;
    case "pong":
      heartbeat.receivePong(clientId);
      return;
    case "ping":
      send({ type: "pong", timestamp: new Date().toISOString() });
      return;
    case "config.patch":
    case "config.replace":
    case "config.unset":
      await dispatchConfig(message, send, globalConfigStore);
      return;
  }
}

async function dispatchConfig(
  message: Extract<
    WsClientMessage,
    { type: "config.patch" | "config.replace" | "config.unset" }
  >,
  send: (data: WsServerMessage) => void,
  globalConfigStore: LayeredConfigStore<GlobalConfig> | null,
): Promise<void> {
  const { requestId } = message;

  if (message.scope !== "global") {
    send({
      type: "config.ack",
      requestId,
      ok: false,
      error: { code: "UNKNOWN_SCOPE", message: `Unknown config scope: ${message.scope}` },
    });
    return;
  }

  if (globalConfigStore === null) {
    send({
      type: "config.ack",
      requestId,
      ok: false,
      error: { code: "UNAVAILABLE", message: "Global config store not available" },
    });
    return;
  }

  try {
    let merged: GlobalConfig;
    if (message.type === "config.patch") {
      merged = await globalConfigStore.patch(message.body as Partial<GlobalConfig>);
    } else if (message.type === "config.replace") {
      merged = await globalConfigStore.replace(message.body as GlobalConfig);
    } else {
      merged = await globalConfigStore.unset(
        message.key as keyof GlobalConfig & string,
      );
    }
    send({
      type: "config.ack",
      requestId,
      ok: true,
      config: merged as unknown as Record<string, unknown>,
    });
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      send({
        type: "config.ack",
        requestId,
        ok: false,
        error: {
          code: "INVALID_CONFIG",
          message: err.message,
          issues: err.issues as unknown[],
        },
      });
      return;
    }
    if (err instanceof UnknownConfigKeyError) {
      send({
        type: "config.ack",
        requestId,
        ok: false,
        error: { code: "UNKNOWN_CONFIG_KEY", message: err.message },
      });
      return;
    }
    send({
      type: "config.ack",
      requestId,
      ok: false,
      error: { code: "INTERNAL", message: (err as Error).message },
    });
  }
}
```

- [ ] **Step 5: Update the `handleWsMessage` caller in `app.ts`**

In `packages/daemon/src/server/app.ts`, the socket message handler needs to be `async` now because `handleWsMessage` returns a promise. Change:

```ts
socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
  try {
    const message = JSON.parse(raw.toString()) as WsClientMessage;
    handleWsMessage(message, clientId, send, instance.channelRegistry, heartbeat);
  } catch {
    // ignore malformed messages
  }
});
```

to:

```ts
socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
  try {
    const message = JSON.parse(raw.toString()) as WsClientMessage;
    void handleWsMessage(
      message,
      clientId,
      send,
      instance.channelRegistry,
      heartbeat,
      instance.globalConfigStore,
    );
  } catch {
    // ignore malformed messages
  }
});
```

- [ ] **Step 6: Run the handler tests**

Run:
```bash
pnpm run test -- packages/daemon/src/server/websocket/handler.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Run the full daemon suite**

Run:
```bash
pnpm run test -- packages/daemon
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add packages/daemon/src/types.ts \
        packages/daemon/src/server/websocket/handler.ts \
        packages/daemon/src/server/websocket/handler.test.ts \
        packages/daemon/src/server/app.ts
git commit -m "feat(daemon): add WebSocket config.patch/replace/unset dispatch"
```

---

## Task 11: Integration smoke test in `daemon.test.ts`

**Files:**
- Modify: `packages/daemon/src/daemon.test.ts`

- [ ] **Step 1: Add the integration test**

At the bottom of `packages/daemon/src/daemon.test.ts`, add:

```ts
import { readFile } from "node:fs/promises";
import WebSocket from "ws"; // available transitively through @fastify/websocket

describe("Daemon — global config integration", () => {
  it("PATCH over HTTP persists diff and broadcasts over WS", async () => {
    // Uses the existing test helpers in this file for creating atcDir / profileDir
    // and starting a Daemon. If no such helper exists, inline:
    const atcDir = await mkdtemp(join(tmpdir(), "atc-int-"));
    const profileDir = join(atcDir, "profiles", "default");
    await mkdir(profileDir, { recursive: true });

    const daemon = new Daemon(profileDir, atcDir);
    await daemon.start();
    const baseUrl = `http://127.0.0.1:${daemon.port}`;

    // Connect a WS client and subscribe to config:global before mutating.
    const ws = new WebSocket(`ws://127.0.0.1:${daemon.port}/ws`);
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));
    const received: unknown[] = [];
    ws.on("message", (raw: Buffer) => {
      received.push(JSON.parse(raw.toString()));
    });
    ws.send(JSON.stringify({ type: "subscribe", channel: "config:global" }));
    await new Promise((r) => setTimeout(r, 20));

    // PATCH over HTTP.
    const res = await fetch(`${baseUrl}/api/v1/config/global`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultProfile: "staging" }),
    });
    expect(res.status).toBe(200);

    // On-disk file contains only the diff.
    const raw = JSON.parse(
      await readFile(join(atcDir, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(raw).toEqual({ defaultProfile: "staging" });

    // WS client received a broadcast.
    await new Promise((r) => setTimeout(r, 40));
    const broadcast = received.find(
      (m) =>
        (m as { channel?: string }).channel === "config:global" ||
        (m as { type?: string; config?: unknown }).config !== undefined,
    );
    expect(broadcast).toBeDefined();

    ws.close();
    await daemon.stop();
    await rm(atcDir, { recursive: true, force: true });
  }, 10_000);
});
```

Note: this test uses `fetch` (Node ≥18 has it globally) and the `ws` package. If `ws` isn't a direct daemon devDependency, it is still available transitively through `@fastify/websocket`, and a `ws` import should resolve in the monorepo. If not, fall back to using `fastify.inject()` against the running server instance instead — but prefer the real socket round-trip for this smoke test.

If the channel publish isn't picked up because the WS client subscribes after the `connected` frame but before the server registers the subscription, increase the `setTimeout` from 20 to 50ms.

- [ ] **Step 2: Run the integration test**

Run:
```bash
pnpm run test -- packages/daemon/src/daemon.test.ts
```

Expected: new `Daemon — global config integration` block passes.

- [ ] **Step 3: Run the full test suite**

Run:
```bash
pnpm run test
```

Expected: entire repo green.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/daemon.test.ts
git commit -m "test(daemon): add global config HTTP+WS integration smoke test"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run lint, build, and tests**

Run:
```bash
pnpm run lint && pnpm run build && pnpm run test
```

Expected: all three clean.

- [ ] **Step 2: Coverage check on touched files**

Run:
```bash
pnpm run test -- --coverage
```

Expected: `packages/daemon/src/config/layered-store.ts`, `packages/daemon/src/config/global-store.ts`, `packages/daemon/src/config/schema.ts`, `packages/daemon/src/server/routes/config.ts`, `packages/daemon/src/server/websocket/handler.ts`, and `packages/errors/src/config.ts` all ≥ 90% lines + branches per `docs/contributing.md`.

If any file falls short, add tests targeting the uncovered branches before proceeding. Common gaps: the `UNKNOWN_SCOPE` branch in `dispatchConfig`, the `requireStore` 503 branch in `config.ts`, and the `_fingerprint` ENOENT branch in `layered-store.ts`.

- [ ] **Step 3: Format**

Run:
```bash
pnpm run format
```

Expected: formatting applied; commit any changes.

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: format after global config work"
```

- [ ] **Step 4: Final spec-vs-code sanity check**

Open `docs/superpowers/specs/2026-04-11-global-config-system-design.md` side by side with the code. Walk the Goals section, the method surface, the REST table, and the WS message list — confirm each is implemented. If anything is missing, add a follow-up task before handing off.

---

## Self-Review

**Spec coverage check:**

- Goal 1 (three write paths): REST routes (Task 9), WS handler (Task 10), file watcher (Task 6). ✓
- Goal 2 (sparse persistence): `_computeSparse` + `_applyCandidate` (Task 5). Tested by replace/patch tests. ✓
- Goal 3 (merged view on read): `_merged` / `get()` (Task 5). ✓
- Goal 4 (live external edits): file watch (Task 6). ✓
- Goal 5 (WS broadcast): `_emitChange` publishes on channel (Task 5), exercised by route + handler tests. ✓
- Goal 6 (Zod for both global and profile): Tasks 3 + 4. ✓
- Goal 7 (unknown field preservation + one warning): `_ingest` (Task 5) + watch tests (Task 6). ✓
- Goal 8 (generic primitive): `LayeredConfigStore<T>` is scope-agnostic; `createGlobalConfigStore` is the only scope-specific file. Future project/agent stores reuse the same class. ✓

**Placeholder scan:** No "TBD"/"TODO" in task bodies. One deliberate placeholder: `RULE-CFG-1` in `ConfigValidationError` / `UnknownConfigKeyError`, flagged in the spec as an intentional follow-up before a rule family is added to `docs/specification.md`.

**Type consistency:**
- `LayeredConfigStore` method names (`get`, `getOverrides`, `replace`, `patch`, `unset`, `load`, `start`, `stop`, `on`) consistent between Task 5 implementation, Task 7 factory test, Task 9 route tests, Task 10 handler tests, Task 11 integration test.
- `ChangeSource` values `"api" | "file" | "init"` consistent across load/apply/watch paths.
- Channel name `"config:global"` consistent across store factory, routes, handler, and integration test.
- Error codes `INVALID_CONFIG` / `UNKNOWN_CONFIG_KEY` / `UNKNOWN_SCOPE` / `INTERNAL` / `UNAVAILABLE` consistent across REST and WS mappings.
- `ConfigScope` enum values `"global" | "profile" | "project" | "agent"` used by `ConfigValidationError`, `UnknownConfigKeyError`, and `LayeredConfigStoreOptions.scope`.

No gaps found.
