# Token Usage Telemetry — Design

**Date:** 2026-04-18
**Status:** Draft
**Scope:** Monitor and profile token usage per pilot, craft, pilot session, vector, and project.

## 1. Goals

Co-primary goals:

1. **Cost accountability** — answer "who/what burned tokens?" across pilots, crafts, sessions, vectors, and projects.
2. **Performance profiling** — drill into which turns, vectors, and tools are expensive so prompts and flows can be optimized.

Secondary:

3. **Operational guardrails** — provide a hook for soft/hard token limits that can warn or pause agents. Full enforcement is deferred; the pipeline is designed to accept this without reshaping.

## 2. Non-Goals

- Cross-project pilot identity. Pilots are scoped `(projectName, identifier)` per the current `PilotStore`; cross-project rollups are not supported.
- Per-tool token attribution. The Anthropic SDK's end-of-turn `result` message does not surface per-tool token breakdowns; `tools[]` and `skills[]` remain empty placeholders until a separate counting pass is added.
- Pre-aggregated rollup caches or SQLite storage. Raw JSONL is sufficient at current scale; revisit when a dashboard feels slow.
- Retention / rotation of `usage.json`. Files grow unboundedly; rotation is a separate follow-up.

## 3. Dimensions

Every usage record carries all five dimensions so rollups are pure filter-and-sum over a flat log. No joins, no foreign keys.

| Dimension | Field         | Source                                                |
|-----------|---------------|-------------------------------------------------------|
| Project   | `projectName` | `AgentLaunchOptions.projectName`                      |
| Craft     | `callsign`    | `AgentLaunchOptions.craft.callsign`                   |
| Pilot     | `pilotId`     | `AgentLaunchOptions.pilotId` (falls back to captain)  |
| Session   | `sessionId`   | `AgentLaunchOptions.agentId` (one agent lifecycle)    |
| Vector    | `vectorId`    | Resolved at persistence time from live craft state    |

`sessionId` is the same value as `agentId`; both names exist so downstream code can use the semantic that fits. Pause/resume stays within the same session.

## 4. Data Model

Extend `AgentUsageReport` (currently in `packages/daemon/src/types.ts`):

```ts
interface AgentUsageReport {
  // dimensional tags
  projectName: string;        // NEW
  callsign: string;           // existing
  pilotId: string;            // NEW
  sessionId: string;          // NEW — alias of agentId
  vectorId: string | null;    // NEW — null if no vector active
  agentId: string;            // existing
  timestamp: string;          // existing ISO-8601

  // payload
  tokens: TokenUsage;         // existing: input, output, cacheRead?, cacheWrite?
  tools: ToolUsageEntry[];    // placeholder — see Non-Goals
  skills: SkillUsageEntry[];  // placeholder — see Non-Goals
  duration: number;           // existing, ms
}
```

`vectorId` is nullable: turns can occur before the first vector is active or between vectors.

## 5. Package Boundaries

Introduce **`@airtrafficcontrol/usage`** as a new workspace package. It owns:

- The usage types (`TokenUsage`, `ToolUsageEntry`, `SkillUsageEntry`, `AgentUsageReport`).
- The pure `rollup(records, groupBy)` function.
- A pure `filter(records, query)` function for query-param translation.

Rationale:

- `packages/web/src/types/api.ts` currently duplicates `AgentUsageReport` (known gap in `CLAUDE.md`). A shared package resolves the duplication.
- Rollup logic is pure domain logic, testable without a daemon. It does not belong in `@airtrafficcontrol/daemon`, and `@airtrafficcontrol/core` is reserved for craft/controls/lifecycle runtime — a separate package keeps those boundaries clean.
- Dependencies: `@airtrafficcontrol/types` only. No runtime deps.

Consumers:

- `@airtrafficcontrol/daemon` — imports types for persistence and routes, imports `rollup`/`filter` for the query API.
- `@airtrafficcontrol/web` — imports types, drops the local duplicate from `src/types/api.ts`.
- `@airtrafficcontrol/adapter-claude-agent-sdk` — imports the `AgentUsageReport` type it already uses (currently re-exported via daemon).

## 6. Capture & Enrichment Pipeline

```
SDK `result` message
  └─> ClaudeAgentSdkAdapter._dispatch emits raw AgentUsageReport
       └─> AgentManager.onUsageReport handler receives it
            ├─> reads live craft state from craftStore → resolves current vectorId
            ├─> writes enriched record to JSONL via CraftStore.appendUsageReport
            ├─> broadcasts record on WebSocket channel `usage:<project>`
            └─> (future) invokes LimitEvaluator for guardrails
```

Responsibility split:

- **Adapter** stays runtime-agnostic. It sets `projectName`, `callsign`, `pilotId`, `sessionId` (= `agentId`), `agentId`, `timestamp`, and `tokens` — all values known from `AgentLaunchOptions` and the SDK message. `vectorId` is left `null` by the adapter.
- **`AgentManager`** is the enrichment point. It is the only place with reliable access to the live `craftStore`, which is updated mid-session by REST calls the adapter never sees. Resolving `vectorId` at persistence time guarantees the record reflects the vector active when the turn ended, not one snapshotted at session launch.

The existing adapter code in `packages/adapter-claude-agent-sdk/src/adapter.ts` already has `pilotId` and `callsign` in its session state; only `projectName` and `sessionId` need to be added to the emitted report.

## 7. Storage

Reuse the existing append-only JSONL file per craft:

```
<profileDir>/projects/<project>/crafts/<callsign>/usage.json
```

Records for every session, pilot, and vector on a craft coexist in the same file; the dimensional tags on each line are the only discriminator. No new files introduced.

Cross-craft reads (per-pilot, per-project rollups) fan out across craft directories via a `UsageReader` helper:

```
<profileDir>/projects/<project>/crafts/*/usage.json
```

`UsageReader` streams each file line-by-line and yields records. Rollups happen in-memory per request. Append-only writes are crash-safe without atomic-write ceremony.

## 8. Query API

One unified filter endpoint per project. The existing `GET /api/v1/agents/:id/usage` is kept for backwards compatibility and delegates to the unified endpoint with `sessionId=:id`.

```
GET /api/v1/projects/:project/usage
    ?pilotId=...
    &callsign=...
    &sessionId=...
    &vectorId=...
    &since=<iso>
    &until=<iso>
    &groupBy=pilot|craft|session|vector|project|none
    &format=records|rollup
```

Semantics:

- **`format=records`** (default) — returns the matched raw records, newest first.
- **`format=rollup`** — returns `{ groups: [{ key, tokens, tools, skills, duration, recordCount }] }`, where `key` is the value of the `groupBy` dimension.
- **`groupBy=none` + `format=rollup`** — single aggregate total over the filter.
- All query parameters are optional; omitted filter → whole project.

Live updates: WebSocket channel **`usage:<project>`** emits each enriched record as it is persisted. The web dashboard subscribes and updates tiles without polling.

## 9. Guardrails (Deferred)

Design sketch so the current pipeline does not paint us into a corner:

- Per-project config block in the layered config store: `usage.limits.{pilot,craft,session,project}.{soft,hard}` — integer total-token ceilings.
- The `AgentManager` usage-sink (§6) grows a third fan-out: a `LimitEvaluator` that re-reads relevant records after each append and evaluates thresholds.
- **Soft breach** → append a `BlackBoxEntry` of type `UsageWarning` and broadcast on the usage WebSocket channel. No agent action.
- **Hard breach** → same, plus invoke `agentManager.pause(sessionId)`.

No change to §§4–8 is required to add this later.

## 10. Spec Additions

New rule family `RULE-USAGE-*` added to `docs/specification.md` (new section and Appendix A entries):

- **RULE-USAGE-1** — Every agent turn that produces a `result` message MUST be recorded as an `AgentUsageReport` tagged with `(projectName, callsign, pilotId, sessionId, vectorId, agentId, timestamp)`.
- **RULE-USAGE-2** — `vectorId` is resolved from the live craft state at the moment the report is persisted, not from the state captured at session launch.
- **RULE-USAGE-3** — Usage records are append-only. Existing records MUST NOT be mutated.
- **RULE-USAGE-4** — Rollup queries MUST be computed from raw records. No pre-aggregated cache is authoritative.

The web-dashboard type duplication (`packages/web/src/types/api.ts`) is resolved as part of introducing `@airtrafficcontrol/usage` — it is a consequence of the package split, not a separate work item.

## 11. Testing

- **`@airtrafficcontrol/usage`** — unit tests for `rollup`, `filter`, and record-shape validation. Pure functions, no fixtures.
- **Adapter** — extend existing `onUsageReport` tests to assert the new tag fields are emitted.
- **AgentManager** — tests for vector enrichment: turn emitted while vector A active vs. after vector A passes → two records with different `vectorId`.
- **Routes** — integration tests for the unified `GET /api/v1/projects/:project/usage` endpoint covering each `groupBy` and `format=rollup` vs `records`.
- **E2E** — the existing Playwright suite seeds demo data; extend it to load the usage page and assert at least one rollup row renders.

Coverage target per `docs/contributing.md`: 90% on changed files.

## 12. Out of Scope

- Cross-project pilot rollups.
- Per-tool / per-skill token attribution.
- Rollup caches, SQLite, any non-JSONL storage.
- `usage.json` rotation, compaction, or retention policies.
- Full guardrail enforcement (design only; implementation is a follow-up).
- Cost translation (tokens → dollars). The raw record does not include a price table; any pricing layer is downstream.
