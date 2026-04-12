---
title: Landing Checklist
sidebar_position: 2
---

# Landing Checklist

The **landing checklist** is a configurable set of validation checks that must all pass before a craft can request landing clearance from the [tower](/docs/concepts/tower). It is the final quality gate before merging.

The checklist system was generalized in the spec from a hardcoded landing-only concept (old RULE-LCHK-\*) into a template-and-binding model that can attach checklists to any lifecycle event (RULE-CHKL-1 through RULE-CHKL-8). The `before:landing-check` event replaces the original landing checklist phase, but the default template preserves the same four checks.

## Aviation Analogy

Before landing, pilots run through a checklist -- landing gear down, flaps set, speed correct. Every item must be verified. If something's wrong, they go around and try again. ATC's landing checklist works the same way -- every required validation must pass, or the craft goes around.

## Checklist Architecture

The checklist system has three layers, all implemented in `@airtrafficcontrol/checklist`:

### Templates (RULE-CHKL-1)

A `ChecklistTemplate` is a named, ordered list of `ChecklistItemDef` entries. Each item has:

| Field         | Type                               | Description                                           |
| ------------- | ---------------------------------- | ----------------------------------------------------- |
| `name`        | `string`                           | Unique within the template                            |
| `description` | `string?`                          | Returned to pilots on failure for remediation context |
| `severity`    | `"required"` or `"advisory"`       | Required failures block; advisory failures do not     |
| `executor`    | `ShellExecutor \| McpToolExecutor` | How to run the check                                  |

Templates are managed through an in-memory registry (`createTemplateRegistry()`).

### Bindings (RULE-CHKL-2)

A `ChecklistBinding` links a template to a `LifecycleEvent` and a craft category. The wildcard category `"*"` matches all crafts. A craft inherits all bindings matching its category.

Bindings are managed through `createBindingRegistry()`, which supports lookup by event and category.

### Overrides (RULE-CHKL-3)

A `CraftChecklistOverride` lets individual crafts modify inherited bindings:

- Add items (appended after template items per RULE-CHKL-7).
- Remove items by name.
- Disable a template entirely for a specific event.

Overrides are managed through `createOverrideStore()`.

### Resolution

`resolveChecklist()` takes a craft callsign, category, event, and the three registries, then returns the final ordered list of items ready for execution. It applies bindings, fetches templates, and merges overrides.

## Default Checks

The default landing template (`DEFAULT_LANDING_TEMPLATE` in `defaults.ts`) provides:

| Check             | Severity | Command               |
| ----------------- | -------- | --------------------- |
| **Tests**         | Required | `pnpm run test`       |
| **Lint**          | Required | `pnpm run lint`       |
| **Documentation** | Advisory | `pnpm run docs:check` |
| **Build**         | Required | `pnpm run build`      |

Note that Documentation is **advisory** -- its failure is logged but does not block landing.

## How It Works

### Core Package (`@airtrafficcontrol/checklist`)

`runChecklist(input)` accepts a `RunChecklistInput` with the checklist name, lifecycle event, craft callsign, attempt number, items, and an optional MCP handler. It:

1. Executes each item sequentially in order (RULE-CHKL-7).
2. Supports two executor types: `shell` (runs a command, pass/fail on exit code) and `mcp-tool` (invokes an MCP tool).
3. Aggregates results into a `ChecklistRunResult` with per-item detail.
4. The overall result passes if no **required** items failed. Advisory failures are included but do not affect the outcome (RULE-CHKL-4).

### Daemon Package (`@airtrafficcontrol/daemon`)

The daemon has its own shell-based checklist runner (`checklist/runner.ts`) and a REST route:

**`POST /api/v1/projects/:name/crafts/:callsign/checklist`**

1. Validates the craft is in `InFlight` or `GoAround` status.
2. Transitions to `LandingChecklist` before running.
3. Loads project metadata for the checklist configuration.
4. Runs the checklist in the craft's worktree directory.
5. On success: transitions to `ClearedToLand`. On failure: transitions to `GoAround`.

:::caution Implementation gap
The daemon's checklist route does **not** verify that the calling pilot holds controls (RULE-LCHK-1 in the old rules, now expected to be enforced at the API layer). The core `runChecklist()` also accepts no pilot/craft context for authorization. This is a known gap.
:::

:::caution Implementation gap
The daemon runner stops on the **first failure** (early exit), while the core `runChecklist()` runs all items and aggregates results. The two runners have different behaviors.
:::

## The Go-Around Loop

A go-around is not a failure -- it is a normal part of the process. The pilot:

1. Reviews which checklist items failed.
2. Fixes the issues (failing tests, lint errors, missing docs, build errors).
3. Records a `GoAround` entry in the [black box](/docs/concepts/black-box).
4. Re-enters the LandingChecklist state and runs the checks again.

This loop can repeat as many times as needed. However, if the pilot cannot resolve the issues after repeated attempts, the captain may [declare an emergency](/docs/protocols/emergency-declaration).

## Lifecycle Events

The checklist system is not limited to landing. The `LifecycleEvent` enum defines hookable moments across the craft lifecycle (RULE-CHKL-8):

| Event                    | When it fires                            |
| ------------------------ | ---------------------------------------- |
| `before:takeoff`         | Before Taxiing to InFlight               |
| `after:takeoff`          | After Taxiing to InFlight completes      |
| `before:vector-complete` | Before `reportVector()` executes         |
| `after:vector-complete`  | After vector report is recorded          |
| `before:landing-check`   | Before LandingChecklist to ClearedToLand |
| `after:landing-check`    | After landing check passes               |
| `before:go-around`       | Before GoAround to LandingChecklist      |
| `after:go-around`        | After go-around re-attempt begins        |
| `before:emergency`       | Before GoAround to Emergency             |
| `after:emergency`        | After emergency is declared              |
| `before:landing`         | Before ClearedToLand to Landed           |
| `after:landing`          | After branch is merged                   |

For **before-events**, required item failure blocks the transition. For **after-events**, all results are informational (RULE-CHKL-4).

## Rules

- **RULE-CHKL-1:** A checklist template is a named, ordered list of items. Each item has a name, executor (shell command or MCP tool reference), severity (`required` or `advisory`), and optional failure description.
- **RULE-CHKL-2:** Templates are bound to lifecycle events and craft categories. The wildcard `"*"` matches all crafts.
- **RULE-CHKL-3:** Individual crafts may override inherited bindings: add items, remove items by name, or disable a template entirely.
- **RULE-CHKL-4:** For before-events, required item failure blocks the transition. Advisory failures are logged but do not block. For after-events, no failures block.
- **RULE-CHKL-5:** Every checklist execution must be recorded as a `ChecklistRun` entry in the black box with full metadata.
- **RULE-CHKL-6:** On completion, a system notification must be posted to the intercom with the outcome and a reference to the black box entry.
- **RULE-CHKL-7:** Items execute sequentially in template order. Override-added items are appended after template items.
- **RULE-CHKL-8:** The lifecycle event enum is extensible. Adding a new event requires only a new enum value and wiring.

## Example

```
Landing Checklist for craft feat-auth-flow:

  ✅ Tests      — 142 passed, 0 failed           (required)
  ❌ Lint       — 3 errors in src/auth/callback.ts (required)
  ✅ Docs       — JSDoc present on all exports     (advisory)
  ✅ Build      — tsc --build succeeded            (required)

Result: FAIL → Go-around initiated
  Pilot fixing: lint errors in callback.ts (unused imports, missing semicolons)
```

## Related Concepts

- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) -- LandingChecklist, GoAround, and ClearedToLand states
- [Tower](/docs/concepts/tower) -- grants clearance after checklist passes
- [Tower Merge Protocol](/docs/protocols/tower-merge-protocol) -- what happens after clearance
- [Emergency Declaration](/docs/protocols/emergency-declaration) -- when go-arounds cannot fix the problem
