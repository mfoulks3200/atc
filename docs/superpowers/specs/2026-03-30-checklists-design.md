# Checklists — Design Specification

**Date:** 2026-03-30
**Status:** Draft
**Scope:** Configurable checklist system with lifecycle event triggers, craft-specific overrides, and web UI management

## 1. Overview

Checklists are ordered lists of validation tasks that run automatically at lifecycle events. They extend the existing landing checklist concept into a general-purpose gate/observation system that can be bound to any lifecycle transition.

### Design Principles

- **Template-based with per-craft overrides** — Reusable templates are bound to craft categories and events; individual crafts can add, remove, or disable items.
- **Event-driven** — Checklists trigger on before/after lifecycle events. Before-events gate transitions; after-events are observational.
- **Full audit trail** — Every checklist execution is recorded in the black box with complete metadata. Lightweight notifications go to the intercom.
- **Extensible events** — Adding a new lifecycle event requires only a new enum value and wiring it to the relevant transition.

## 2. Data Model

### 2.1 Lifecycle Events

A string enum representing hookable moments in the craft lifecycle:

| Event                    | Fires When                              | Type   |
| ------------------------ | --------------------------------------- | ------ |
| `before:takeoff`         | `Taxiing → InFlight`                    | Before |
| `after:takeoff`          | After `Taxiing → InFlight` completes    | After  |
| `before:vector-complete` | `reportVector()` called                 | Before |
| `after:vector-complete`  | After vector report is recorded         | After  |
| `before:landing-check`   | `LandingChecklist → ClearedToLand`      | Before |
| `after:landing-check`    | After landing check passes              | After  |
| `before:go-around`       | `GoAround → LandingChecklist`           | Before |
| `after:go-around`        | After go-around re-attempt begins       | After  |
| `before:emergency`       | `GoAround → Emergency`                  | Before |
| `after:emergency`        | After emergency is declared             | After  |
| `before:landing`         | `ClearedToLand → Landed`               | Before |
| `after:landing`          | After branch is merged                  | After  |

The enum is designed to be extended by adding new values without structural changes.

### 2.2 Checklist Item

| Field       | Type                                | Required | Description                                              |
| ----------- | ----------------------------------- | -------- | -------------------------------------------------------- |
| name        | `string`                            | Yes      | Unique within template. Display name for the item.       |
| description | `string`                            | No       | Returned to agents on failure to provide remediation context. |
| severity    | `"required" \| "advisory"`          | Yes      | Required items block before-event transitions; advisory items log warnings. |
| executor    | `ShellExecutor \| McpToolExecutor`  | Yes      | How to run the check.                                    |

#### Executor Types

**ShellExecutor:**

| Field   | Type     | Description                                    |
| ------- | -------- | ---------------------------------------------- |
| type    | `"shell"` | Discriminant.                                 |
| command | `string` | Shell command to execute. Pass/fail on exit code (0 = pass). |

**McpToolExecutor:**

| Field  | Type                       | Description                        |
| ------ | -------------------------- | ---------------------------------- |
| type   | `"mcp-tool"`               | Discriminant.                      |
| tool   | `string`                   | MCP tool name to invoke.           |
| params | `Record<string, unknown>`  | Parameters to pass to the tool.    |

### 2.3 Checklist Template

| Field       | Type              | Required | Description                              |
| ----------- | ----------------- | -------- | ---------------------------------------- |
| id          | `string`          | Yes      | UUID. Immutable after creation.          |
| name        | `string`          | Yes      | Human-readable template name.            |
| description | `string`          | No       | Purpose of this checklist.               |
| items       | `ChecklistItem[]` | Yes      | Ordered list of items. Executed sequentially. |

### 2.4 Checklist Binding

Links a template to a lifecycle event for a craft category.

| Field         | Type             | Required | Description                                             |
| ------------- | ---------------- | -------- | ------------------------------------------------------- |
| templateId    | `string`         | Yes      | References a `ChecklistTemplate.id`.                    |
| event         | `LifecycleEvent` | Yes      | The lifecycle event that triggers this checklist.       |
| craftCategory | `string`         | Yes      | Craft category this applies to. `"*"` matches all categories. |

### 2.5 Craft Checklist Override

Per-craft modifications to inherited template bindings. Each override targets a specific template binding (identified by templateId + event).

| Field           | Type              | Required | Description                                       |
| --------------- | ----------------- | -------- | ------------------------------------------------- |
| craftCallsign   | `string`          | Yes      | The craft this override applies to.               |
| templateId      | `string`          | Yes      | The template binding being overridden.            |
| event           | `LifecycleEvent`  | Yes      | The event being overridden.                       |
| addItems        | `ChecklistItem[]` | No       | Items appended after template items.              |
| removeItems     | `string[]`        | No       | Item names to skip from the template.             |
| disableTemplate | `boolean`         | No       | If true, the template is not run for this craft.  |

**Multiple bindings per event:** When multiple templates are bound to the same event and craft category, all are resolved and executed in binding creation order. Each template's items run as a group; overrides apply per-template.

### 2.6 Checklist Run Result

Recorded in the black box after every checklist execution.

| Field         | Type                     | Required | Description                                        |
| ------------- | ------------------------ | -------- | -------------------------------------------------- |
| checklistName | `string`                 | Yes      | Template name that was executed.                   |
| event         | `LifecycleEvent`         | Yes      | The event that triggered the run.                  |
| craftCallsign | `string`                 | Yes      | The craft this ran against.                        |
| attempt       | `number`                 | Yes      | Attempt number (1-indexed, increments on re-runs for the same event). |
| timestamp     | `string` (ISO 8601)      | Yes      | When the run completed.                            |
| passed        | `boolean`                | Yes      | True if no required items failed.                  |
| items         | `ChecklistItemResult[]`  | Yes      | Per-item results.                                  |

#### Checklist Item Result

| Field      | Type                       | Required | Description                                     |
| ---------- | -------------------------- | -------- | ----------------------------------------------- |
| name       | `string`                   | Yes      | Item name.                                      |
| passed     | `boolean`                  | Yes      | Whether this item passed.                       |
| severity   | `"required" \| "advisory"` | Yes      | Severity at time of execution.                  |
| message    | `string`                   | No       | Failure description (from item definition).     |
| output     | `string`                   | No       | Captured stdout/stderr (capped at 500 lines).   |
| durationMs | `number`                   | Yes      | Execution time in milliseconds.                 |

## 3. Architecture

### 3.1 Package Changes

The existing `@atc/checklist` package is extended in place. New types are added to `@atc/types`.

```
packages/types/src/
  checklist.ts          — ChecklistItem, Template, Binding, Override, Result types
  events.ts             — LifecycleEvent enum

packages/checklist/src/
  types.ts              — (existing, replaced by @atc/types re-exports)
  runner.ts             — (existing, expanded) runs items, handles shell + MCP
  defaults.ts           — (existing, updated) default templates instead of bare items
  templates.ts          — template registry: CRUD, lookup by id
  bindings.ts           — bind templates to events + craft categories
  overrides.ts          — per-craft override resolution (merge template + overrides)
  resolve.ts            — given a craft + event, resolve the final item list
  executor/
    shell.ts            — run shell command, pass/fail on exit code
    mcp-tool.ts         — invoke MCP tool by name + params
```

### 3.2 Resolution Flow

When a lifecycle event fires:

1. Look up all `ChecklistBinding`s matching this `event` + craft's `category`.
2. For each binding, fetch the `ChecklistTemplate`.
3. Apply any `CraftChecklistOverride` for this craft + event (add items, remove items, or disable).
4. Flatten into a final ordered item list.
5. Execute items sequentially via the appropriate executor (shell or mcp-tool).
6. Collect `ChecklistRunResult`.

### 3.3 Integration with `@atc/core`

- `transitionCraft()` in `lifecycle.ts` gains a hook point: before executing a transition, it calls `resolveAndRunChecklist(craft, event)`.
- `reportVector()` in `flight-plan.ts` gets the same hook for `before:vector-complete` / `after:vector-complete`.

### 3.4 Before-Event Behavior

- Required item failure blocks the transition. The `ChecklistRunResult` is returned to the caller with failure details.
- Advisory item failure is included in the result but does not block.
- The full result is recorded as a `ChecklistRun` black box entry.
- A lightweight intercom notification is posted (see 3.6).

### 3.5 After-Event Behavior

- Runs after the transition completes. The transition is never blocked.
- All failures (required or advisory) are informational only.
- The full result is recorded as a `ChecklistRun` black box entry.
- A lightweight intercom notification is posted (see 3.6).

### 3.6 Black Box and Intercom Integration

**Black Box:** A new `BlackBoxEntryType` value `ChecklistRun` is added. The entry's content contains the full `ChecklistRunResult` with all metadata — event, attempt number, per-item results (name, passed, severity, message, output, duration), and overall outcome.

**Intercom:** On checklist completion, a system-generated notification is posted to the craft's intercom. This is a new intercom message variant distinct from pilot-to-pilot messages. It carries:

- Checklist name
- Event that triggered it
- Outcome (passed / failed / advisory-only)
- Reference to the black box entry

Agents receive this lightweight notification and can use a tool call to fetch the full `ChecklistRunResult` from the black box for detailed context.

## 4. Web UI

### 4.1 Template Builder

**List View:** Displays all checklist templates with name, item count (split by severity), bound events, and bound categories as tags.

**Item Editor:** Expanded view for editing a template's items:

- Drag-to-reorder items
- Per-item fields: name, executor type toggle (Shell / MCP Tool), command or tool+params input, severity toggle (required/advisory), failure description
- Add/remove items
- Save/cancel actions

### 4.2 Event Assignment

A timeline view showing all lifecycle events for a selected craft category. Each event slot either shows an assigned template (with item count) or a "+ Assign checklist template..." placeholder.

- Category filter pills at top (All, feature, hotfix, refactor, etc.)
- Events displayed chronologically in lifecycle order
- Assigned templates can be unlinked
- Unassigned events show empty slots that can be populated

### 4.3 Run Results

Displayed on the craft detail page within the flight strip / craft detail view.

**Attempt Switcher:** Numbered pills (1, 2, 3...) let users switch between attempts for the same event. Shows "N failed attempts" count on the right side.

**Item Results:** Each item displayed as a row with:

- Expand/collapse toggle (triangle indicator)
- Pass/fail icon
- Item name and severity badge
- `BLOCKED` tag on required failures
- Prior failure count badge (right-aligned, e.g., "3 consecutive failures", "1 prior failure")
- Duration

**Expanded Item View:**

- Description (remediation context shown to agents)
- Command or MCP tool that was executed
- Full stdout/stderr output in a scrollable terminal-style box (capped at 500 lines)
- Failure history showing each prior attempt's failure with summary snippet and timestamp (clickable to drill into full output)

**Expand/Collapse Behavior:**

- Failed items (required and advisory) auto-expand so problems are immediately visible
- Passed items start collapsed; click to expand and see full output

## 5. Specification Rules

### New Rules (RULE-CHKL-*)

- **RULE-CHKL-1:** A checklist template is a named, ordered list of items. Each item has a name, executor (shell command or MCP tool reference), severity (`required` or `advisory`), and optional failure description.
- **RULE-CHKL-2:** Templates are bound to lifecycle events and craft categories. A craft inherits all bindings matching its category. The wildcard category `"*"` matches all crafts.
- **RULE-CHKL-3:** Individual crafts MAY override inherited bindings: add items, remove items by name, or disable a template entirely for a specific event.
- **RULE-CHKL-4:** For before-events, required item failure MUST block the transition. Advisory failures MUST be logged but MUST NOT block. For after-events, no failures block; all results are informational.
- **RULE-CHKL-5:** Every checklist execution MUST be recorded as a `ChecklistRun` entry in the craft's black box with full metadata: event, attempt number, per-item results (name, passed, severity, message, output, duration), and overall outcome.
- **RULE-CHKL-6:** On checklist completion, a system-generated notification MUST be posted to the craft's intercom with the outcome and a reference to the black box entry. Agents retrieve full details via tool call.
- **RULE-CHKL-7:** Checklist items MUST execute sequentially in template order. Override-added items are appended after template items.
- **RULE-CHKL-8:** The `LifecycleEvent` enum is extensible. Adding a new event requires only a new enum value and wiring it to the relevant transition or action.

### Updated Rules

- **RULE-LCHK-1 through RULE-LCHK-4** — Replaced by RULE-CHKL-1 through RULE-CHKL-8. The general checklist system subsumes the landing-specific checklist. The `before:landing-check` event replaces the hardcoded landing checklist phase. Default templates (Tests, Lint, Documentation, Build) are provided as a built-in `before:landing-check` template.
- **RULE-LIFE-5** — Updated: `LandingChecklist → ClearedToLand` requires all **required** checklist items to pass (not all items; advisory failures are permitted).

### New Domain Model Additions

- **`BlackBoxEntryType.ChecklistRun`** — New entry type for checklist execution results.
- **`LifecycleEvent` enum** — New enum in `@atc/types` defining all hookable lifecycle moments.
- **System intercom notification** — New intercom message variant for system-generated notifications, distinct from pilot-to-pilot messages.

## 6. Storage

This spec does not prescribe a specific persistence layer. Templates, bindings, and overrides are defined as interfaces. The web API layer will need a store implementation, but that is an implementation concern for the planning phase.

## 7. Out of Scope

- Parallel item execution (items always run sequentially)
- Checklist item dependencies (items are independent)
- Conditional items (items always run; use severity to control blocking)
- Checklist versioning/history (templates are mutable; black box entries capture the state at execution time)
