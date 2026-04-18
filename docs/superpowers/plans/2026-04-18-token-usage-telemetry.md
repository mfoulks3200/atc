# Token Usage Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture, enrich, persist, and query per-turn token usage records tagged with `(projectName, callsign, pilotId, sessionId, vectorId)` so the web dashboard can drill into cost and performance across pilots, crafts, sessions, vectors, and projects.

**Architecture:** A new pure `@airtrafficcontrol/usage` package owns the types and rollup/filter functions. The Claude adapter emits dimensional tags it already knows; `AgentManager` enriches each record with the live `vectorId` at persistence time and fans out to `CraftStore.appendUsageReport` and a WebSocket broadcast on `usage:<project>`. A single unified REST endpoint serves records and rollups.

**Tech Stack:** TypeScript (ES2022, Node16), pnpm workspaces, Fastify, Vitest, `@anthropic-ai/claude-agent-sdk`.

**Spec:** `docs/superpowers/specs/2026-04-18-token-usage-telemetry-design.md`

**Important context:**
- The daemon currently does **not** wire `adapter.onUsageReport` to anything. `CraftStore.appendUsageReport` exists and is unit-tested but is never called by the live pipeline. This plan fixes that latent gap as a side-effect of implementing telemetry.
- `Vector` has no `id` field — only `name`. The spec's `vectorId` field is populated with `Vector.name` (see Task 7).
- The adapter already knows `projectName`, `pilotId`, `callsign`, and `agentId` at launch time; these are just absent from the emitted `AgentUsageReport`.
- `packages/web/src/types/api.ts` currently duplicates the usage types. Task 11 deletes the duplicates and re-exports from `@airtrafficcontrol/usage`.

---

## File Structure

### Created

- `packages/usage/package.json` — new workspace package manifest
- `packages/usage/tsconfig.json` — composite tsconfig
- `packages/usage/src/index.ts` — barrel exports
- `packages/usage/src/types.ts` — `TokenUsage`, `ToolUsageEntry`, `SkillUsageEntry`, `AgentUsageReport`
- `packages/usage/src/rollup.ts` — pure `rollup(records, groupBy)` function
- `packages/usage/src/rollup.test.ts`
- `packages/usage/src/filter.ts` — pure `filter(records, query)` function
- `packages/usage/src/filter.test.ts`
- `packages/daemon/src/state/usage-reader.ts` — fan-out reader across craft directories
- `packages/daemon/src/state/usage-reader.test.ts`
- `packages/daemon/src/server/routes/usage.ts` — unified query endpoint
- `packages/daemon/src/server/routes/usage.test.ts`

### Modified

- `tsconfig.json` — add `packages/usage` reference
- `packages/daemon/package.json` — add `@airtrafficcontrol/usage` dep
- `packages/daemon/tsconfig.json` — add `packages/usage` reference
- `packages/daemon/src/types.ts` — re-export usage types from `@airtrafficcontrol/usage`; extend `AgentUsageReport` shape via the new package
- `packages/daemon/src/adapters/adapter.ts` — imports the report from `@airtrafficcontrol/usage`
- `packages/daemon/src/process/agent-manager.ts` — add `usageSink` dep, wire `adapter.onUsageReport`, enrich with `vectorId`
- `packages/daemon/src/process/agent-manager.test.ts` — add tests for sink wiring and vector enrichment
- `packages/daemon/src/daemon.ts` — install a default `usageSink` that appends to `CraftStore` + publishes on `usage:<project>`
- `packages/daemon/src/server/routes/agents.ts` — keep `GET /agents/:id/usage` but delegate to the new reader
- `packages/daemon/src/server/routes/index.ts` (or wherever routes are registered) — register `usageRoutes`
- `packages/daemon/src/index.ts` — export new public types
- `packages/adapter-claude-agent-sdk/package.json` — add `@airtrafficcontrol/usage` dep
- `packages/adapter-claude-agent-sdk/tsconfig.json` — add package reference
- `packages/adapter-claude-agent-sdk/src/adapter.ts` — emit `projectName`, `pilotId`, `sessionId` on reports
- `packages/adapter-claude-agent-sdk/src/adapter.test.ts` — assert new fields
- `packages/web/package.json` — add `@airtrafficcontrol/usage` dep
- `packages/web/tsconfig.json` — add package reference
- `packages/web/src/types/api.ts` — replace duplicated types with re-exports
- `docs/specification.md` — add `RULE-USAGE-1..4` and Appendix A entries
- `packages/daemon/CHANGELOG.md` — record sink wiring + routes
- `packages/adapter-claude-agent-sdk/CHANGELOG.md` — record dimensional tagging
- `packages/web/CHANGELOG.md` — record type re-export

---

## Task 1: Scaffold `@airtrafficcontrol/usage` package

**Files:**
- Create: `packages/usage/package.json`
- Create: `packages/usage/tsconfig.json`
- Create: `packages/usage/src/index.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Write `packages/usage/package.json`**

```json
{
  "name": "@airtrafficcontrol/usage",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc --build"
  },
  "dependencies": {
    "@airtrafficcontrol/types": "workspace:*"
  }
}
```

- [ ] **Step 2: Write `packages/usage/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [{ "path": "../types" }]
}
```

- [ ] **Step 3: Write placeholder `packages/usage/src/index.ts`**

```ts
export {};
```

(Real exports added in later tasks. The empty export keeps the module ESM-compatible.)

- [ ] **Step 4: Add package reference to root `tsconfig.json`**

Insert `{ "path": "packages/usage" }` in the root `tsconfig.json` `references` array, placed alphabetically near `packages/types`:

```json
"references": [
  { "path": "packages/types" },
  { "path": "packages/errors" },
  { "path": "packages/core" },
  { "path": "packages/validation" },
  { "path": "packages/checklist" },
  { "path": "packages/tower" },
  { "path": "packages/usage" },
  { "path": "packages/daemon" },
  { "path": "packages/adapter-claude-agent-sdk" },
  { "path": "packages/web" }
]
```

- [ ] **Step 5: Install and build**

Run: `pnpm install && pnpm run build`
Expected: clean build; `packages/usage/dist/index.js` exists.

- [ ] **Step 6: Commit**

```bash
git add packages/usage tsconfig.json pnpm-lock.yaml
git commit -m "feat(usage): scaffold @airtrafficcontrol/usage package"
```

---

## Task 2: Define usage types

**Files:**
- Create: `packages/usage/src/types.ts`
- Modify: `packages/usage/src/index.ts`

- [ ] **Step 1: Write `packages/usage/src/types.ts`**

```ts
/**
 * Token consumption breakdown for a single agent turn or rollup window.
 *
 * @see RULE-USAGE-1
 */
export interface TokenUsage {
  /** Number of input tokens consumed. */
  input: number;
  /** Number of output tokens produced. */
  output: number;
  /** Number of tokens read from the prompt cache, if applicable. */
  cacheRead?: number;
  /** Number of tokens written to the prompt cache, if applicable. */
  cacheWrite?: number;
}

/**
 * Usage statistics for a single tool across an agent turn or rollup window.
 */
export interface ToolUsageEntry {
  /** Tool name. */
  name: string;
  /** Total number of calls made. */
  calls: number;
  /** Number of calls that resulted in an error or failure. */
  failures: number;
}

/**
 * Usage statistics for a single skill across an agent turn or rollup window.
 */
export interface SkillUsageEntry {
  /** Skill name. */
  name: string;
  /** Total number of times the skill was invoked. */
  invocations: number;
}

/**
 * A single usage record representing one end-of-turn measurement from an
 * agent. Carries full dimensional tagging so aggregation is pure
 * filter-and-sum with no joins.
 *
 * @see RULE-USAGE-1
 * @see RULE-USAGE-2
 */
export interface AgentUsageReport {
  /** Project the craft belongs to. @see RULE-USAGE-1 */
  projectName: string;
  /** Aviation callsign for the craft. */
  callsign: string;
  /** Pilot that produced this turn. */
  pilotId: string;
  /** Agent session id — identical in value to `agentId`, kept as its own
   *  field so callers can use the semantic that fits (a pause/resume stays
   *  within one session). */
  sessionId: string;
  /** Vector active when the report was persisted, or `null` if none. Resolved
   *  from live craft state at persistence time. @see RULE-USAGE-2 */
  vectorId: string | null;
  /** Unique agent identifier. */
  agentId: string;
  /** ISO-8601 timestamp of when this report was generated. */
  timestamp: string;
  /** Token consumption breakdown. */
  tokens: TokenUsage;
  /** Per-tool usage statistics. Empty until per-tool capture is implemented. */
  tools: ToolUsageEntry[];
  /** Per-skill usage statistics. Empty until per-skill capture is implemented. */
  skills: SkillUsageEntry[];
  /** Total active duration in milliseconds. */
  duration: number;
}
```

- [ ] **Step 2: Update `packages/usage/src/index.ts`**

```ts
export type {
  AgentUsageReport,
  SkillUsageEntry,
  TokenUsage,
  ToolUsageEntry,
} from "./types.js";
```

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add packages/usage/src
git commit -m "feat(usage): add dimensional AgentUsageReport types"
```

---

## Task 3: Implement and test `rollup`

**Files:**
- Create: `packages/usage/src/rollup.ts`
- Create: `packages/usage/src/rollup.test.ts`
- Modify: `packages/usage/src/index.ts`

- [ ] **Step 1: Write failing test `packages/usage/src/rollup.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { AgentUsageReport } from "./types.js";
import { rollup } from "./rollup.js";

function record(overrides: Partial<AgentUsageReport> = {}): AgentUsageReport {
  return {
    projectName: "proj",
    callsign: "alpha-1",
    pilotId: "pilot-a",
    sessionId: "sess-1",
    vectorId: "v1",
    agentId: "sess-1",
    timestamp: "2026-04-18T00:00:00.000Z",
    tokens: { input: 10, output: 20 },
    tools: [],
    skills: [],
    duration: 1000,
    ...overrides,
  };
}

describe("rollup", () => {
  it("groups by pilot and sums tokens/duration", () => {
    const records: AgentUsageReport[] = [
      record({ pilotId: "pilot-a", tokens: { input: 10, output: 20 } }),
      record({ pilotId: "pilot-a", tokens: { input: 5, output: 5 }, duration: 500 }),
      record({ pilotId: "pilot-b", tokens: { input: 100, output: 100 } }),
    ];
    const groups = rollup(records, "pilot");
    expect(groups).toHaveLength(2);
    const a = groups.find((g) => g.key === "pilot-a");
    expect(a?.tokens).toEqual({ input: 15, output: 25, cacheRead: 0, cacheWrite: 0 });
    expect(a?.duration).toBe(1500);
    expect(a?.recordCount).toBe(2);
  });

  it("groups by session, craft, vector, and project", () => {
    const records: AgentUsageReport[] = [
      record({ sessionId: "s1", callsign: "a", vectorId: "v1", projectName: "p" }),
      record({ sessionId: "s2", callsign: "b", vectorId: "v2", projectName: "p" }),
    ];
    expect(rollup(records, "session").map((g) => g.key).sort()).toEqual(["s1", "s2"]);
    expect(rollup(records, "craft").map((g) => g.key).sort()).toEqual(["a", "b"]);
    expect(rollup(records, "vector").map((g) => g.key).sort()).toEqual(["v1", "v2"]);
    expect(rollup(records, "project").map((g) => g.key)).toEqual(["p"]);
  });

  it("treats null vectorId as the literal group key 'null'", () => {
    const records = [record({ vectorId: null }), record({ vectorId: null })];
    const groups = rollup(records, "vector");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("null");
    expect(groups[0].recordCount).toBe(2);
  });

  it("groupBy=none returns a single total group", () => {
    const records = [record(), record()];
    const groups = rollup(records, "none");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("total");
    expect(groups[0].recordCount).toBe(2);
  });

  it("sums cacheRead and cacheWrite when present", () => {
    const records = [
      record({ tokens: { input: 1, output: 1, cacheRead: 100, cacheWrite: 50 } }),
      record({ tokens: { input: 1, output: 1, cacheRead: 200 } }),
    ];
    const [group] = rollup(records, "none");
    expect(group.tokens.cacheRead).toBe(300);
    expect(group.tokens.cacheWrite).toBe(50);
  });

  it("merges tool entries by name, summing calls and failures", () => {
    const records = [
      record({ tools: [{ name: "Bash", calls: 3, failures: 1 }] }),
      record({
        tools: [
          { name: "Bash", calls: 2, failures: 0 },
          { name: "Read", calls: 5, failures: 0 },
        ],
      }),
    ];
    const [group] = rollup(records, "none");
    const bash = group.tools.find((t) => t.name === "Bash");
    expect(bash).toEqual({ name: "Bash", calls: 5, failures: 1 });
    expect(group.tools).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airtrafficcontrol/usage exec vitest run src/rollup.test.ts`
Expected: FAIL — module `./rollup.js` not found.

- [ ] **Step 3: Implement `packages/usage/src/rollup.ts`**

```ts
import type {
  AgentUsageReport,
  SkillUsageEntry,
  TokenUsage,
  ToolUsageEntry,
} from "./types.js";

/** Dimension to group records by. */
export type GroupBy = "pilot" | "craft" | "session" | "vector" | "project" | "none";

/** A single rolled-up group produced by {@link rollup}. */
export interface UsageGroup {
  /** Group key: the value of the grouping dimension, or `"total"` / `"null"`. */
  key: string;
  /** Summed token usage across all records in the group. */
  tokens: Required<Pick<TokenUsage, "input" | "output" | "cacheRead" | "cacheWrite">>;
  /** Per-tool usage summed across records. */
  tools: ToolUsageEntry[];
  /** Per-skill usage summed across records. */
  skills: SkillUsageEntry[];
  /** Total active duration, milliseconds. */
  duration: number;
  /** Number of records that contributed to this group. */
  recordCount: number;
}

function keyFor(record: AgentUsageReport, groupBy: GroupBy): string {
  switch (groupBy) {
    case "pilot":
      return record.pilotId;
    case "craft":
      return record.callsign;
    case "session":
      return record.sessionId;
    case "vector":
      return record.vectorId ?? "null";
    case "project":
      return record.projectName;
    case "none":
      return "total";
  }
}

function emptyGroup(key: string): UsageGroup {
  return {
    key,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    tools: [],
    skills: [],
    duration: 0,
    recordCount: 0,
  };
}

function mergeEntries<T extends { name: string }>(
  target: T[],
  source: readonly T[],
  sumFields: (a: T, b: T) => T,
): void {
  for (const entry of source) {
    const existing = target.find((t) => t.name === entry.name);
    if (existing === undefined) {
      target.push({ ...entry });
    } else {
      Object.assign(existing, sumFields(existing, entry));
    }
  }
}

/**
 * Aggregate a set of records by one dimension.
 *
 * Pure; no I/O. Token fields default to 0 in the output even when the source
 * records omit the optional `cacheRead` / `cacheWrite` fields so callers can
 * render the full breakdown without null checks.
 *
 * @see RULE-USAGE-4
 */
export function rollup(records: readonly AgentUsageReport[], groupBy: GroupBy): UsageGroup[] {
  const groups = new Map<string, UsageGroup>();
  for (const record of records) {
    const key = keyFor(record, groupBy);
    let group = groups.get(key);
    if (group === undefined) {
      group = emptyGroup(key);
      groups.set(key, group);
    }
    group.tokens.input += record.tokens.input;
    group.tokens.output += record.tokens.output;
    group.tokens.cacheRead += record.tokens.cacheRead ?? 0;
    group.tokens.cacheWrite += record.tokens.cacheWrite ?? 0;
    group.duration += record.duration;
    group.recordCount += 1;
    mergeEntries(group.tools, record.tools, (a, b) => ({
      name: a.name,
      calls: a.calls + b.calls,
      failures: a.failures + b.failures,
    }));
    mergeEntries(group.skills, record.skills, (a, b) => ({
      name: a.name,
      invocations: a.invocations + b.invocations,
    }));
  }
  return Array.from(groups.values());
}
```

- [ ] **Step 4: Re-export from `packages/usage/src/index.ts`**

Append to `packages/usage/src/index.ts`:

```ts
export { rollup } from "./rollup.js";
export type { GroupBy, UsageGroup } from "./rollup.js";
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @airtrafficcontrol/usage exec vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/usage/src
git commit -m "feat(usage): add rollup function with per-dimension grouping"
```

---

## Task 4: Implement and test `filter`

**Files:**
- Create: `packages/usage/src/filter.ts`
- Create: `packages/usage/src/filter.test.ts`
- Modify: `packages/usage/src/index.ts`

- [ ] **Step 1: Write failing test `packages/usage/src/filter.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { AgentUsageReport } from "./types.js";
import { filter } from "./filter.js";

function record(overrides: Partial<AgentUsageReport> = {}): AgentUsageReport {
  return {
    projectName: "proj",
    callsign: "alpha-1",
    pilotId: "pilot-a",
    sessionId: "sess-1",
    vectorId: "v1",
    agentId: "sess-1",
    timestamp: "2026-04-18T00:00:00.000Z",
    tokens: { input: 1, output: 1 },
    tools: [],
    skills: [],
    duration: 100,
    ...overrides,
  };
}

describe("filter", () => {
  const records = [
    record({ callsign: "alpha-1", pilotId: "a", sessionId: "s1", vectorId: "v1", timestamp: "2026-04-18T00:00:00.000Z" }),
    record({ callsign: "alpha-1", pilotId: "b", sessionId: "s2", vectorId: "v2", timestamp: "2026-04-18T01:00:00.000Z" }),
    record({ callsign: "bravo-2", pilotId: "a", sessionId: "s3", vectorId: null, timestamp: "2026-04-18T02:00:00.000Z" }),
  ];

  it("returns all records when query is empty", () => {
    expect(filter(records, {})).toHaveLength(3);
  });

  it("filters by each dimensional field", () => {
    expect(filter(records, { callsign: "alpha-1" })).toHaveLength(2);
    expect(filter(records, { pilotId: "a" })).toHaveLength(2);
    expect(filter(records, { sessionId: "s2" })).toHaveLength(1);
    expect(filter(records, { vectorId: "v1" })).toHaveLength(1);
  });

  it("filters by vectorId=null string form to match null records", () => {
    expect(filter(records, { vectorId: "null" })).toHaveLength(1);
  });

  it("filters by since/until inclusive on timestamp", () => {
    expect(
      filter(records, { since: "2026-04-18T01:00:00.000Z", until: "2026-04-18T02:00:00.000Z" }),
    ).toHaveLength(2);
  });

  it("combines multiple filters with AND semantics", () => {
    const out = filter(records, { pilotId: "a", callsign: "alpha-1" });
    expect(out).toHaveLength(1);
    expect(out[0].sessionId).toBe("s1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airtrafficcontrol/usage exec vitest run src/filter.test.ts`
Expected: FAIL — module `./filter.js` not found.

- [ ] **Step 3: Implement `packages/usage/src/filter.ts`**

```ts
import type { AgentUsageReport } from "./types.js";

/**
 * Filter criteria for usage records. All fields optional; combine with AND.
 *
 * `vectorId: "null"` (the literal string) matches records whose `vectorId`
 * field is `null`. Use `undefined` (omit the key) to match any vector.
 */
export interface UsageQuery {
  pilotId?: string;
  callsign?: string;
  sessionId?: string;
  vectorId?: string;
  /** ISO-8601 lower bound, inclusive. */
  since?: string;
  /** ISO-8601 upper bound, inclusive. */
  until?: string;
}

/**
 * Return the subset of records that match every criterion in `query`.
 *
 * Pure; no I/O. Matches are AND-combined. String comparisons are exact.
 */
export function filter(
  records: readonly AgentUsageReport[],
  query: UsageQuery,
): AgentUsageReport[] {
  return records.filter((r) => {
    if (query.pilotId !== undefined && r.pilotId !== query.pilotId) return false;
    if (query.callsign !== undefined && r.callsign !== query.callsign) return false;
    if (query.sessionId !== undefined && r.sessionId !== query.sessionId) return false;
    if (query.vectorId !== undefined) {
      const actual = r.vectorId ?? "null";
      if (actual !== query.vectorId) return false;
    }
    if (query.since !== undefined && r.timestamp < query.since) return false;
    if (query.until !== undefined && r.timestamp > query.until) return false;
    return true;
  });
}
```

- [ ] **Step 4: Re-export from `packages/usage/src/index.ts`**

Append:

```ts
export { filter } from "./filter.js";
export type { UsageQuery } from "./filter.js";
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @airtrafficcontrol/usage exec vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/usage/src
git commit -m "feat(usage): add pure filter function for usage queries"
```

---

## Task 5: Re-home daemon's usage types

The daemon currently declares `TokenUsage`, `ToolUsageEntry`, `SkillUsageEntry`, and `AgentUsageReport` directly in `packages/daemon/src/types.ts`. Replace those with re-exports from `@airtrafficcontrol/usage` so the shape is owned in one place.

**Files:**
- Modify: `packages/daemon/package.json`
- Modify: `packages/daemon/tsconfig.json`
- Modify: `packages/daemon/src/types.ts`

- [ ] **Step 1: Add `@airtrafficcontrol/usage` as a dependency**

In `packages/daemon/package.json`, add `"@airtrafficcontrol/usage": "workspace:*"` to the `dependencies` block (alphabetical order, after `@airtrafficcontrol/types`).

- [ ] **Step 2: Add the tsconfig project reference**

In `packages/daemon/tsconfig.json`, add `{ "path": "../usage" }` to the `references` array.

- [ ] **Step 3: Replace the inline type declarations**

In `packages/daemon/src/types.ts`, delete the bodies of `TokenUsage`, `ToolUsageEntry`, `SkillUsageEntry`, and `AgentUsageReport` (lines 313–364 based on current file), and replace with re-exports near the top of the file:

```ts
export type {
  AgentUsageReport,
  SkillUsageEntry,
  TokenUsage,
  ToolUsageEntry,
} from "@airtrafficcontrol/usage";
```

Leave the `// Usage reporting types` section header in place with a comment explaining the re-export:

```ts
// ---------------------------------------------------------------------------
// Usage reporting types — owned by @airtrafficcontrol/usage; re-exported here
// for callers that import daemon types.
// ---------------------------------------------------------------------------
```

- [ ] **Step 4: Install and rebuild**

Run: `pnpm install && pnpm run build`
Expected: clean build. If the daemon or adapter fail to compile because the new fields (`projectName`, `pilotId`, `sessionId`, `vectorId`) are required but not yet provided, proceed — Tasks 6 and 7 add them. Temporarily cast in the failing call sites to unblock the build only if absolutely necessary; otherwise continue to Task 6 and fix forward.

- [ ] **Step 5: Run existing daemon tests**

Run: `pnpm --filter @airtrafficcontrol/daemon exec vitest run`
Expected: Tests that construct an `AgentUsageReport` will likely fail because the new required fields are missing. This is expected; Tasks 6 and 7 fix them.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/package.json packages/daemon/tsconfig.json packages/daemon/src/types.ts pnpm-lock.yaml
git commit -m "refactor(daemon): re-export usage types from @airtrafficcontrol/usage"
```

---

## Task 6: Adapter emits dimensional tags

The Claude adapter already knows `projectName`, `pilotId`, `callsign`, and `agentId` at launch time but only sets `agentId` and `callsign` on emitted reports. Add the missing tags.

**Files:**
- Modify: `packages/adapter-claude-agent-sdk/package.json`
- Modify: `packages/adapter-claude-agent-sdk/tsconfig.json`
- Modify: `packages/adapter-claude-agent-sdk/src/adapter.ts`
- Modify: `packages/adapter-claude-agent-sdk/src/adapter.test.ts`

- [ ] **Step 1: Add the package dep + tsconfig ref**

In `packages/adapter-claude-agent-sdk/package.json`, add `"@airtrafficcontrol/usage": "workspace:*"` to `dependencies`.

In `packages/adapter-claude-agent-sdk/tsconfig.json`, add `{ "path": "../usage" }` to `references`.

- [ ] **Step 2: Extend the failing adapter test**

Open `packages/adapter-claude-agent-sdk/src/adapter.test.ts`. Locate the existing test `"onUsageReport fires on SDK result messages with token totals"` (around line 283). Extend it so that the first `expect(reports[0])` asserts the new fields:

```ts
expect(reports[0]).toMatchObject({
  agentId: expect.any(String),
  sessionId: reports[0].agentId,
  callsign: "alpha-1",
  projectName: "proj",
  pilotId: "pilot-a",
  vectorId: null, // adapter leaves vectorId null; manager enriches it later
  tokens: { input: expect.any(Number), output: expect.any(Number) },
});
```

(If the existing test fixture does not launch with `projectName: "proj"` and `pilotId: "pilot-a"`, update the launch options block accordingly.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @airtrafficcontrol/adapter-claude-agent-sdk exec vitest run src/adapter.test.ts -t "onUsageReport fires"`
Expected: FAIL — missing `projectName`, `pilotId`, `sessionId`, `vectorId` fields.

- [ ] **Step 4: Track projectName on the session and populate the report**

In `packages/adapter-claude-agent-sdk/src/adapter.ts`:

1. Add `projectName: string;` to the `AgentSession` interface (near `callsign` and `pilotId`).
2. In `launch()`, set `projectName: options.projectName` when constructing the `AgentSession` literal.
3. In `_dispatch()`, inside the `message.type === "result" && message.subtype === "success"` branch, replace the `AgentUsageReport` construction with the full dimensional shape:

```ts
const report: AgentUsageReport = {
  projectName: session.projectName,
  callsign: session.callsign,
  pilotId: session.pilotId,
  sessionId: session.agentId,
  vectorId: null,
  agentId: session.agentId,
  timestamp: new Date().toISOString(),
  tokens: {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? undefined,
    cacheWrite: usage.cache_creation_input_tokens ?? undefined,
  },
  tools: [],
  skills: [],
  duration: message.duration_ms,
};
```

- [ ] **Step 5: Run adapter tests**

Run: `pnpm --filter @airtrafficcontrol/adapter-claude-agent-sdk exec vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-claude-agent-sdk
git commit -m "feat(adapter-claude-agent-sdk): tag usage reports with project/pilot/session ids"
```

---

## Task 7: AgentManager usage sink + vector enrichment

**Files:**
- Modify: `packages/daemon/src/process/agent-manager.ts`
- Modify: `packages/daemon/src/process/agent-manager.test.ts`

- [ ] **Step 1: Write failing test: sink receives enriched record**

Append to `packages/daemon/src/process/agent-manager.test.ts`:

```ts
describe("AgentManager usage pipeline", () => {
  it("forwards adapter usage reports to the configured sink, enriched with live vectorId", async () => {
    const receivedReports: import("../types.js").AgentUsageReport[] = [];
    let capturedCallback: ((r: import("../types.js").AgentUsageReport) => void) | undefined;

    const adapter = makeFakeAdapter({
      onUsageReport: vi.fn((_handle, cb) => {
        capturedCallback = cb;
      }),
      launch: vi.fn(async () => ({ agentId: "agent-1", adapterMeta: {} })),
    });
    const registry = { get: () => adapter } as unknown as AdapterRegistry;
    const agentStore = new AgentStore();
    const craftLookup = vi.fn(() => ({
      flightPlan: [
        { name: "v1", acceptanceCriteria: "", status: "Passed" },
        { name: "v2", acceptanceCriteria: "", status: "Pending" },
      ],
    }) as unknown as import("../types.js").CraftState);

    const manager = new AgentManager({
      adapterRegistry: registry,
      agentStore,
      usageSink: (report) => receivedReports.push(report),
      getCraft: craftLookup,
    });

    await manager.launch({
      agentId: "agent-1",
      adapterType: "fake",
      projectName: "proj",
      callsign: "alpha-1",
      pilotId: "pilot-a",
      launchOptions: {} as import("../adapters/adapter.js").AgentLaunchOptions,
    });

    expect(capturedCallback).toBeDefined();
    capturedCallback!({
      projectName: "proj",
      callsign: "alpha-1",
      pilotId: "pilot-a",
      sessionId: "agent-1",
      vectorId: null,
      agentId: "agent-1",
      timestamp: "2026-04-18T00:00:00.000Z",
      tokens: { input: 10, output: 20 },
      tools: [],
      skills: [],
      duration: 100,
    });

    expect(receivedReports).toHaveLength(1);
    expect(receivedReports[0].vectorId).toBe("v2");
    expect(craftLookup).toHaveBeenCalledWith("proj", "alpha-1");
  });

  it("leaves vectorId null when no pending vector is found", async () => {
    const receivedReports: import("../types.js").AgentUsageReport[] = [];
    let capturedCallback: ((r: import("../types.js").AgentUsageReport) => void) | undefined;
    const adapter = makeFakeAdapter({
      onUsageReport: vi.fn((_h, cb) => {
        capturedCallback = cb;
      }),
      launch: vi.fn(async () => ({ agentId: "agent-2", adapterMeta: {} })),
    });
    const manager = new AgentManager({
      adapterRegistry: { get: () => adapter } as unknown as AdapterRegistry,
      agentStore: new AgentStore(),
      usageSink: (r) => receivedReports.push(r),
      getCraft: () => ({ flightPlan: [] }) as unknown as import("../types.js").CraftState,
    });
    await manager.launch({
      agentId: "agent-2",
      adapterType: "fake",
      projectName: "proj",
      callsign: "alpha-1",
      launchOptions: {} as import("../adapters/adapter.js").AgentLaunchOptions,
    });
    capturedCallback!({
      projectName: "proj",
      callsign: "alpha-1",
      pilotId: "pilot-a",
      sessionId: "agent-2",
      vectorId: null,
      agentId: "agent-2",
      timestamp: "2026-04-18T00:00:00.000Z",
      tokens: { input: 1, output: 1 },
      tools: [],
      skills: [],
      duration: 1,
    });
    expect(receivedReports[0].vectorId).toBeNull();
  });
});
```

(The existing `makeFakeAdapter` helper near the top of the test file already returns an object with a `vi.fn()` for `onUsageReport`. If your helper's signature doesn't allow overriding `onUsageReport` per-call, extend it to spread `...overrides` over the default mocks before using it.)

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @airtrafficcontrol/daemon exec vitest run src/process/agent-manager.test.ts`
Expected: FAIL — `AgentManagerDeps.usageSink` and `getCraft` don't exist, `AgentManager` doesn't wire `onUsageReport`.

- [ ] **Step 3: Extend `AgentManagerDeps` and wire the sink**

In `packages/daemon/src/process/agent-manager.ts`:

1. Add to imports:

```ts
import type { AgentUsageReport, CraftState, VectorState } from "../types.js";
```

(We resolve the current vector inline rather than calling `getNextVector` from
`@airtrafficcontrol/core` — that function takes `FlightPlan = readonly Vector[]`,
whose `status` is the `VectorStatus` enum, while `CraftState.flightPlan` is
`VectorState[]` with string-literal statuses. The values match at runtime but
the types don't align without a cast, so a one-line inline search is simpler.)

2. Add new type below `IntercomSink`:

```ts
/**
 * Sink invoked once per usage report emitted by an agent, after the manager
 * enriches it with the live `vectorId` from the craft store.
 *
 * @see RULE-USAGE-1
 * @see RULE-USAGE-2
 */
export type UsageSink = (report: AgentUsageReport) => void;

/**
 * Live craft lookup: given `(projectName, callsign)`, return the current
 * craft state, or `undefined` when unknown. The manager uses this to resolve
 * `vectorId` at persistence time rather than trusting a snapshot taken at
 * session launch.
 */
export type CraftLookup = (projectName: string, callsign: string) => CraftState | undefined;
```

3. Extend `AgentManagerDeps`:

```ts
  /**
   * Optional sink invoked with each enriched {@link AgentUsageReport}. When
   * omitted, usage reports are dropped.
   */
  usageSink?: UsageSink;
  /**
   * Optional live craft lookup used to resolve `vectorId` on each report.
   * When omitted, `vectorId` is left as emitted by the adapter (always null).
   */
  getCraft?: CraftLookup;
```

4. Extend the class:

```ts
  private readonly _usageSink?: UsageSink;
  private readonly _getCraft?: CraftLookup;
```

5. In the constructor, after existing assignments:

```ts
    this._usageSink = deps.usageSink;
    this._getCraft = deps.getCraft;
```

6. In `launch()`, after the existing `adapter.onMessage` wiring, add:

```ts
    if (this._usageSink !== undefined) {
      const sink = this._usageSink;
      const lookup = this._getCraft;
      adapter.onUsageReport(handle, (report) => {
        let enrichedVector: string | null = report.vectorId;
        if (lookup !== undefined) {
          const craft = lookup(options.projectName, options.callsign);
          if (craft !== undefined) {
            const next: VectorState | undefined = craft.flightPlan.find(
              (v) => v.status === "Pending",
            );
            enrichedVector = next?.name ?? null;
          }
        }
        sink({ ...report, vectorId: enrichedVector });
      });
    }
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm --filter @airtrafficcontrol/daemon exec vitest run src/process/agent-manager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/process/agent-manager.ts packages/daemon/src/process/agent-manager.test.ts
git commit -m "feat(daemon): wire AgentManager usage sink with live vectorId enrichment"
```

---

## Task 8: Usage reader for fan-out across craft directories

**Files:**
- Create: `packages/daemon/src/state/usage-reader.ts`
- Create: `packages/daemon/src/state/usage-reader.test.ts`

- [ ] **Step 1: Write failing test `packages/daemon/src/state/usage-reader.test.ts`**

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentUsageReport } from "@airtrafficcontrol/usage";
import { UsageReader } from "./usage-reader.js";

function record(overrides: Partial<AgentUsageReport> = {}): AgentUsageReport {
  return {
    projectName: "proj",
    callsign: "alpha-1",
    pilotId: "pilot-a",
    sessionId: "sess-1",
    vectorId: "v1",
    agentId: "sess-1",
    timestamp: "2026-04-18T00:00:00.000Z",
    tokens: { input: 1, output: 1 },
    tools: [],
    skills: [],
    duration: 1,
    ...overrides,
  };
}

describe("UsageReader", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "usage-reader-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns empty array when no crafts directory exists", async () => {
    const reader = new UsageReader(dir);
    expect(await reader.readProject("proj")).toEqual([]);
  });

  it("reads and parses usage.json lines across multiple crafts", async () => {
    const proj = join(dir, "projects", "proj", "crafts");
    await mkdir(join(proj, "alpha-1"), { recursive: true });
    await mkdir(join(proj, "bravo-2"), { recursive: true });
    await writeFile(
      join(proj, "alpha-1", "usage.json"),
      [
        JSON.stringify(record({ callsign: "alpha-1", sessionId: "s1" })),
        JSON.stringify(record({ callsign: "alpha-1", sessionId: "s2" })),
      ].join("\n") + "\n",
    );
    await writeFile(
      join(proj, "bravo-2", "usage.json"),
      JSON.stringify(record({ callsign: "bravo-2", sessionId: "s3" })) + "\n",
    );
    const reader = new UsageReader(dir);
    const all = await reader.readProject("proj");
    expect(all).toHaveLength(3);
    expect(all.map((r) => r.sessionId).sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("skips blank lines and missing per-craft usage files", async () => {
    const proj = join(dir, "projects", "proj", "crafts");
    await mkdir(join(proj, "alpha-1"), { recursive: true });
    await mkdir(join(proj, "bravo-2"), { recursive: true });
    await writeFile(
      join(proj, "alpha-1", "usage.json"),
      "\n" + JSON.stringify(record({ sessionId: "s1" })) + "\n\n",
    );
    const reader = new UsageReader(dir);
    const all = await reader.readProject("proj");
    expect(all).toHaveLength(1);
    expect(all[0].sessionId).toBe("s1");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @airtrafficcontrol/daemon exec vitest run src/state/usage-reader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/daemon/src/state/usage-reader.ts`**

```ts
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentUsageReport } from "@airtrafficcontrol/usage";

/**
 * Fan-out reader that streams usage.json files from every craft under a
 * project directory and yields the parsed {@link AgentUsageReport} records.
 *
 * The reader performs no aggregation; callers apply {@link filter} and
 * {@link rollup} from `@airtrafficcontrol/usage` on the returned records.
 *
 * @see RULE-USAGE-4
 */
export class UsageReader {
  constructor(private readonly stateDir: string) {}

  /**
   * Read every `projects/<project>/crafts/<callsign>/usage.json` under the
   * state directory and return the concatenated records. Missing files,
   * missing directories, and blank lines are silently skipped.
   *
   * @param projectName - Project to read usage for.
   * @returns All records across every craft in the project, in on-disk order.
   */
  async readProject(projectName: string): Promise<AgentUsageReport[]> {
    const craftsDir = join(this.stateDir, "projects", projectName, "crafts");
    let callsigns: string[];
    try {
      callsigns = await readdir(craftsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const records: AgentUsageReport[] = [];
    for (const callsign of callsigns) {
      const file = join(craftsDir, callsign, "usage.json");
      let content: string;
      try {
        content = await readFile(file, "utf-8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        records.push(JSON.parse(trimmed) as AgentUsageReport);
      }
    }
    return records;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @airtrafficcontrol/daemon exec vitest run src/state/usage-reader.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/state/usage-reader.ts packages/daemon/src/state/usage-reader.test.ts
git commit -m "feat(daemon): add UsageReader for cross-craft usage fan-out"
```

---

## Task 9: Wire the daemon-level usage sink

Install a default `usageSink` that writes to `CraftStore.appendUsageReport` and publishes on `usage:<projectName>`.

**Files:**
- Modify: `packages/daemon/src/daemon.ts`
- Modify: `packages/daemon/src/daemon.test.ts` (if present; otherwise a new integration-level test in `src/process/agent-manager.test.ts` is acceptable)

- [ ] **Step 1: Locate the AgentManager construction site**

Open `packages/daemon/src/daemon.ts`. The construction is inside
`Daemon.start()` as a local `const agentManager = new AgentManager({ ... })`
(around line 131). Local vars `agentStore`, `craftStore`, `channelRegistry`,
and `adapterRegistry` are in scope at that point.

- [ ] **Step 2: Pass the sink and lookup**

Extend the existing `new AgentManager({ ... })` literal with two new deps,
keeping the existing `outputSink`:

```ts
const agentManager = new AgentManager({
  adapterRegistry,
  agentStore,
  outputSink: (ctx, line) => {
    const craft = craftStore.get(ctx.projectName, ctx.callsign);
    if (craft === undefined) {
      return;
    }
    appendBlackBoxEntryWithRegistry(
      channelRegistry,
      ctx.projectName,
      craft,
      "system",
      BlackBoxEntryType.AgentOutput,
      `[${line.stream}] ${line.text}`,
    );
    craftStore.set(ctx.projectName, craft);
  },
  usageSink: (report) => {
    void craftStore.appendUsageReport(report.projectName, report.callsign, report);
    channelRegistry.publish(`usage:${report.projectName}`, report);
  },
  getCraft: (projectName, callsign) => craftStore.get(projectName, callsign),
});
```

- [ ] **Step 3: Rebuild and run the existing suite**

Run: `pnpm run build && pnpm --filter @airtrafficcontrol/daemon exec vitest run`
Expected: all tests PASS (no new assertions yet — we only added wiring; the integration is exercised end-to-end through Task 10's route tests).

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/daemon.ts
git commit -m "feat(daemon): persist and broadcast usage reports via AgentManager sink"
```

---

## Task 10: Unified query endpoint

**Files:**
- Create: `packages/daemon/src/server/routes/usage.ts`
- Create: `packages/daemon/src/server/routes/usage.test.ts`
- Modify: wherever `fastifyPlugin` routes are registered in `packages/daemon/src/daemon.ts`
- Modify: `packages/daemon/src/server/routes/agents.ts` (delegate the back-compat endpoint)

- [ ] **Step 1: Locate current route registration**

Run: `grep -n "agentRoutes\|projectRoutes\|Routes(app)" packages/daemon/src/daemon.ts`
Note the registration block so Step 5 can slot `usageRoutes` alongside.

- [ ] **Step 2: Write failing test `packages/daemon/src/server/routes/usage.test.ts`**

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentUsageReport } from "@airtrafficcontrol/usage";
import { UsageReader } from "../../state/usage-reader.js";
import { usageRoutes } from "./usage.js";

function record(overrides: Partial<AgentUsageReport> = {}): AgentUsageReport {
  return {
    projectName: "proj",
    callsign: "alpha-1",
    pilotId: "pilot-a",
    sessionId: "sess-1",
    vectorId: "v1",
    agentId: "sess-1",
    timestamp: "2026-04-18T00:00:00.000Z",
    tokens: { input: 10, output: 20 },
    tools: [],
    skills: [],
    duration: 100,
    ...overrides,
  };
}

async function seed(dir: string, records: AgentUsageReport[]): Promise<void> {
  const byCraft = new Map<string, AgentUsageReport[]>();
  for (const r of records) {
    const list = byCraft.get(r.callsign) ?? [];
    list.push(r);
    byCraft.set(r.callsign, list);
  }
  for (const [callsign, list] of byCraft) {
    const d = join(dir, "projects", "proj", "crafts", callsign);
    await mkdir(d, { recursive: true });
    await writeFile(
      join(d, "usage.json"),
      list.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
  }
}

describe("usage routes", () => {
  let dir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "usage-routes-"));
    app = Fastify();
    app.decorate("usageReader", new UsageReader(dir));
    await app.register(usageRoutes);
  });
  afterEach(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("returns raw records newest-first by default", async () => {
    await seed(dir, [
      record({ sessionId: "s1", timestamp: "2026-04-18T00:00:00.000Z" }),
      record({ sessionId: "s2", timestamp: "2026-04-18T01:00:00.000Z" }),
    ]);
    const res = await app.inject({ method: "GET", url: "/api/v1/projects/proj/usage" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AgentUsageReport[];
    expect(body.map((r) => r.sessionId)).toEqual(["s2", "s1"]);
  });

  it("filters by pilotId", async () => {
    await seed(dir, [
      record({ pilotId: "a", sessionId: "s1" }),
      record({ pilotId: "b", sessionId: "s2" }),
    ]);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/projects/proj/usage?pilotId=a",
    });
    expect(res.json()).toHaveLength(1);
  });

  it("returns grouped rollup when format=rollup", async () => {
    await seed(dir, [
      record({ pilotId: "a", tokens: { input: 10, output: 20 } }),
      record({ pilotId: "a", tokens: { input: 5, output: 5 }, sessionId: "s2" }),
      record({ pilotId: "b", tokens: { input: 100, output: 100 }, sessionId: "s3" }),
    ]);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/projects/proj/usage?format=rollup&groupBy=pilot",
    });
    const body = res.json() as { groups: Array<{ key: string; tokens: { input: number } }> };
    expect(body.groups.find((g) => g.key === "a")?.tokens.input).toBe(15);
    expect(body.groups.find((g) => g.key === "b")?.tokens.input).toBe(100);
  });

  it("returns a single total when format=rollup and groupBy=none", async () => {
    await seed(dir, [record({ tokens: { input: 1, output: 2 } })]);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/projects/proj/usage?format=rollup&groupBy=none",
    });
    const body = res.json() as { groups: Array<{ key: string }> };
    expect(body.groups).toEqual([expect.objectContaining({ key: "total" })]);
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `pnpm --filter @airtrafficcontrol/daemon exec vitest run src/server/routes/usage.test.ts`
Expected: FAIL — route file does not exist.

- [ ] **Step 4: Implement `packages/daemon/src/server/routes/usage.ts`**

```ts
/**
 * Unified usage query endpoint.
 *
 * Supports filtering by dimension, time range, and two output shapes:
 * raw records or grouped rollup.
 *
 * @see RULE-USAGE-1
 * @see RULE-USAGE-4
 */

import type { FastifyInstance } from "fastify";
import { filter, rollup, type GroupBy, type UsageQuery } from "@airtrafficcontrol/usage";

interface UsageQueryString extends UsageQuery {
  groupBy?: GroupBy;
  format?: "records" | "rollup";
}

const VALID_GROUP_BY: readonly GroupBy[] = ["pilot", "craft", "session", "vector", "project", "none"];

/**
 * Registers the unified usage query routes.
 *
 * Routes:
 * - `GET /api/v1/projects/:project/usage` — records or rollup, filtered.
 *
 * @see RULE-USAGE-1
 */
export async function usageRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { project: string };
    Querystring: UsageQueryString;
  }>("/api/v1/projects/:project/usage", async (request, reply) => {
    const { project } = request.params;
    const { groupBy = "pilot", format = "records", ...query } = request.query;

    if (format === "rollup" && !VALID_GROUP_BY.includes(groupBy)) {
      return reply.code(400).send({ error: `Invalid groupBy: ${groupBy}` });
    }

    const all = await app.usageReader.readProject(project);
    const matched = filter(all, query);

    if (format === "rollup") {
      return reply.send({ groups: rollup(matched, groupBy) });
    }

    // records: newest first by timestamp
    const sorted = [...matched].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return reply.send(sorted);
  });
}
```

- [ ] **Step 5: Declare the `usageReader` decorator type**

Add a module augmentation near the top of `packages/daemon/src/server/routes/usage.ts` or — if a shared declaration file exists (e.g. `packages/daemon/src/types/fastify.d.ts`) — add it there. If no shared file exists, colocate in this route file:

```ts
declare module "fastify" {
  interface FastifyInstance {
    usageReader: import("../../state/usage-reader.js").UsageReader;
  }
}
```

- [ ] **Step 6: Wire `usageReader` + register the route in the daemon**

In `packages/daemon/src/daemon.ts`, inside `Daemon.start()`, after the
`craftStore` local is initialised, add:

```ts
const usageReader = new UsageReader(this._profileDir);
```

Then, alongside the other Fastify decorations (search for existing
`app.decorate(...)` calls in the file — e.g. `decorate("craftStore", ...)` or
the block where `agentStore`, `craftStore`, etc. are attached):

```ts
app.decorate("usageReader", usageReader);
```

And in the route registration block (search for the existing `agentRoutes`
registration):

```ts
await app.register(usageRoutes);
```

Add an import at the top of `packages/daemon/src/daemon.ts`:

```ts
import { UsageReader } from "./state/usage-reader.js";
import { usageRoutes } from "./server/routes/usage.js";
```

- [ ] **Step 7: Update back-compat `/agents/:id/usage` to use the reader**

In `packages/daemon/src/server/routes/agents.ts`, replace the current file-read implementation of `GET /api/v1/agents/:id/usage` with a reader-backed version that filters by `sessionId`:

```ts
app.get<{ Params: { id: string } }>("/api/v1/agents/:id/usage", async (request, reply) => {
  const agent = app.agentStore.get(request.params.id);
  if (!agent) {
    return reply.code(404).send({ error: `Agent not found: ${request.params.id}` });
  }
  const all = await app.usageReader.readProject(agent.projectName);
  return reply.send(all.filter((r) => r.sessionId === request.params.id));
});
```

Remove the now-unused `readFile` and `join` imports if no other code in the file uses them.

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @airtrafficcontrol/daemon exec vitest run`
Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/daemon/src/server/routes/usage.ts packages/daemon/src/server/routes/usage.test.ts packages/daemon/src/server/routes/agents.ts packages/daemon/src/daemon.ts
git commit -m "feat(daemon): add unified usage query endpoint with rollup"
```

---

## Task 11: Web package drops duplicated types

**Files:**
- Modify: `packages/web/package.json`
- Modify: `packages/web/tsconfig.json`
- Modify: `packages/web/src/types/api.ts`

- [ ] **Step 1: Add the dep and project reference**

In `packages/web/package.json`, add `"@airtrafficcontrol/usage": "workspace:*"` to `dependencies`.

In `packages/web/tsconfig.json`, add `{ "path": "../usage" }` to the `references` array.

- [ ] **Step 2: Replace duplicated types**

In `packages/web/src/types/api.ts`, locate the local declarations of `TokenUsage`, `ToolUsageEntry`, `SkillUsageEntry`, and `AgentUsageReport` (currently around line 120–150). Delete those interface bodies and replace them with:

```ts
export type {
  AgentUsageReport,
  SkillUsageEntry,
  TokenUsage,
  ToolUsageEntry,
} from "@airtrafficcontrol/usage";
```

- [ ] **Step 3: Install and build**

Run: `pnpm install && pnpm run build`
Expected: clean build. If consumer files in `packages/web/src` reference the old local names, the re-export keeps them working unchanged.

- [ ] **Step 4: Run web tests**

Run: `pnpm --filter @airtrafficcontrol/web exec vitest run`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/package.json packages/web/tsconfig.json packages/web/src/types/api.ts pnpm-lock.yaml
git commit -m "refactor(web): import usage types from @airtrafficcontrol/usage"
```

---

## Task 12: Spec additions

**Files:**
- Modify: `docs/specification.md`

- [ ] **Step 1: Add a new section**

Open `docs/specification.md`. Locate the last numbered section before Appendix A (rule numbering goes RULE-{PREFIX}-{N}; find the highest-numbered section in the body). Insert a new section after it titled:

```markdown
## <N>. Usage Telemetry

Every agent turn that produces an end-of-turn `result` from its adapter produces
one **usage record** tagged with the craft, pilot, session, vector, and project
the turn belongs to. Records are append-only and drive rollups for cost
accountability and performance profiling.

### <N>.1 Record shape

A usage record MUST contain the following fields:
`projectName`, `callsign`, `pilotId`, `sessionId`, `vectorId` (nullable),
`agentId`, `timestamp`, `tokens`, `tools`, `skills`, `duration`.

- **RULE-USAGE-1** — Every agent turn that produces a `result` message MUST be
  recorded as an `AgentUsageReport` tagged with
  `(projectName, callsign, pilotId, sessionId, vectorId, agentId, timestamp)`.
- **RULE-USAGE-2** — `vectorId` MUST be resolved from the live craft state at
  the moment the report is persisted, not from the state captured at session
  launch.
- **RULE-USAGE-3** — Usage records are append-only. Existing records MUST NOT
  be mutated.
- **RULE-USAGE-4** — Rollup queries MUST be computed from raw records. No
  pre-aggregated cache is authoritative.

### <N>.2 Out of scope

- Cross-project pilot rollups (pilots are scoped per project).
- Per-tool / per-skill token attribution (SDK does not surface this).
- Pre-aggregated rollup caches, alternative storage backends, or retention
  policies for `usage.json`.
```

Replace `<N>` with the appropriate next section number for the document.

- [ ] **Step 2: Add entries to Appendix A (Rule Index)**

Locate the Rule Index table in Appendix A. Add four rows in rule-id order:

```markdown
| RULE-USAGE-1 | Every agent turn produces a tagged usage record. |
| RULE-USAGE-2 | `vectorId` resolved from live craft state at persistence time. |
| RULE-USAGE-3 | Usage records are append-only. |
| RULE-USAGE-4 | Rollups computed from raw records. |
```

- [ ] **Step 3: Commit**

```bash
git add docs/specification.md
git commit -m "docs(spec): add RULE-USAGE-1..4 for token usage telemetry"
```

---

## Task 13: Changelogs

**Files:**
- Modify: `packages/daemon/CHANGELOG.md`
- Modify: `packages/adapter-claude-agent-sdk/CHANGELOG.md`
- Modify: `packages/web/CHANGELOG.md`
- Create: `packages/usage/CHANGELOG.md`

- [ ] **Step 1: Write `packages/usage/CHANGELOG.md`**

```markdown
# @airtrafficcontrol/usage — CHANGELOG

## 0.0.1 — 2026-04-18

- Initial release. Pure types (`AgentUsageReport`, `TokenUsage`, `ToolUsageEntry`,
  `SkillUsageEntry`) and pure functions (`rollup`, `filter`) for ATC token
  usage telemetry. No runtime dependencies beyond `@airtrafficcontrol/types`.
```

- [ ] **Step 2: Add entries to the three modified packages**

At the top of each of `packages/daemon/CHANGELOG.md`, `packages/adapter-claude-agent-sdk/CHANGELOG.md`, and `packages/web/CHANGELOG.md`, add a new unreleased/date-stamped entry. Examples:

**daemon:**

```markdown
## Unreleased

- Wire `AgentManager.usageSink` and `getCraft` so adapter usage reports are
  persisted to `usage.json` and broadcast on WebSocket channel
  `usage:<projectName>`. Adds `UsageReader` for cross-craft fan-out reads.
- Add `GET /api/v1/projects/:project/usage` query endpoint with `filter`,
  `groupBy`, and `format=records|rollup` support.
- Re-export usage types from `@airtrafficcontrol/usage` (no source-level
  changes for callers).
- `GET /api/v1/agents/:id/usage` now delegates to `UsageReader` and filters
  by `sessionId`; payload shape is unchanged.
```

**adapter-claude-agent-sdk:**

```markdown
## Unreleased

- Usage reports now carry full dimensional tagging:
  `projectName`, `pilotId`, `sessionId` in addition to the existing
  `agentId` / `callsign`. `vectorId` is left `null` for the daemon to enrich.
```

**web:**

```markdown
## Unreleased

- Replace locally duplicated usage types with re-exports from
  `@airtrafficcontrol/usage`. No runtime changes.
```

- [ ] **Step 3: Commit**

```bash
git add packages/usage/CHANGELOG.md packages/daemon/CHANGELOG.md packages/adapter-claude-agent-sdk/CHANGELOG.md packages/web/CHANGELOG.md
git commit -m "docs(changelog): record usage telemetry changes"
```

---

## Task 14: Final build + full test sweep

**Files:** none

- [ ] **Step 1: Clean build**

Run: `pnpm run build`
Expected: clean build across all packages.

- [ ] **Step 2: Full test suite**

Run: `pnpm run test`
Expected: all tests PASS with ≥90% coverage on changed files.

- [ ] **Step 3: Lint + format**

Run: `pnpm run lint && pnpm run format:check`
Expected: clean.

- [ ] **Step 4: Manual sanity**

Boot the daemon against a scratch profile, seed the demo, and confirm
`curl localhost:7700/api/v1/projects/<demo-project>/usage?format=rollup&groupBy=pilot`
returns a `groups` array. (Empty is acceptable if no agent has run a turn; this
is a smoke check that the route is wired.)

- [ ] **Step 5: If anything fails, fix before proceeding**

Do not move to the next task until all four checks above are clean.

---

## Spec ↔ Plan Coverage

| Spec section | Task(s) |
|---|---|
| §3 Dimensions | 2, 6, 7 |
| §4 Data model | 2, 5 |
| §5 Package boundaries (new `@airtrafficcontrol/usage`) | 1, 2, 3, 4, 11 |
| §6 Capture & enrichment pipeline | 6, 7, 9 |
| §7 Storage | 8, 9 (no new files) |
| §8 Query API | 9, 10 |
| §9 Guardrails (deferred) | Not implemented — sink is extensible per §9 |
| §10 Spec additions (RULE-USAGE-*) | 12 |
| §11 Testing | 3, 4, 6, 7, 8, 10, 14 |
