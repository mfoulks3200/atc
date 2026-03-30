# Checklists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a configurable checklist system that gates lifecycle transitions, records results in the black box, notifies via intercom, and provides a web UI for template management.

**Architecture:** Extend `@atc/types` with checklist and lifecycle event types. Expand `@atc/checklist` with template registry, binding resolution, shell/MCP executors, and override merging. Hook into `@atc/core` lifecycle transitions. Add web UI components for template CRUD, event assignment, and run results.

**Tech Stack:** TypeScript (ES2022, Node16 modules, strict), Vitest, React 19, TanStack React Query, Tailwind CSS 4

---

## File Structure

### `@atc/types` — New files

| File | Responsibility |
|------|---------------|
| `packages/types/src/checklist.ts` | All checklist type definitions: `ChecklistItemSeverity`, `ShellExecutor`, `McpToolExecutor`, `ChecklistExecutor`, `ChecklistItemDef`, `ChecklistTemplate`, `ChecklistBinding`, `CraftChecklistOverride`, `ChecklistItemResult`, `ChecklistRunResult` |
| `packages/types/src/events.ts` | `LifecycleEvent` enum with all before/after event values |

### `@atc/types` — Modified files

| File | Change |
|------|--------|
| `packages/types/src/enums.ts` | Add `ChecklistRun` to `BlackBoxEntryType` |
| `packages/types/src/entities.ts` | Add `SystemNotification` interface for intercom |
| `packages/types/src/index.ts` | Re-export new types |

### `@atc/checklist` — New files

| File | Responsibility |
|------|---------------|
| `packages/checklist/src/executor/shell.ts` | Execute shell commands, capture stdout/stderr, return pass/fail on exit code |
| `packages/checklist/src/executor/mcp-tool.ts` | Execute MCP tool calls, return pass/fail on tool result |
| `packages/checklist/src/templates.ts` | In-memory template registry: create, get, list, delete |
| `packages/checklist/src/bindings.ts` | In-memory binding registry: create, get by event+category, delete |
| `packages/checklist/src/overrides.ts` | In-memory override store: set, get by callsign+event |
| `packages/checklist/src/resolve.ts` | Given craft+event, resolve final item list from templates+bindings+overrides |
| `packages/checklist/src/executor/shell.test.ts` | Tests for shell executor |
| `packages/checklist/src/executor/mcp-tool.test.ts` | Tests for MCP tool executor |
| `packages/checklist/src/templates.test.ts` | Tests for template registry |
| `packages/checklist/src/bindings.test.ts` | Tests for binding registry |
| `packages/checklist/src/overrides.test.ts` | Tests for override store |
| `packages/checklist/src/resolve.test.ts` | Tests for resolution logic |

### `@atc/checklist` — Modified files

| File | Change |
|------|--------|
| `packages/checklist/src/types.ts` | Replace old types with re-exports from `@atc/types` |
| `packages/checklist/src/runner.ts` | Rewrite to use new `ChecklistItemDef` with executors and severity; produce `ChecklistRunResult` |
| `packages/checklist/src/runner.test.ts` | Rewrite tests for new runner interface |
| `packages/checklist/src/defaults.ts` | Return a `ChecklistTemplate` with severity-tagged items |
| `packages/checklist/src/defaults.test.ts` | Update for new template structure |
| `packages/checklist/src/index.ts` | Re-export all new modules |

### `@atc/core` — Modified files

| File | Change |
|------|--------|
| `packages/core/src/lifecycle.ts` | Add optional checklist hook to `transitionCraft` |
| `packages/core/src/lifecycle.test.ts` | Add tests for checklist integration |
| `packages/core/src/flight-plan.ts` | Add optional checklist hook to `reportVector` |
| `packages/core/src/flight-plan.test.ts` | Add tests for vector checklist integration |

### `@atc/errors` — Modified files

| File | Change |
|------|--------|
| `packages/errors/src/checklist.ts` | Update JSDoc to reference RULE-CHKL-* |

### `@atc/web` — New files

| File | Responsibility |
|------|---------------|
| `packages/web/src/types/checklist.ts` | Web-side type definitions for checklist API responses |
| `packages/web/src/components/base/checklist-item-row.tsx` | Expandable checklist item result row |
| `packages/web/src/components/base/checklist-run-card.tsx` | Checklist run result card with attempt switcher |
| `packages/web/src/components/base/checklist-template-row.tsx` | Template list item for template builder |
| `packages/web/src/components/base/checklist-item-editor.tsx` | Single item editor (name, executor, severity, description) |
| `packages/web/src/routes/checklists/index.tsx` | Template list page |
| `packages/web/src/routes/checklists/template.tsx` | Template editor page |
| `packages/web/src/routes/checklists/assignments.tsx` | Event assignment page |

### `@atc/web` — Modified files

| File | Change |
|------|--------|
| `packages/web/src/types/api.ts` | Add `ChecklistRun` to `BlackBoxEntryType`, add `SystemNotification` to intercom types, add checklist API types |
| `packages/web/src/hooks/use-api.ts` | Add hooks for checklist template/binding CRUD |
| `packages/web/src/lib/query-keys.ts` | Add checklist query keys |
| `packages/web/src/routes/crafts/detail.tsx` | Add checklist run results section |

---

## Task 1: Add `LifecycleEvent` enum to `@atc/types`

**Files:**
- Create: `packages/types/src/events.ts`
- Create: `packages/types/src/events.test.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/types/src/events.test.ts
import { describe, it, expect } from "vitest";
import { LifecycleEvent } from "./events.js";

describe("LifecycleEvent", () => {
  it("defines all before/after event pairs", () => {
    expect(LifecycleEvent.BeforeTakeoff).toBe("before:takeoff");
    expect(LifecycleEvent.AfterTakeoff).toBe("after:takeoff");
    expect(LifecycleEvent.BeforeVectorComplete).toBe("before:vector-complete");
    expect(LifecycleEvent.AfterVectorComplete).toBe("after:vector-complete");
    expect(LifecycleEvent.BeforeLandingCheck).toBe("before:landing-check");
    expect(LifecycleEvent.AfterLandingCheck).toBe("after:landing-check");
    expect(LifecycleEvent.BeforeGoAround).toBe("before:go-around");
    expect(LifecycleEvent.AfterGoAround).toBe("after:go-around");
    expect(LifecycleEvent.BeforeEmergency).toBe("before:emergency");
    expect(LifecycleEvent.AfterEmergency).toBe("after:emergency");
    expect(LifecycleEvent.BeforeLanding).toBe("before:landing");
    expect(LifecycleEvent.AfterLanding).toBe("after:landing");
  });

  it("has exactly 12 values", () => {
    const values = Object.values(LifecycleEvent);
    expect(values).toHaveLength(12);
  });

  it("all before events start with 'before:'", () => {
    const beforeEvents = Object.values(LifecycleEvent).filter((v) => v.startsWith("before:"));
    expect(beforeEvents).toHaveLength(6);
  });

  it("all after events start with 'after:'", () => {
    const afterEvents = Object.values(LifecycleEvent).filter((v) => v.startsWith("after:"));
    expect(afterEvents).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/types/src/events.test.ts`
Expected: FAIL — `./events.js` does not exist

- [ ] **Step 3: Write the implementation**

```typescript
// packages/types/src/events.ts
/**
 * Hookable moments in the craft lifecycle.
 *
 * Before-events fire before a transition and can gate it.
 * After-events fire after a transition completes and are observational.
 *
 * @see RULE-CHKL-8 — extensible by adding new enum values.
 */
export enum LifecycleEvent {
  /** Fires before Taxiing → InFlight. */
  BeforeTakeoff = "before:takeoff",
  /** Fires after Taxiing → InFlight completes. */
  AfterTakeoff = "after:takeoff",
  /** Fires before reportVector() executes. */
  BeforeVectorComplete = "before:vector-complete",
  /** Fires after vector report is recorded. */
  AfterVectorComplete = "after:vector-complete",
  /** Fires before LandingChecklist → ClearedToLand. */
  BeforeLandingCheck = "before:landing-check",
  /** Fires after landing check passes. */
  AfterLandingCheck = "after:landing-check",
  /** Fires before GoAround → LandingChecklist. */
  BeforeGoAround = "before:go-around",
  /** Fires after go-around re-attempt begins. */
  AfterGoAround = "after:go-around",
  /** Fires before GoAround → Emergency. */
  BeforeEmergency = "before:emergency",
  /** Fires after emergency is declared. */
  AfterEmergency = "after:emergency",
  /** Fires before ClearedToLand → Landed. */
  BeforeLanding = "before:landing",
  /** Fires after branch is merged. */
  AfterLanding = "after:landing",
}
```

- [ ] **Step 4: Update the index to export the new enum**

Add to `packages/types/src/index.ts`:

```typescript
export { LifecycleEvent } from "./events.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm run test -- packages/types/src/events.test.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/events.ts packages/types/src/events.test.ts packages/types/src/index.ts
git commit -m "feat(types): add LifecycleEvent enum (RULE-CHKL-8)"
```

---

## Task 2: Add `ChecklistRun` to `BlackBoxEntryType` and `SystemNotification` to entities

**Files:**
- Modify: `packages/types/src/enums.ts:65-78`
- Modify: `packages/types/src/entities.ts`
- Modify: `packages/types/src/enums.test.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/types/src/enums.test.ts` (in the `BlackBoxEntryType` describe block):

```typescript
it("includes ChecklistRun entry type (RULE-CHKL-5)", () => {
  expect(BlackBoxEntryType.ChecklistRun).toBe("ChecklistRun");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/types/src/enums.test.ts`
Expected: FAIL — `BlackBoxEntryType.ChecklistRun` is undefined

- [ ] **Step 3: Add `ChecklistRun` to the enum**

In `packages/types/src/enums.ts`, add after line 77 (`EmergencyDeclaration`):

```typescript
  /** A checklist was executed. Contains full ChecklistRunResult metadata. @see RULE-CHKL-5 */
  ChecklistRun = "ChecklistRun",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/types/src/enums.test.ts`
Expected: PASS

- [ ] **Step 5: Add `SystemNotification` interface to entities**

Add to `packages/types/src/entities.ts` after the `Craft` interface:

```typescript
/**
 * A system-generated notification posted to the intercom.
 * Distinct from pilot-to-pilot messages.
 * @see RULE-ICOM-6, RULE-CHKL-6
 */
export interface SystemNotification {
  /** System that generated the notification (e.g., "checklist"). */
  readonly source: string;
  /** Human-readable summary of the event. */
  readonly summary: string;
  /** Outcome of the event. */
  readonly outcome: "passed" | "failed" | "advisory-only";
  /** Reference to the black box entry with full details. */
  readonly blackBoxEntryIndex: number;
  /** When the notification was generated. */
  readonly timestamp: Date;
}
```

- [ ] **Step 6: Export `SystemNotification` from index**

Add to the type export block in `packages/types/src/index.ts`:

```typescript
export type { SystemNotification } from "./entities.js";
```

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/enums.ts packages/types/src/enums.test.ts packages/types/src/entities.ts packages/types/src/index.ts
git commit -m "feat(types): add ChecklistRun entry type and SystemNotification (RULE-CHKL-5, RULE-ICOM-6)"
```

---

## Task 3: Add checklist type definitions to `@atc/types`

**Files:**
- Create: `packages/types/src/checklist.ts`
- Create: `packages/types/src/checklist.test.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/types/src/checklist.test.ts
import { describe, it, expect } from "vitest";
import { ChecklistItemSeverity } from "./checklist.js";

describe("ChecklistItemSeverity", () => {
  it("defines required and advisory values", () => {
    expect(ChecklistItemSeverity.Required).toBe("required");
    expect(ChecklistItemSeverity.Advisory).toBe("advisory");
  });

  it("has exactly 2 values", () => {
    expect(Object.values(ChecklistItemSeverity)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/types/src/checklist.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the checklist types**

```typescript
// packages/types/src/checklist.ts
import type { LifecycleEvent } from "./events.js";

/**
 * Severity level for a checklist item.
 * @see RULE-CHKL-4
 */
export enum ChecklistItemSeverity {
  /** Failure blocks before-event transitions. */
  Required = "required",
  /** Failure is logged but does not block. */
  Advisory = "advisory",
}

/**
 * Executor that runs a shell command. Pass/fail on exit code (0 = pass).
 * @see RULE-CHKL-1
 */
export interface ShellExecutor {
  readonly type: "shell";
  readonly command: string;
}

/**
 * Executor that invokes an MCP tool by name with parameters.
 * @see RULE-CHKL-1
 */
export interface McpToolExecutor {
  readonly type: "mcp-tool";
  readonly tool: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Union of all executor types. @see RULE-CHKL-1 */
export type ChecklistExecutor = ShellExecutor | McpToolExecutor;

/**
 * A single checklist item definition within a template.
 * @see RULE-CHKL-1
 */
export interface ChecklistItemDef {
  /** Unique within template. Display name for the item. */
  readonly name: string;
  /** Returned to agents on failure for remediation context. */
  readonly description?: string;
  /** Required items block before-event transitions; advisory items log warnings. */
  readonly severity: ChecklistItemSeverity;
  /** How to run the check. */
  readonly executor: ChecklistExecutor;
}

/**
 * A reusable checklist template.
 * @see RULE-CHKL-1, RULE-CHKL-2
 */
export interface ChecklistTemplate {
  /** UUID. Immutable after creation. */
  readonly id: string;
  /** Human-readable template name. */
  readonly name: string;
  /** Purpose of this checklist. */
  readonly description?: string;
  /** Ordered list of items. Executed sequentially. @see RULE-CHKL-7 */
  readonly items: readonly ChecklistItemDef[];
}

/**
 * Links a template to a lifecycle event for a craft category.
 * @see RULE-CHKL-2
 */
export interface ChecklistBinding {
  /** References a ChecklistTemplate.id. */
  readonly templateId: string;
  /** The lifecycle event that triggers this checklist. */
  readonly event: LifecycleEvent;
  /** Craft category this applies to. "*" matches all categories. */
  readonly craftCategory: string;
}

/**
 * Per-craft modifications to inherited template bindings.
 * @see RULE-CHKL-3
 */
export interface CraftChecklistOverride {
  /** The craft this override applies to. */
  readonly craftCallsign: string;
  /** The template binding being overridden. */
  readonly templateId: string;
  /** The event being overridden. */
  readonly event: LifecycleEvent;
  /** Items appended after template items. */
  readonly addItems?: readonly ChecklistItemDef[];
  /** Item names to skip from the template. */
  readonly removeItems?: readonly string[];
  /** If true, the template is not run for this craft. */
  readonly disableTemplate?: boolean;
}

/**
 * Result of a single checklist item execution.
 * @see RULE-CHKL-5
 */
export interface ChecklistItemResult {
  /** Item name. */
  readonly name: string;
  /** Whether this item passed. */
  readonly passed: boolean;
  /** Severity at time of execution. */
  readonly severity: ChecklistItemSeverity;
  /** Failure description (from item definition). */
  readonly message?: string;
  /** Captured stdout/stderr (capped at 500 lines). */
  readonly output?: string;
  /** Execution time in milliseconds. */
  readonly durationMs: number;
}

/**
 * Aggregate result of running a checklist. Recorded in the black box.
 * @see RULE-CHKL-5
 */
export interface ChecklistRunResult {
  /** Template name that was executed. */
  readonly checklistName: string;
  /** The event that triggered the run. */
  readonly event: LifecycleEvent;
  /** The craft this ran against. */
  readonly craftCallsign: string;
  /** Attempt number (1-indexed). */
  readonly attempt: number;
  /** When the run completed. */
  readonly timestamp: string;
  /** True if no required items failed. */
  readonly passed: boolean;
  /** Per-item results. */
  readonly items: readonly ChecklistItemResult[];
}
```

- [ ] **Step 4: Export from index**

Add to `packages/types/src/index.ts`:

```typescript
export { ChecklistItemSeverity } from "./checklist.js";
export type {
  ShellExecutor,
  McpToolExecutor,
  ChecklistExecutor,
  ChecklistItemDef,
  ChecklistTemplate,
  ChecklistBinding,
  CraftChecklistOverride,
  ChecklistItemResult,
  ChecklistRunResult,
} from "./checklist.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm run test -- packages/types/src/checklist.test.ts`
Expected: PASS

- [ ] **Step 6: Run full types test suite**

Run: `pnpm run test -- packages/types/`
Expected: PASS — no regressions

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/checklist.ts packages/types/src/checklist.test.ts packages/types/src/index.ts
git commit -m "feat(types): add checklist type definitions (RULE-CHKL-1 through RULE-CHKL-7)"
```

---

## Task 4: Update `ChecklistError` JSDoc references

**Files:**
- Modify: `packages/errors/src/checklist.ts`

- [ ] **Step 1: Update the error class**

Replace `packages/errors/src/checklist.ts` with:

```typescript
import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-CHKL-* invariant is violated.
 * Covers checklist constraints: template validation,
 * binding resolution, item execution, and transition gating.
 *
 * @see RULE-CHKL-1 through RULE-CHKL-8
 */
export class ChecklistError extends AtcError {
  override readonly name: string = "ChecklistError";
}
```

- [ ] **Step 2: Run existing error tests**

Run: `pnpm run test -- packages/errors/`
Expected: PASS — no regressions

- [ ] **Step 3: Commit**

```bash
git add packages/errors/src/checklist.ts
git commit -m "docs(errors): update ChecklistError to reference RULE-CHKL-*"
```

---

## Task 5: Implement shell executor

**Files:**
- Create: `packages/checklist/src/executor/shell.ts`
- Create: `packages/checklist/src/executor/shell.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/checklist/src/executor/shell.test.ts
import { describe, it, expect } from "vitest";
import { executeShell } from "./shell.js";

describe("executeShell", () => {
  it("returns passed: true and captures stdout when command exits 0", async () => {
    const result = await executeShell("echo hello");

    expect(result.passed).toBe(true);
    expect(result.output).toContain("hello");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns passed: false when command exits non-zero", async () => {
    const result = await executeShell("exit 1");

    expect(result.passed).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("captures stderr in output", async () => {
    const result = await executeShell("echo error >&2 && exit 1");

    expect(result.passed).toBe(false);
    expect(result.output).toContain("error");
  });

  it("caps output at 500 lines", async () => {
    // Generate 600 lines of output
    const result = await executeShell("for i in $(seq 1 600); do echo line$i; done");

    expect(result.passed).toBe(true);
    const lines = result.output!.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeLessThanOrEqual(500);
  });

  it("returns passed: false when command does not exist", async () => {
    const result = await executeShell("nonexistent_command_xyz_123");

    expect(result.passed).toBe(false);
    expect(result.output).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/checklist/src/executor/shell.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/checklist/src/executor/shell.ts
import { exec } from "node:child_process";

const MAX_OUTPUT_LINES = 500;

/**
 * Result of executing a shell command.
 */
export interface ShellExecResult {
  readonly passed: boolean;
  readonly output: string;
  readonly durationMs: number;
}

/**
 * Executes a shell command and returns pass/fail based on exit code.
 *
 * Exit code 0 = pass, anything else = fail.
 * Captures combined stdout+stderr, capped at 500 lines.
 *
 * @param command - Shell command string to execute.
 * @returns Execution result with pass/fail, output, and duration.
 * @see RULE-CHKL-1
 */
export function executeShell(command: string): Promise<ShellExecResult> {
  const start = performance.now();

  return new Promise((resolve) => {
    exec(command, { shell: "/bin/sh" }, (error, stdout, stderr) => {
      const durationMs = Math.round(performance.now() - start);
      const combined = (stdout + stderr).trim();
      const lines = combined.split("\n");
      const output = lines.slice(-MAX_OUTPUT_LINES).join("\n");

      resolve({
        passed: error === null,
        output,
        durationMs,
      });
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/checklist/src/executor/shell.test.ts`
Expected: PASS — all 5 tests green

- [ ] **Step 5: Commit**

```bash
git add packages/checklist/src/executor/shell.ts packages/checklist/src/executor/shell.test.ts
git commit -m "feat(checklist): add shell executor (RULE-CHKL-1)"
```

---

## Task 6: Implement MCP tool executor

**Files:**
- Create: `packages/checklist/src/executor/mcp-tool.ts`
- Create: `packages/checklist/src/executor/mcp-tool.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/checklist/src/executor/mcp-tool.test.ts
import { describe, it, expect, vi } from "vitest";
import { executeMcpTool } from "./mcp-tool.js";
import type { McpToolHandler } from "./mcp-tool.js";

describe("executeMcpTool", () => {
  it("returns passed: true when handler returns passed: true", async () => {
    const handler: McpToolHandler = vi.fn().mockResolvedValue({
      passed: true,
      output: "all good",
    });

    const result = await executeMcpTool("check-docs", { threshold: 80 }, handler);

    expect(result.passed).toBe(true);
    expect(result.output).toBe("all good");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(handler).toHaveBeenCalledWith("check-docs", { threshold: 80 });
  });

  it("returns passed: false when handler returns passed: false", async () => {
    const handler: McpToolHandler = vi.fn().mockResolvedValue({
      passed: false,
      output: "coverage at 62%",
    });

    const result = await executeMcpTool("check-docs", { threshold: 80 }, handler);

    expect(result.passed).toBe(false);
    expect(result.output).toBe("coverage at 62%");
  });

  it("returns passed: false when handler throws", async () => {
    const handler: McpToolHandler = vi.fn().mockRejectedValue(new Error("tool not found"));

    const result = await executeMcpTool("nonexistent", {}, handler);

    expect(result.passed).toBe(false);
    expect(result.output).toContain("tool not found");
  });

  it("caps output at 500 lines", async () => {
    const longOutput = Array.from({ length: 600 }, (_, i) => `line${i + 1}`).join("\n");
    const handler: McpToolHandler = vi.fn().mockResolvedValue({
      passed: true,
      output: longOutput,
    });

    const result = await executeMcpTool("check", {}, handler);

    const lines = result.output!.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeLessThanOrEqual(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/checklist/src/executor/mcp-tool.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/checklist/src/executor/mcp-tool.ts

const MAX_OUTPUT_LINES = 500;

/**
 * Result of executing an MCP tool.
 */
export interface McpToolExecResult {
  readonly passed: boolean;
  readonly output: string;
  readonly durationMs: number;
}

/**
 * Handler function that invokes an MCP tool.
 * Injected by the caller to decouple from MCP transport.
 */
export type McpToolHandler = (
  tool: string,
  params: Readonly<Record<string, unknown>>,
) => Promise<{ passed: boolean; output: string }>;

/**
 * Executes an MCP tool via the provided handler and returns pass/fail.
 *
 * @param tool - MCP tool name.
 * @param params - Parameters to pass to the tool.
 * @param handler - Function that performs the actual MCP call.
 * @returns Execution result with pass/fail, output, and duration.
 * @see RULE-CHKL-1
 */
export async function executeMcpTool(
  tool: string,
  params: Readonly<Record<string, unknown>>,
  handler: McpToolHandler,
): Promise<McpToolExecResult> {
  const start = performance.now();

  try {
    const result = await handler(tool, params);
    const durationMs = Math.round(performance.now() - start);
    const lines = result.output.split("\n");
    const output = lines.slice(-MAX_OUTPUT_LINES).join("\n");

    return { passed: result.passed, output, durationMs };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    const message = error instanceof Error ? error.message : String(error);

    return { passed: false, output: message, durationMs };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/checklist/src/executor/mcp-tool.test.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add packages/checklist/src/executor/mcp-tool.ts packages/checklist/src/executor/mcp-tool.test.ts
git commit -m "feat(checklist): add MCP tool executor (RULE-CHKL-1)"
```

---

## Task 7: Implement template registry

**Files:**
- Create: `packages/checklist/src/templates.ts`
- Create: `packages/checklist/src/templates.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/checklist/src/templates.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTemplateRegistry } from "./templates.js";
import { ChecklistItemSeverity } from "@atc/types";
import type { ChecklistItemDef } from "@atc/types";

const testItem: ChecklistItemDef = {
  name: "Run Tests",
  severity: ChecklistItemSeverity.Required,
  executor: { type: "shell", command: "pnpm run test" },
};

describe("createTemplateRegistry", () => {
  let registry: ReturnType<typeof createTemplateRegistry>;

  beforeEach(() => {
    registry = createTemplateRegistry();
  });

  it("creates a template and returns it with an id", () => {
    const template = registry.create({ name: "Pre-Landing", items: [testItem] });

    expect(template.id).toBeDefined();
    expect(template.name).toBe("Pre-Landing");
    expect(template.items).toHaveLength(1);
    expect(template.items[0]!.name).toBe("Run Tests");
  });

  it("retrieves a template by id", () => {
    const created = registry.create({ name: "Pre-Landing", items: [testItem] });
    const fetched = registry.get(created.id);

    expect(fetched).toEqual(created);
  });

  it("returns undefined for unknown id", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("lists all templates", () => {
    registry.create({ name: "A", items: [testItem] });
    registry.create({ name: "B", items: [testItem] });

    expect(registry.list()).toHaveLength(2);
  });

  it("deletes a template by id", () => {
    const created = registry.create({ name: "A", items: [testItem] });
    const deleted = registry.delete(created.id);

    expect(deleted).toBe(true);
    expect(registry.get(created.id)).toBeUndefined();
    expect(registry.list()).toHaveLength(0);
  });

  it("returns false when deleting unknown id", () => {
    expect(registry.delete("nonexistent")).toBe(false);
  });

  it("updates a template", () => {
    const created = registry.create({ name: "A", items: [testItem] });
    const updated = registry.update(created.id, { name: "B" });

    expect(updated?.name).toBe("B");
    expect(updated?.items).toEqual(created.items);
    expect(registry.get(created.id)?.name).toBe("B");
  });

  it("returns undefined when updating unknown id", () => {
    expect(registry.update("nonexistent", { name: "B" })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/checklist/src/templates.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/checklist/src/templates.ts
import { randomUUID } from "node:crypto";
import type { ChecklistTemplate, ChecklistItemDef } from "@atc/types";

/**
 * Input for creating a new checklist template.
 */
export interface CreateTemplateInput {
  readonly name: string;
  readonly description?: string;
  readonly items: readonly ChecklistItemDef[];
}

/**
 * Input for updating an existing checklist template.
 */
export interface UpdateTemplateInput {
  readonly name?: string;
  readonly description?: string;
  readonly items?: readonly ChecklistItemDef[];
}

/**
 * Creates an in-memory checklist template registry.
 *
 * @returns Registry with CRUD operations for templates.
 * @see RULE-CHKL-1, RULE-CHKL-2
 */
export function createTemplateRegistry() {
  const templates = new Map<string, ChecklistTemplate>();

  return {
    create(input: CreateTemplateInput): ChecklistTemplate {
      const template: ChecklistTemplate = {
        id: randomUUID(),
        name: input.name,
        description: input.description,
        items: [...input.items],
      };
      templates.set(template.id, template);
      return template;
    },

    get(id: string): ChecklistTemplate | undefined {
      return templates.get(id);
    },

    list(): readonly ChecklistTemplate[] {
      return [...templates.values()];
    },

    update(id: string, input: UpdateTemplateInput): ChecklistTemplate | undefined {
      const existing = templates.get(id);
      if (!existing) return undefined;

      const updated: ChecklistTemplate = {
        ...existing,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.items !== undefined && { items: [...input.items] }),
      };
      templates.set(id, updated);
      return updated;
    },

    delete(id: string): boolean {
      return templates.delete(id);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/checklist/src/templates.test.ts`
Expected: PASS — all 8 tests green

- [ ] **Step 5: Commit**

```bash
git add packages/checklist/src/templates.ts packages/checklist/src/templates.test.ts
git commit -m "feat(checklist): add template registry (RULE-CHKL-1, RULE-CHKL-2)"
```

---

## Task 8: Implement binding registry

**Files:**
- Create: `packages/checklist/src/bindings.ts`
- Create: `packages/checklist/src/bindings.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/checklist/src/bindings.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createBindingRegistry } from "./bindings.js";
import { LifecycleEvent } from "@atc/types";

describe("createBindingRegistry", () => {
  let registry: ReturnType<typeof createBindingRegistry>;

  beforeEach(() => {
    registry = createBindingRegistry();
  });

  it("creates a binding", () => {
    const binding = registry.create({
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCategory: "feature",
    });

    expect(binding.templateId).toBe("tpl-1");
    expect(binding.event).toBe(LifecycleEvent.BeforeLandingCheck);
    expect(binding.craftCategory).toBe("feature");
  });

  it("finds bindings by event and category (exact match)", () => {
    registry.create({ templateId: "tpl-1", event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    registry.create({ templateId: "tpl-2", event: LifecycleEvent.BeforeLandingCheck, craftCategory: "hotfix" });
    registry.create({ templateId: "tpl-3", event: LifecycleEvent.BeforeTakeoff, craftCategory: "feature" });

    const results = registry.findByEventAndCategory(LifecycleEvent.BeforeLandingCheck, "feature");
    expect(results).toHaveLength(1);
    expect(results[0]!.templateId).toBe("tpl-1");
  });

  it("includes wildcard category bindings", () => {
    registry.create({ templateId: "tpl-1", event: LifecycleEvent.BeforeLandingCheck, craftCategory: "*" });
    registry.create({ templateId: "tpl-2", event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });

    const results = registry.findByEventAndCategory(LifecycleEvent.BeforeLandingCheck, "feature");
    expect(results).toHaveLength(2);
  });

  it("returns empty array when no bindings match", () => {
    const results = registry.findByEventAndCategory(LifecycleEvent.BeforeTakeoff, "feature");
    expect(results).toHaveLength(0);
  });

  it("lists all bindings", () => {
    registry.create({ templateId: "tpl-1", event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    registry.create({ templateId: "tpl-2", event: LifecycleEvent.BeforeTakeoff, craftCategory: "*" });

    expect(registry.list()).toHaveLength(2);
  });

  it("deletes a binding", () => {
    registry.create({ templateId: "tpl-1", event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    const deleted = registry.delete("tpl-1", LifecycleEvent.BeforeLandingCheck, "feature");

    expect(deleted).toBe(true);
    expect(registry.list()).toHaveLength(0);
  });

  it("returns false when deleting nonexistent binding", () => {
    expect(registry.delete("tpl-1", LifecycleEvent.BeforeTakeoff, "feature")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/checklist/src/bindings.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/checklist/src/bindings.ts
import type { ChecklistBinding } from "@atc/types";
import type { LifecycleEvent } from "@atc/types";

/**
 * Creates an in-memory checklist binding registry.
 *
 * @returns Registry with create, find, list, and delete operations.
 * @see RULE-CHKL-2
 */
export function createBindingRegistry() {
  const bindings: ChecklistBinding[] = [];

  return {
    create(input: ChecklistBinding): ChecklistBinding {
      bindings.push(input);
      return input;
    },

    findByEventAndCategory(event: LifecycleEvent, craftCategory: string): readonly ChecklistBinding[] {
      return bindings.filter(
        (b) => b.event === event && (b.craftCategory === craftCategory || b.craftCategory === "*"),
      );
    },

    list(): readonly ChecklistBinding[] {
      return [...bindings];
    },

    delete(templateId: string, event: LifecycleEvent, craftCategory: string): boolean {
      const index = bindings.findIndex(
        (b) => b.templateId === templateId && b.event === event && b.craftCategory === craftCategory,
      );
      if (index === -1) return false;
      bindings.splice(index, 1);
      return true;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/checklist/src/bindings.test.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add packages/checklist/src/bindings.ts packages/checklist/src/bindings.test.ts
git commit -m "feat(checklist): add binding registry (RULE-CHKL-2)"
```

---

## Task 9: Implement override store

**Files:**
- Create: `packages/checklist/src/overrides.ts`
- Create: `packages/checklist/src/overrides.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/checklist/src/overrides.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createOverrideStore } from "./overrides.js";
import { LifecycleEvent, ChecklistItemSeverity } from "@atc/types";
import type { CraftChecklistOverride } from "@atc/types";

describe("createOverrideStore", () => {
  let store: ReturnType<typeof createOverrideStore>;

  beforeEach(() => {
    store = createOverrideStore();
  });

  it("sets and retrieves an override", () => {
    const override: CraftChecklistOverride = {
      craftCallsign: "ATC-247",
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      addItems: [{ name: "Migration", severity: ChecklistItemSeverity.Required, executor: { type: "shell", command: "pnpm run migrate" } }],
    };
    store.set(override);

    const result = store.get("ATC-247", "tpl-1", LifecycleEvent.BeforeLandingCheck);
    expect(result).toEqual(override);
  });

  it("returns undefined for unknown override", () => {
    expect(store.get("ATC-247", "tpl-1", LifecycleEvent.BeforeTakeoff)).toBeUndefined();
  });

  it("overwrites existing override on set", () => {
    store.set({
      craftCallsign: "ATC-247",
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      disableTemplate: false,
    });
    store.set({
      craftCallsign: "ATC-247",
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      disableTemplate: true,
    });

    const result = store.get("ATC-247", "tpl-1", LifecycleEvent.BeforeLandingCheck);
    expect(result?.disableTemplate).toBe(true);
  });

  it("deletes an override", () => {
    store.set({
      craftCallsign: "ATC-247",
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
    });
    const deleted = store.delete("ATC-247", "tpl-1", LifecycleEvent.BeforeLandingCheck);

    expect(deleted).toBe(true);
    expect(store.get("ATC-247", "tpl-1", LifecycleEvent.BeforeLandingCheck)).toBeUndefined();
  });

  it("lists overrides for a craft", () => {
    store.set({ craftCallsign: "ATC-247", templateId: "tpl-1", event: LifecycleEvent.BeforeLandingCheck });
    store.set({ craftCallsign: "ATC-247", templateId: "tpl-2", event: LifecycleEvent.BeforeTakeoff });
    store.set({ craftCallsign: "ATC-300", templateId: "tpl-1", event: LifecycleEvent.BeforeLandingCheck });

    const results = store.listForCraft("ATC-247");
    expect(results).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/checklist/src/overrides.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/checklist/src/overrides.ts
import type { CraftChecklistOverride } from "@atc/types";
import type { LifecycleEvent } from "@atc/types";

/**
 * Creates an in-memory override store.
 *
 * @returns Store with set, get, delete, and list operations.
 * @see RULE-CHKL-3
 */
export function createOverrideStore() {
  const overrides = new Map<string, CraftChecklistOverride>();

  function key(callsign: string, templateId: string, event: LifecycleEvent): string {
    return `${callsign}:${templateId}:${event}`;
  }

  return {
    set(override: CraftChecklistOverride): void {
      overrides.set(key(override.craftCallsign, override.templateId, override.event), override);
    },

    get(callsign: string, templateId: string, event: LifecycleEvent): CraftChecklistOverride | undefined {
      return overrides.get(key(callsign, templateId, event));
    },

    delete(callsign: string, templateId: string, event: LifecycleEvent): boolean {
      return overrides.delete(key(callsign, templateId, event));
    },

    listForCraft(callsign: string): readonly CraftChecklistOverride[] {
      return [...overrides.values()].filter((o) => o.craftCallsign === callsign);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/checklist/src/overrides.test.ts`
Expected: PASS — all 5 tests green

- [ ] **Step 5: Commit**

```bash
git add packages/checklist/src/overrides.ts packages/checklist/src/overrides.test.ts
git commit -m "feat(checklist): add override store (RULE-CHKL-3)"
```

---

## Task 10: Implement checklist resolution

**Files:**
- Create: `packages/checklist/src/resolve.ts`
- Create: `packages/checklist/src/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/checklist/src/resolve.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { resolveChecklist } from "./resolve.js";
import { createTemplateRegistry } from "./templates.js";
import { createBindingRegistry } from "./bindings.js";
import { createOverrideStore } from "./overrides.js";
import { LifecycleEvent, ChecklistItemSeverity } from "@atc/types";
import type { ChecklistItemDef } from "@atc/types";

const testItem: ChecklistItemDef = {
  name: "Tests",
  severity: ChecklistItemSeverity.Required,
  executor: { type: "shell", command: "pnpm run test" },
};

const lintItem: ChecklistItemDef = {
  name: "Lint",
  severity: ChecklistItemSeverity.Required,
  executor: { type: "shell", command: "pnpm run lint" },
};

const docsItem: ChecklistItemDef = {
  name: "Docs",
  severity: ChecklistItemSeverity.Advisory,
  executor: { type: "shell", command: "pnpm run docs:check" },
};

describe("resolveChecklist", () => {
  let templates: ReturnType<typeof createTemplateRegistry>;
  let bindings: ReturnType<typeof createBindingRegistry>;
  let overrides: ReturnType<typeof createOverrideStore>;

  beforeEach(() => {
    templates = createTemplateRegistry();
    bindings = createBindingRegistry();
    overrides = createOverrideStore();
  });

  it("resolves items from a bound template", () => {
    const tpl = templates.create({ name: "Pre-Landing", items: [testItem, lintItem] });
    bindings.create({ templateId: tpl.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });

    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeLandingCheck,
      templates,
      bindings,
      overrides,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.templateName).toBe("Pre-Landing");
    expect(result[0]!.items).toHaveLength(2);
    expect(result[0]!.items.map((i) => i.name)).toEqual(["Tests", "Lint"]);
  });

  it("includes wildcard category bindings", () => {
    const tpl = templates.create({ name: "Universal", items: [testItem] });
    bindings.create({ templateId: tpl.id, event: LifecycleEvent.BeforeTakeoff, craftCategory: "*" });

    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "hotfix",
      event: LifecycleEvent.BeforeTakeoff,
      templates,
      bindings,
      overrides,
    });

    expect(result).toHaveLength(1);
  });

  it("returns empty array when no bindings match", () => {
    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeTakeoff,
      templates,
      bindings,
      overrides,
    });

    expect(result).toHaveLength(0);
  });

  it("applies override: adds items after template items", () => {
    const tpl = templates.create({ name: "Pre-Landing", items: [testItem] });
    bindings.create({ templateId: tpl.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    overrides.set({
      craftCallsign: "ATC-1",
      templateId: tpl.id,
      event: LifecycleEvent.BeforeLandingCheck,
      addItems: [docsItem],
    });

    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeLandingCheck,
      templates,
      bindings,
      overrides,
    });

    expect(result[0]!.items).toHaveLength(2);
    expect(result[0]!.items.map((i) => i.name)).toEqual(["Tests", "Docs"]);
  });

  it("applies override: removes items by name", () => {
    const tpl = templates.create({ name: "Pre-Landing", items: [testItem, lintItem] });
    bindings.create({ templateId: tpl.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    overrides.set({
      craftCallsign: "ATC-1",
      templateId: tpl.id,
      event: LifecycleEvent.BeforeLandingCheck,
      removeItems: ["Lint"],
    });

    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeLandingCheck,
      templates,
      bindings,
      overrides,
    });

    expect(result[0]!.items).toHaveLength(1);
    expect(result[0]!.items[0]!.name).toBe("Tests");
  });

  it("applies override: disables template entirely", () => {
    const tpl = templates.create({ name: "Pre-Landing", items: [testItem] });
    bindings.create({ templateId: tpl.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    overrides.set({
      craftCallsign: "ATC-1",
      templateId: tpl.id,
      event: LifecycleEvent.BeforeLandingCheck,
      disableTemplate: true,
    });

    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeLandingCheck,
      templates,
      bindings,
      overrides,
    });

    expect(result).toHaveLength(0);
  });

  it("handles multiple templates bound to same event", () => {
    const tpl1 = templates.create({ name: "Tests", items: [testItem] });
    const tpl2 = templates.create({ name: "Lint", items: [lintItem] });
    bindings.create({ templateId: tpl1.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });
    bindings.create({ templateId: tpl2.id, event: LifecycleEvent.BeforeLandingCheck, craftCategory: "feature" });

    const result = resolveChecklist({
      craftCallsign: "ATC-1",
      craftCategory: "feature",
      event: LifecycleEvent.BeforeLandingCheck,
      templates,
      bindings,
      overrides,
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.templateName).toBe("Tests");
    expect(result[1]!.templateName).toBe("Lint");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/checklist/src/resolve.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/checklist/src/resolve.ts
import type { ChecklistItemDef, LifecycleEvent } from "@atc/types";
import type { createTemplateRegistry } from "./templates.js";
import type { createBindingRegistry } from "./bindings.js";
import type { createOverrideStore } from "./overrides.js";

/**
 * A resolved checklist ready for execution.
 */
export interface ResolvedChecklist {
  readonly templateId: string;
  readonly templateName: string;
  readonly items: readonly ChecklistItemDef[];
}

/**
 * Input for checklist resolution.
 */
export interface ResolveInput {
  readonly craftCallsign: string;
  readonly craftCategory: string;
  readonly event: LifecycleEvent;
  readonly templates: ReturnType<typeof createTemplateRegistry>;
  readonly bindings: ReturnType<typeof createBindingRegistry>;
  readonly overrides: ReturnType<typeof createOverrideStore>;
}

/**
 * Resolves the final checklist item list for a craft and event.
 *
 * Looks up bindings, fetches templates, applies overrides, and returns
 * an ordered list of resolved checklists ready for execution.
 *
 * @param input - The craft, event, and registries to resolve against.
 * @returns Ordered list of resolved checklists. Empty if no bindings match.
 * @see RULE-CHKL-2, RULE-CHKL-3, RULE-CHKL-7
 */
export function resolveChecklist(input: ResolveInput): readonly ResolvedChecklist[] {
  const { craftCallsign, craftCategory, event, templates, bindings, overrides } = input;

  const matchedBindings = bindings.findByEventAndCategory(event, craftCategory);
  const resolved: ResolvedChecklist[] = [];

  for (const binding of matchedBindings) {
    const override = overrides.get(craftCallsign, binding.templateId, event);

    // Skip disabled templates
    if (override?.disableTemplate) continue;

    const template = templates.get(binding.templateId);
    if (!template) continue;

    // Start with template items
    let items = [...template.items];

    // Remove items by name
    if (override?.removeItems) {
      const removeSet = new Set(override.removeItems);
      items = items.filter((item) => !removeSet.has(item.name));
    }

    // Append added items
    if (override?.addItems) {
      items.push(...override.addItems);
    }

    resolved.push({
      templateId: template.id,
      templateName: template.name,
      items,
    });
  }

  return resolved;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/checklist/src/resolve.test.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add packages/checklist/src/resolve.ts packages/checklist/src/resolve.test.ts
git commit -m "feat(checklist): add checklist resolution (RULE-CHKL-2, RULE-CHKL-3, RULE-CHKL-7)"
```

---

## Task 11: Rewrite the checklist runner

**Files:**
- Modify: `packages/checklist/src/types.ts`
- Modify: `packages/checklist/src/runner.ts`
- Modify: `packages/checklist/src/runner.test.ts`

- [ ] **Step 1: Replace types.ts with re-exports**

Replace `packages/checklist/src/types.ts` with:

```typescript
// Re-export all checklist types from @atc/types.
// This file exists for backwards compatibility.
export type {
  ChecklistItemDef,
  ChecklistTemplate,
  ChecklistBinding,
  CraftChecklistOverride,
  ChecklistItemResult,
  ChecklistRunResult,
  ChecklistExecutor,
  ShellExecutor,
  McpToolExecutor,
} from "@atc/types";
export { ChecklistItemSeverity } from "@atc/types";
```

- [ ] **Step 2: Write the failing test for the new runner**

Replace `packages/checklist/src/runner.test.ts` with:

```typescript
// packages/checklist/src/runner.test.ts
import { describe, it, expect, vi } from "vitest";
import { runChecklist } from "./runner.js";
import { ChecklistItemSeverity, LifecycleEvent } from "@atc/types";
import type { ChecklistItemDef } from "@atc/types";
import type { McpToolHandler } from "./executor/mcp-tool.js";

const shellItem = (name: string, command: string, severity = ChecklistItemSeverity.Required): ChecklistItemDef => ({
  name,
  severity,
  executor: { type: "shell", command },
  description: `${name} failed`,
});

describe("runChecklist", () => {
  it("returns passed: true when all items pass", async () => {
    const result = await runChecklist({
      checklistName: "Pre-Landing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [shellItem("Echo", "echo ok")],
    });

    expect(result.passed).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.passed).toBe(true);
    expect(result.checklistName).toBe("Pre-Landing");
    expect(result.event).toBe(LifecycleEvent.BeforeLandingCheck);
    expect(result.craftCallsign).toBe("ATC-1");
    expect(result.attempt).toBe(1);
    expect(result.timestamp).toBeDefined();
  });

  it("returns passed: false when a required item fails (RULE-CHKL-4)", async () => {
    const result = await runChecklist({
      checklistName: "Pre-Landing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [
        shellItem("Pass", "echo ok"),
        shellItem("Fail", "exit 1"),
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.items[0]!.passed).toBe(true);
    expect(result.items[1]!.passed).toBe(false);
    expect(result.items[1]!.message).toBe("Fail failed");
  });

  it("returns passed: true when only advisory items fail (RULE-CHKL-4)", async () => {
    const result = await runChecklist({
      checklistName: "Pre-Landing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [
        shellItem("Required", "echo ok", ChecklistItemSeverity.Required),
        shellItem("Advisory", "exit 1", ChecklistItemSeverity.Advisory),
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.items[1]!.passed).toBe(false);
    expect(result.items[1]!.severity).toBe(ChecklistItemSeverity.Advisory);
  });

  it("runs items sequentially (RULE-CHKL-7)", async () => {
    const order: string[] = [];
    // Use shell commands that take slightly different times
    const result = await runChecklist({
      checklistName: "Sequential",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [
        shellItem("A", "echo A"),
        shellItem("B", "echo B"),
        shellItem("C", "echo C"),
      ],
    });

    expect(result.items.map((i) => i.name)).toEqual(["A", "B", "C"]);
  });

  it("includes durationMs for each item", async () => {
    const result = await runChecklist({
      checklistName: "Timing",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [shellItem("Echo", "echo ok")],
    });

    expect(result.items[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws ChecklistError when items array is empty", async () => {
    await expect(
      runChecklist({
        checklistName: "Empty",
        event: LifecycleEvent.BeforeLandingCheck,
        craftCallsign: "ATC-1",
        attempt: 1,
        items: [],
      }),
    ).rejects.toThrow("Checklist must contain at least one item");
  });

  it("handles MCP tool executor", async () => {
    const mcpHandler: McpToolHandler = vi.fn().mockResolvedValue({ passed: true, output: "ok" });
    const mcpItem: ChecklistItemDef = {
      name: "Check Docs",
      severity: ChecklistItemSeverity.Advisory,
      executor: { type: "mcp-tool", tool: "check-docs", params: { threshold: 80 } },
    };

    const result = await runChecklist({
      checklistName: "MCP",
      event: LifecycleEvent.BeforeLandingCheck,
      craftCallsign: "ATC-1",
      attempt: 1,
      items: [mcpItem],
      mcpHandler,
    });

    expect(result.passed).toBe(true);
    expect(mcpHandler).toHaveBeenCalledWith("check-docs", { threshold: 80 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm run test -- packages/checklist/src/runner.test.ts`
Expected: FAIL — new runner interface doesn't exist yet

- [ ] **Step 4: Rewrite the runner**

Replace `packages/checklist/src/runner.ts` with:

```typescript
// packages/checklist/src/runner.ts
import { ChecklistError } from "@atc/errors";
import { ChecklistItemSeverity } from "@atc/types";
import type { ChecklistItemDef, ChecklistItemResult, ChecklistRunResult, LifecycleEvent } from "@atc/types";
import { executeShell } from "./executor/shell.js";
import { executeMcpTool } from "./executor/mcp-tool.js";
import type { McpToolHandler } from "./executor/mcp-tool.js";

/**
 * Input for running a checklist.
 */
export interface RunChecklistInput {
  readonly checklistName: string;
  readonly event: LifecycleEvent;
  readonly craftCallsign: string;
  readonly attempt: number;
  readonly items: readonly ChecklistItemDef[];
  readonly mcpHandler?: McpToolHandler;
}

/**
 * Runs a checklist: executes all items sequentially and aggregates results.
 *
 * Pass/fail is determined by required items only. Advisory failures
 * are included in results but do not affect the overall outcome.
 *
 * @param input - Checklist execution parameters.
 * @returns Aggregate result with per-item detail.
 * @throws {ChecklistError} If items array is empty.
 * @see RULE-CHKL-4 — required failures block, advisory failures don't.
 * @see RULE-CHKL-7 — items execute sequentially in order.
 */
export async function runChecklist(input: RunChecklistInput): Promise<ChecklistRunResult> {
  const { checklistName, event, craftCallsign, attempt, items, mcpHandler } = input;

  if (items.length === 0) {
    throw new ChecklistError("Checklist must contain at least one item", "RULE-CHKL-4");
  }

  const results: ChecklistItemResult[] = [];

  for (const item of items) {
    let execResult: { passed: boolean; output: string; durationMs: number };

    if (item.executor.type === "shell") {
      execResult = await executeShell(item.executor.command);
    } else {
      if (!mcpHandler) {
        execResult = { passed: false, output: "No MCP handler provided", durationMs: 0 };
      } else {
        execResult = await executeMcpTool(item.executor.tool, item.executor.params, mcpHandler);
      }
    }

    results.push({
      name: item.name,
      passed: execResult.passed,
      severity: item.severity,
      message: execResult.passed ? undefined : item.description,
      output: execResult.output,
      durationMs: execResult.durationMs,
    });
  }

  const hasRequiredFailure = results.some(
    (r) => !r.passed && r.severity === ChecklistItemSeverity.Required,
  );

  return {
    checklistName,
    event,
    craftCallsign,
    attempt,
    timestamp: new Date().toISOString(),
    passed: !hasRequiredFailure,
    items: results,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm run test -- packages/checklist/src/runner.test.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 6: Commit**

```bash
git add packages/checklist/src/types.ts packages/checklist/src/runner.ts packages/checklist/src/runner.test.ts
git commit -m "feat(checklist): rewrite runner with severity and executors (RULE-CHKL-4, RULE-CHKL-7)"
```

---

## Task 12: Update defaults to return a `ChecklistTemplate`

**Files:**
- Modify: `packages/checklist/src/defaults.ts`
- Modify: `packages/checklist/src/defaults.test.ts`

- [ ] **Step 1: Write the failing test**

Replace `packages/checklist/src/defaults.test.ts` with:

```typescript
// packages/checklist/src/defaults.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_LANDING_TEMPLATE } from "./defaults.js";
import { ChecklistItemSeverity } from "@atc/types";

describe("DEFAULT_LANDING_TEMPLATE", () => {
  it("has a name and 4 items", () => {
    expect(DEFAULT_LANDING_TEMPLATE.name).toBe("Default Landing Checklist");
    expect(DEFAULT_LANDING_TEMPLATE.items).toHaveLength(4);
  });

  it("has Tests, Lint, Build as required and Documentation as advisory", () => {
    const names = DEFAULT_LANDING_TEMPLATE.items.map((i) => i.name);
    expect(names).toEqual(["Tests", "Lint", "Documentation", "Build"]);

    expect(DEFAULT_LANDING_TEMPLATE.items[0]!.severity).toBe(ChecklistItemSeverity.Required);
    expect(DEFAULT_LANDING_TEMPLATE.items[1]!.severity).toBe(ChecklistItemSeverity.Required);
    expect(DEFAULT_LANDING_TEMPLATE.items[2]!.severity).toBe(ChecklistItemSeverity.Advisory);
    expect(DEFAULT_LANDING_TEMPLATE.items[3]!.severity).toBe(ChecklistItemSeverity.Required);
  });

  it("all items use shell executors", () => {
    for (const item of DEFAULT_LANDING_TEMPLATE.items) {
      expect(item.executor.type).toBe("shell");
    }
  });

  it("has an id", () => {
    expect(DEFAULT_LANDING_TEMPLATE.id).toBeDefined();
    expect(DEFAULT_LANDING_TEMPLATE.id).toBe("default-landing-checklist");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/checklist/src/defaults.test.ts`
Expected: FAIL — `DEFAULT_LANDING_TEMPLATE` not exported

- [ ] **Step 3: Rewrite defaults**

Replace `packages/checklist/src/defaults.ts` with:

```typescript
// packages/checklist/src/defaults.ts
import { ChecklistItemSeverity } from "@atc/types";
import type { ChecklistTemplate } from "@atc/types";

/**
 * Default landing checklist template.
 *
 * Provides baseline validation for the `before:landing-check` event.
 * Projects should replace these placeholder commands with real ones.
 *
 * @see RULE-CHKL-1, RULE-CHKL-2
 */
export const DEFAULT_LANDING_TEMPLATE: ChecklistTemplate = {
  id: "default-landing-checklist",
  name: "Default Landing Checklist",
  description: "Built-in pre-landing validation checks.",
  items: [
    {
      name: "Tests",
      description: "All test suites must pass before landing.",
      severity: ChecklistItemSeverity.Required,
      executor: { type: "shell", command: "pnpm run test" },
    },
    {
      name: "Lint",
      description: "No lint errors allowed before landing.",
      severity: ChecklistItemSeverity.Required,
      executor: { type: "shell", command: "pnpm run lint" },
    },
    {
      name: "Documentation",
      description: "Required docs should be present and up to date.",
      severity: ChecklistItemSeverity.Advisory,
      executor: { type: "shell", command: "pnpm run docs:check" },
    },
    {
      name: "Build",
      description: "Project must build successfully before landing.",
      severity: ChecklistItemSeverity.Required,
      executor: { type: "shell", command: "pnpm run build" },
    },
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/checklist/src/defaults.test.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add packages/checklist/src/defaults.ts packages/checklist/src/defaults.test.ts
git commit -m "feat(checklist): update defaults to ChecklistTemplate with severity (RULE-CHKL-1)"
```

---

## Task 13: Update checklist package exports

**Files:**
- Modify: `packages/checklist/src/index.ts`

- [ ] **Step 1: Update exports**

Replace `packages/checklist/src/index.ts` with:

```typescript
// Types (re-exported from @atc/types via local types.ts)
export type {
  ChecklistItemDef,
  ChecklistTemplate,
  ChecklistBinding,
  CraftChecklistOverride,
  ChecklistItemResult,
  ChecklistRunResult,
  ChecklistExecutor,
  ShellExecutor,
  McpToolExecutor,
} from "./types.js";
export { ChecklistItemSeverity } from "./types.js";

// Runner
export { runChecklist } from "./runner.js";
export type { RunChecklistInput } from "./runner.js";

// Defaults
export { DEFAULT_LANDING_TEMPLATE } from "./defaults.js";

// Template registry
export { createTemplateRegistry } from "./templates.js";
export type { CreateTemplateInput, UpdateTemplateInput } from "./templates.js";

// Binding registry
export { createBindingRegistry } from "./bindings.js";

// Override store
export { createOverrideStore } from "./overrides.js";

// Resolution
export { resolveChecklist } from "./resolve.js";
export type { ResolvedChecklist, ResolveInput } from "./resolve.js";

// Executors
export { executeShell } from "./executor/shell.js";
export type { ShellExecResult } from "./executor/shell.js";
export { executeMcpTool } from "./executor/mcp-tool.js";
export type { McpToolExecResult, McpToolHandler } from "./executor/mcp-tool.js";
```

- [ ] **Step 2: Run full checklist test suite**

Run: `pnpm run test -- packages/checklist/`
Expected: PASS — all tests green

- [ ] **Step 3: Run build to ensure types compile**

Run: `pnpm run build`
Expected: PASS — no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add packages/checklist/src/index.ts
git commit -m "feat(checklist): update package exports for new checklist system"
```

---

## Task 14: Hook checklists into `@atc/core` lifecycle transitions

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `packages/core/src/lifecycle.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/lifecycle.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { transitionCraft, mapTransitionToEvents } from "./lifecycle.js";
import { CraftStatus } from "@atc/types";
import { LifecycleEvent } from "@atc/types";

describe("mapTransitionToEvents", () => {
  it("maps Taxiing -> InFlight to takeoff events", () => {
    const events = mapTransitionToEvents(CraftStatus.Taxiing, CraftStatus.InFlight);
    expect(events).toEqual({
      before: LifecycleEvent.BeforeTakeoff,
      after: LifecycleEvent.AfterTakeoff,
    });
  });

  it("maps InFlight -> LandingChecklist to landing-check events", () => {
    const events = mapTransitionToEvents(CraftStatus.InFlight, CraftStatus.LandingChecklist);
    expect(events).toEqual({
      before: LifecycleEvent.BeforeLandingCheck,
      after: LifecycleEvent.AfterLandingCheck,
    });
  });

  it("maps GoAround -> LandingChecklist to go-around events", () => {
    const events = mapTransitionToEvents(CraftStatus.GoAround, CraftStatus.LandingChecklist);
    expect(events).toEqual({
      before: LifecycleEvent.BeforeGoAround,
      after: LifecycleEvent.AfterGoAround,
    });
  });

  it("maps GoAround -> Emergency to emergency events", () => {
    const events = mapTransitionToEvents(CraftStatus.GoAround, CraftStatus.Emergency);
    expect(events).toEqual({
      before: LifecycleEvent.BeforeEmergency,
      after: LifecycleEvent.AfterEmergency,
    });
  });

  it("maps ClearedToLand -> Landed to landing events", () => {
    const events = mapTransitionToEvents(CraftStatus.ClearedToLand, CraftStatus.Landed);
    expect(events).toEqual({
      before: LifecycleEvent.BeforeLanding,
      after: LifecycleEvent.AfterLanding,
    });
  });

  it("returns undefined for transitions without event mappings", () => {
    // LandingChecklist -> ClearedToLand has no separate event mapping (it's the landing-check result)
    const events = mapTransitionToEvents(CraftStatus.LandingChecklist, CraftStatus.ClearedToLand);
    expect(events).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/core/src/lifecycle.test.ts`
Expected: FAIL — `mapTransitionToEvents` not exported

- [ ] **Step 3: Add event mapping to lifecycle.ts**

Add to `packages/core/src/lifecycle.ts` after the imports:

```typescript
import { LifecycleEvent } from "@atc/types";

/**
 * Maps a state transition to its before/after lifecycle events.
 *
 * Returns undefined for transitions that don't have associated events
 * (e.g., LandingChecklist -> ClearedToLand is the *result* of before:landing-check).
 *
 * @param from - Current craft status.
 * @param to - Target craft status.
 * @returns Before and after event pair, or undefined.
 * @see RULE-CHKL-8
 */
export function mapTransitionToEvents(
  from: CraftStatus,
  to: CraftStatus,
): { before: LifecycleEvent; after: LifecycleEvent } | undefined {
  if (from === CraftStatus.Taxiing && to === CraftStatus.InFlight) {
    return { before: LifecycleEvent.BeforeTakeoff, after: LifecycleEvent.AfterTakeoff };
  }
  if (from === CraftStatus.InFlight && to === CraftStatus.LandingChecklist) {
    return { before: LifecycleEvent.BeforeLandingCheck, after: LifecycleEvent.AfterLandingCheck };
  }
  if (from === CraftStatus.GoAround && to === CraftStatus.LandingChecklist) {
    return { before: LifecycleEvent.BeforeGoAround, after: LifecycleEvent.AfterGoAround };
  }
  if (from === CraftStatus.GoAround && to === CraftStatus.Emergency) {
    return { before: LifecycleEvent.BeforeEmergency, after: LifecycleEvent.AfterEmergency };
  }
  if (from === CraftStatus.ClearedToLand && to === CraftStatus.Landed) {
    return { before: LifecycleEvent.BeforeLanding, after: LifecycleEvent.AfterLanding };
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/core/src/lifecycle.test.ts`
Expected: PASS — new tests green, existing tests still pass

- [ ] **Step 5: Export from core index**

Add to `packages/core/src/index.ts`:

```typescript
export { mapTransitionToEvents } from "./lifecycle.js";
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/lifecycle.ts packages/core/src/lifecycle.test.ts packages/core/src/index.ts
git commit -m "feat(core): add lifecycle event mapping for checklist hooks (RULE-CHKL-8)"
```

---

## Task 15: Add checklist web types and API hooks

**Files:**
- Create: `packages/web/src/types/checklist.ts`
- Modify: `packages/web/src/types/api.ts`
- Modify: `packages/web/src/lib/query-keys.ts`
- Modify: `packages/web/src/hooks/use-api.ts`

- [ ] **Step 1: Create web-side checklist types**

```typescript
// packages/web/src/types/checklist.ts
export type ChecklistItemSeverity = "required" | "advisory";

export interface ShellExecutor {
  type: "shell";
  command: string;
}

export interface McpToolExecutor {
  type: "mcp-tool";
  tool: string;
  params: Record<string, unknown>;
}

export type ChecklistExecutor = ShellExecutor | McpToolExecutor;

export interface ChecklistItemDef {
  name: string;
  description?: string;
  severity: ChecklistItemSeverity;
  executor: ChecklistExecutor;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  description?: string;
  items: ChecklistItemDef[];
}

export interface ChecklistBinding {
  templateId: string;
  event: string;
  craftCategory: string;
}

export interface ChecklistItemResult {
  name: string;
  passed: boolean;
  severity: ChecklistItemSeverity;
  message?: string;
  output?: string;
  durationMs: number;
}

export interface ChecklistRunResult {
  checklistName: string;
  event: string;
  craftCallsign: string;
  attempt: number;
  timestamp: string;
  passed: boolean;
  items: ChecklistItemResult[];
}
```

- [ ] **Step 2: Update api.ts types**

Add `"ChecklistRun"` to the `BlackBoxEntryType` union in `packages/web/src/types/api.ts`:

```typescript
export type BlackBoxEntryType =
  | "Decision"
  | "VectorPassed"
  | "GoAround"
  | "Conflict"
  | "Observation"
  | "EmergencyDeclaration"
  | "ChecklistRun";
```

Add `SystemNotification` to `packages/web/src/types/api.ts`:

```typescript
export interface SystemNotification {
  source: string;
  summary: string;
  outcome: "passed" | "failed" | "advisory-only";
  blackBoxEntryIndex: number;
  timestamp: string;
}
```

- [ ] **Step 3: Add checklist query keys**

Add to `packages/web/src/lib/query-keys.ts`:

```typescript
  checklists: {
    templates: () => ["checklists", "templates"] as const,
    template: (id: string) => ["checklists", "templates", id] as const,
    bindings: () => ["checklists", "bindings"] as const,
    runs: (project: string, callsign: string) =>
      ["checklists", "runs", project, callsign] as const,
  },
```

- [ ] **Step 4: Add checklist API hooks**

Add to `packages/web/src/hooks/use-api.ts`:

```typescript
import type { ChecklistTemplate, ChecklistBinding, ChecklistRunResult } from "@/types/checklist";

export function useChecklistTemplates() {
  return useQuery({
    queryKey: queryKeys.checklists.templates(),
    queryFn: () => apiClient.get<ChecklistTemplate[]>("/api/v1/checklists/templates"),
  });
}

export function useChecklistTemplate(id: string) {
  return useQuery({
    queryKey: queryKeys.checklists.template(id),
    queryFn: () => apiClient.get<ChecklistTemplate>(`/api/v1/checklists/templates/${id}`),
  });
}

export function useChecklistBindings() {
  return useQuery({
    queryKey: queryKeys.checklists.bindings(),
    queryFn: () => apiClient.get<ChecklistBinding[]>("/api/v1/checklists/bindings"),
  });
}

export function useCraftChecklistRuns(project: string, callsign: string) {
  return useQuery({
    queryKey: queryKeys.checklists.runs(project, callsign),
    queryFn: () =>
      apiClient.get<ChecklistRunResult[]>(
        `/api/v1/projects/${project}/crafts/${callsign}/checklists`,
      ),
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/types/checklist.ts packages/web/src/types/api.ts packages/web/src/lib/query-keys.ts packages/web/src/hooks/use-api.ts
git commit -m "feat(web): add checklist types, query keys, and API hooks"
```

---

## Task 16: Build `ChecklistItemRow` component

**Files:**
- Create: `packages/web/src/components/base/checklist-item-row.tsx`

- [ ] **Step 1: Create the component**

```tsx
// packages/web/src/components/base/checklist-item-row.tsx
import { useState } from "react";
import type { ChecklistItemResult } from "@/types/checklist";

interface ChecklistItemRowProps {
  item: ChecklistItemResult;
  priorFailures: number;
}

export function ChecklistItemRow({ item, priorFailures }: ChecklistItemRowProps) {
  const isFailed = !item.passed;
  const [expanded, setExpanded] = useState(isFailed);

  const borderColor = isFailed
    ? item.severity === "required"
      ? "var(--accent-red, #ef4444)"
      : "var(--accent-yellow, #f59e0b)"
    : "var(--accent-green, #10b981)";

  const icon = isFailed
    ? item.severity === "required"
      ? "\u2717"
      : "\u26A0"
    : "\u2713";

  const iconColor = isFailed
    ? item.severity === "required"
      ? "var(--accent-red, #ef4444)"
      : "var(--accent-yellow, #f59e0b)"
    : "var(--accent-green, #10b981)";

  return (
    <div
      style={{ borderLeft: `2px solid ${borderColor}`, borderRadius: "0 4px 4px 0" }}
      className="mb-1.5"
    >
      <div
        className="flex cursor-pointer items-center justify-between px-3 py-2"
        onClick={() => setExpanded(!expanded)}
        style={{ background: isFailed ? "rgba(239,68,68,0.03)" : "rgba(16,185,129,0.03)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            {expanded ? "\u25BC" : "\u25B6"}
          </span>
          <span style={{ color: iconColor }}>{icon}</span>
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {item.name}
          </span>
          <span
            className="rounded px-1.5 text-[10px]"
            style={{
              background: item.severity === "required" ? "rgba(220,38,38,0.15)" : "rgba(245,158,11,0.15)",
              color: item.severity === "required" ? "var(--accent-red, #ef4444)" : "var(--accent-yellow, #f59e0b)",
            }}
          >
            {item.severity}
          </span>
          {isFailed && item.severity === "required" && (
            <span
              className="rounded px-1.5 text-[10px]"
              style={{ background: "rgba(239,68,68,0.2)", color: "var(--accent-red, #ef4444)" }}
            >
              BLOCKED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {priorFailures > 0 && (
            <span
              className="rounded px-1.5 text-[10px]"
              style={{ background: "var(--bg-elevated)", color: isFailed ? "var(--accent-red, #ef4444)" : "var(--accent-yellow, #f59e0b)" }}
            >
              {priorFailures} {priorFailures === 1 ? "prior failure" : isFailed ? "consecutive failures" : "prior failures"}
            </span>
          )}
          <span className="font-mono text-xs" style={{ color: "var(--text-dim)" }}>
            {item.durationMs < 1000 ? `${item.durationMs}ms` : `${(item.durationMs / 1000).toFixed(1)}s`}
          </span>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3" style={{ paddingLeft: "34px" }}>
          {item.message && (
            <div className="mb-2 rounded p-2.5" style={{ background: "var(--bg-elevated)" }}>
              <div className="mb-1 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                Description
              </div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{item.message}</div>
            </div>
          )}
          {item.output && (
            <div
              className="max-h-[200px] overflow-y-auto rounded border p-3 font-mono text-xs leading-relaxed"
              style={{
                background: "var(--bg-base, #0f172a)",
                borderColor: "var(--border)",
                color: "var(--text-muted)",
              }}
            >
              <div className="mb-2 font-sans text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                Output
              </div>
              <pre className="whitespace-pre-wrap">{item.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/base/checklist-item-row.tsx
git commit -m "feat(web): add ChecklistItemRow component"
```

---

## Task 17: Build `ChecklistRunCard` component

**Files:**
- Create: `packages/web/src/components/base/checklist-run-card.tsx`

- [ ] **Step 1: Create the component**

```tsx
// packages/web/src/components/base/checklist-run-card.tsx
import { useState } from "react";
import type { ChecklistRunResult } from "@/types/checklist";
import { ChecklistItemRow } from "./checklist-item-row";

interface ChecklistRunCardProps {
  /** All runs for this checklist+event, ordered by attempt. */
  runs: ChecklistRunResult[];
}

export function ChecklistRunCard({ runs }: ChecklistRunCardProps) {
  const maxAttempt = Math.max(...runs.map((r) => r.attempt));
  const [selectedAttempt, setSelectedAttempt] = useState(maxAttempt);

  const currentRun = runs.find((r) => r.attempt === selectedAttempt);
  if (!currentRun) return null;

  const failedAttempts = runs.filter((r) => !r.passed).length;

  // Compute prior failures per item
  function priorFailuresForItem(itemName: string): number {
    return runs
      .filter((r) => r.attempt < selectedAttempt)
      .reduce((count, r) => {
        const item = r.items.find((i) => i.name === itemName);
        return count + (item && !item.passed ? 1 : 0);
      }, 0);
  }

  return (
    <div className="rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
      {/* Attempt switcher */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            Attempt
          </span>
          <div className="flex gap-1">
            {runs.map((r) => (
              <button
                key={r.attempt}
                onClick={() => setSelectedAttempt(r.attempt)}
                className="rounded px-2.5 py-0.5 text-xs"
                style={{
                  background: r.attempt === selectedAttempt ? "var(--accent-blue, #3b82f6)" : "var(--bg-elevated)",
                  color: r.attempt === selectedAttempt ? "white" : "var(--text-dim)",
                  fontWeight: r.attempt === selectedAttempt ? 500 : 400,
                }}
              >
                {r.attempt}
              </button>
            ))}
          </div>
        </div>
        {failedAttempts > 0 && (
          <span className="text-xs" style={{ color: "var(--accent-red, #ef4444)" }}>
            {failedAttempts} failed {failedAttempts === 1 ? "attempt" : "attempts"}
          </span>
        )}
      </div>

      {/* Run header */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: currentRun.passed ? "var(--accent-green, #10b981)" : "var(--accent-red, #ef4444)", fontSize: "14px" }}>
            {currentRun.passed ? "\u2713" : "\u2717"}
          </span>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
            {currentRun.checklistName}
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            {currentRun.event}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
          Attempt {currentRun.attempt}
        </span>
      </div>

      {/* Item results */}
      <div className="ml-1">
        {currentRun.items.map((item) => (
          <ChecklistItemRow
            key={item.name}
            item={item}
            priorFailures={priorFailuresForItem(item.name)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/base/checklist-run-card.tsx
git commit -m "feat(web): add ChecklistRunCard component with attempt switcher"
```

---

## Task 18: Add checklist run results to craft detail page

**Files:**
- Modify: `packages/web/src/routes/crafts/detail.tsx`

- [ ] **Step 1: Add the checklist section**

Add import at top of `packages/web/src/routes/crafts/detail.tsx`:

```typescript
import { useCraftChecklistRuns } from "@/hooks/use-api";
import { ChecklistRunCard } from "@/components/base/checklist-run-card";
import type { ChecklistRunResult } from "@/types/checklist";
```

Add data fetch after the existing hooks (around line 18):

```typescript
const { data: checklistRuns } = useCraftChecklistRuns(name!, callsign!);
```

Add the checklist section between the flight plan and black box sections. Insert after the closing `</div>` of the grid (after line 73) and before the black box section:

```tsx
      {/* Checklist Runs */}
      {checklistRuns && checklistRuns.length > 0 && (
        <div className="mt-4">
          <div className="mb-2.5 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            CHECKLISTS
          </div>
          <div className="space-y-3">
            {groupRunsByChecklist(checklistRuns).map(([key, runs]) => (
              <ChecklistRunCard key={key} runs={runs} />
            ))}
          </div>
        </div>
      )}
```

Add the grouping helper function before the `Component` export:

```typescript
/** Groups checklist runs by checklistName+event, sorted by attempt. */
function groupRunsByChecklist(
  runs: ChecklistRunResult[],
): [string, ChecklistRunResult[]][] {
  const groups = new Map<string, ChecklistRunResult[]>();
  for (const run of runs) {
    const key = `${run.checklistName}:${run.event}`;
    const group = groups.get(key) ?? [];
    group.push(run);
    groups.set(key, group);
  }
  // Sort each group by attempt
  for (const group of groups.values()) {
    group.sort((a, b) => a.attempt - b.attempt);
  }
  return [...groups.entries()];
}
```

- [ ] **Step 2: Verify the build**

Run: `pnpm run build`
Expected: PASS — no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/crafts/detail.tsx
git commit -m "feat(web): add checklist run results to craft detail page (RULE-CHKL-5)"
```

---

## Task 19: Build checklist template list page

**Files:**
- Create: `packages/web/src/routes/checklists/index.tsx`

- [ ] **Step 1: Create the template list page**

```tsx
// packages/web/src/routes/checklists/index.tsx
import { useChecklistTemplates, useChecklistBindings } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import type { ChecklistBinding } from "@/types/checklist";

export function Component() {
  const { data: templates } = useChecklistTemplates();
  const { data: bindings } = useChecklistBindings();

  const bindingsForTemplate = (id: string): ChecklistBinding[] =>
    (bindings ?? []).filter((b) => b.templateId === id);

  return (
    <div>
      <PageHeader crumbs={[{ label: "Checklists" }]} />
      <div className="mt-5 flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <span className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Checklist Templates
          </span>
          <span className="ml-3 text-xs" style={{ color: "var(--text-dim)" }}>
            {templates?.length ?? 0} templates
          </span>
        </div>
        <button
          className="rounded px-3 py-1.5 text-xs"
          style={{ background: "var(--accent-blue, #3b82f6)", color: "white" }}
        >
          + New Template
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {(!templates || templates.length === 0) ? (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            No checklist templates defined.
          </div>
        ) : (
          templates.map((tpl) => {
            const tplBindings = bindingsForTemplate(tpl.id);
            const requiredCount = tpl.items.filter((i) => i.severity === "required").length;
            const advisoryCount = tpl.items.filter((i) => i.severity === "advisory").length;

            return (
              <div
                key={tpl.id}
                className="flex items-center justify-between rounded-md p-3"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <div>
                  <div className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
                    {tpl.name}
                  </div>
                  <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-dim)" }}>
                    {tpl.items.length} items · {requiredCount} required, {advisoryCount} advisory
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tplBindings.map((b) => (
                    <span
                      key={`${b.event}-${b.craftCategory}`}
                      className="rounded px-2 py-0.5 text-[10px]"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                    >
                      {b.event}
                    </span>
                  ))}
                  {tplBindings.length > 0 && (
                    <span
                      className="rounded px-2 py-0.5 text-[10px]"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                    >
                      {[...new Set(tplBindings.map((b) => b.craftCategory))].join(", ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/routes/checklists/index.tsx
git commit -m "feat(web): add checklist template list page"
```

---

## Task 20: Build checklist template editor page

**Files:**
- Create: `packages/web/src/components/base/checklist-item-editor.tsx`
- Create: `packages/web/src/routes/checklists/template.tsx`

- [ ] **Step 1: Create the item editor component**

```tsx
// packages/web/src/components/base/checklist-item-editor.tsx
import type { ChecklistItemDef, ChecklistItemSeverity } from "@/types/checklist";

interface ChecklistItemEditorProps {
  item: ChecklistItemDef;
  onChange: (item: ChecklistItemDef) => void;
  onRemove: () => void;
}

export function ChecklistItemEditor({ item, onChange, onRemove }: ChecklistItemEditorProps) {
  const isShell = item.executor.type === "shell";

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}>
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="cursor-grab" style={{ color: "var(--text-dim)" }}>{"\u2630"}</span>
          <input
            className="rounded border bg-transparent px-2 py-1 text-[11px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", width: "200px" }}
            value={item.name}
            onChange={(e) => onChange({ ...item, name: e.target.value })}
          />
          <button
            className="rounded px-2 py-0.5 text-[10px]"
            style={{
              background: item.severity === "required" ? "rgba(220,38,38,0.8)" : "rgba(245,158,11,0.8)",
              color: "white",
            }}
            onClick={() =>
              onChange({
                ...item,
                severity: item.severity === "required" ? "advisory" : "required",
              } as ChecklistItemDef)
            }
          >
            {item.severity}
          </button>
        </div>
        <span className="cursor-pointer text-lg" style={{ color: "var(--text-dim)" }} onClick={onRemove}>
          {"\u00D7"}
        </span>
      </div>

      {/* Executor type toggle */}
      <div className="mb-2">
        <div className="mb-1 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          Executor
        </div>
        <div className="mb-2 flex gap-1">
          <button
            className="rounded px-2.5 py-0.5 text-xs"
            style={{
              background: isShell ? "var(--accent-blue, #3b82f6)" : "var(--bg-elevated)",
              color: isShell ? "white" : "var(--text-dim)",
            }}
            onClick={() => onChange({ ...item, executor: { type: "shell", command: "" } })}
          >
            Shell
          </button>
          <button
            className="rounded px-2.5 py-0.5 text-xs"
            style={{
              background: !isShell ? "var(--accent-purple, #8b5cf6)" : "var(--bg-elevated)",
              color: !isShell ? "white" : "var(--text-dim)",
            }}
            onClick={() => onChange({ ...item, executor: { type: "mcp-tool", tool: "", params: {} } })}
          >
            MCP Tool
          </button>
        </div>

        {isShell ? (
          <input
            className="w-full rounded border bg-transparent px-2 py-1 font-mono text-xs"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            value={item.executor.type === "shell" ? item.executor.command : ""}
            placeholder="e.g., pnpm run test"
            onChange={(e) => onChange({ ...item, executor: { type: "shell", command: e.target.value } })}
          />
        ) : (
          <div className="flex gap-2">
            <input
              className="w-1/2 rounded border bg-transparent px-2 py-1 font-mono text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              value={item.executor.type === "mcp-tool" ? item.executor.tool : ""}
              placeholder="Tool name"
              onChange={(e) =>
                onChange({
                  ...item,
                  executor: {
                    type: "mcp-tool",
                    tool: e.target.value,
                    params: item.executor.type === "mcp-tool" ? item.executor.params : {},
                  },
                })
              }
            />
            <input
              className="w-1/2 rounded border bg-transparent px-2 py-1 font-mono text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              value={item.executor.type === "mcp-tool" ? JSON.stringify(item.executor.params) : "{}"}
              placeholder='{"key": "value"}'
              onChange={(e) => {
                try {
                  const params = JSON.parse(e.target.value) as Record<string, unknown>;
                  onChange({
                    ...item,
                    executor: {
                      type: "mcp-tool",
                      tool: item.executor.type === "mcp-tool" ? item.executor.tool : "",
                      params,
                    },
                  });
                } catch {
                  // Invalid JSON — ignore
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <div className="mb-1 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          Failure Description
        </div>
        <input
          className="w-full rounded border bg-transparent px-2 py-1 text-xs"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          value={item.description ?? ""}
          placeholder="Shown to agents on failure"
          onChange={(e) => onChange({ ...item, description: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the template editor page**

```tsx
// packages/web/src/routes/checklists/template.tsx
import { useState } from "react";
import { useParams } from "react-router";
import { useChecklistTemplate } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { ChecklistItemEditor } from "@/components/base/checklist-item-editor";
import type { ChecklistItemDef } from "@/types/checklist";

export function Component() {
  const { id } = useParams<{ id: string }>();
  const { data: template } = useChecklistTemplate(id!);
  const [name, setName] = useState(template?.name ?? "");
  const [items, setItems] = useState<ChecklistItemDef[]>(template?.items ?? []);

  // Sync state when template loads
  if (template && name === "" && items.length === 0) {
    setName(template.name);
    setItems([...template.items]);
  }

  function updateItem(index: number, updated: ChecklistItemDef) {
    setItems((prev) => prev.map((item, i) => (i === index ? updated : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        name: "",
        severity: "required" as const,
        executor: { type: "shell" as const, command: "" },
      },
    ]);
  }

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "Checklists", to: "/checklists" },
          { label: name || "New Template" },
        ]}
      />
      <div className="mt-5 flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <input
            className="bg-transparent text-base font-semibold"
            style={{ color: "var(--text-primary)", border: "none", outline: "none" }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template Name"
          />
          {template && (
            <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-dim)" }}>
              Template ID: {template.id}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "transparent" }}
          >
            Cancel
          </button>
          <button
            className="rounded px-3 py-1.5 text-xs"
            style={{ background: "var(--accent-blue, #3b82f6)", color: "white" }}
          >
            Save Template
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <ChecklistItemEditor
            key={index}
            item={item}
            onChange={(updated) => updateItem(index, updated)}
            onRemove={() => removeItem(index)}
          />
        ))}
        <div
          className="cursor-pointer rounded-lg border border-dashed p-3 text-center text-xs"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
          onClick={addItem}
        >
          + Add Checklist Item
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/base/checklist-item-editor.tsx packages/web/src/routes/checklists/template.tsx
git commit -m "feat(web): add checklist template editor page and item editor component"
```

---

## Task 21: Build event assignment page

**Files:**
- Create: `packages/web/src/routes/checklists/assignments.tsx`

- [ ] **Step 1: Create the event assignment page**

```tsx
// packages/web/src/routes/checklists/assignments.tsx
import { useState } from "react";
import { useChecklistTemplates, useChecklistBindings } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";

const LIFECYCLE_EVENTS = [
  "before:takeoff",
  "after:takeoff",
  "before:vector-complete",
  "after:vector-complete",
  "before:landing-check",
  "after:landing-check",
  "before:go-around",
  "after:go-around",
  "before:emergency",
  "after:emergency",
  "before:landing",
  "after:landing",
] as const;

export function Component() {
  const { data: templates } = useChecklistTemplates();
  const { data: bindings } = useChecklistBindings();
  const [selectedCategory, setSelectedCategory] = useState<string>("*");

  const categories = ["*", "feature", "hotfix", "refactor"];

  const bindingsForEvent = (event: string) =>
    (bindings ?? []).filter(
      (b) =>
        b.event === event &&
        (selectedCategory === "*" ? true : b.craftCategory === selectedCategory || b.craftCategory === "*"),
    );

  const templateName = (id: string) => templates?.find((t) => t.id === id)?.name ?? id;

  return (
    <div>
      <PageHeader crumbs={[{ label: "Checklists", to: "/checklists" }, { label: "Event Assignments" }]} />

      {/* Category filter */}
      <div className="mt-5 flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            className="rounded-full px-3.5 py-1 text-xs"
            style={{
              background: cat === selectedCategory ? "var(--accent-blue, #3b82f6)" : "var(--bg-elevated)",
              color: cat === selectedCategory ? "white" : "var(--text-muted)",
            }}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat === "*" ? "All Categories" : cat}
          </button>
        ))}
      </div>

      {/* Event timeline */}
      <div className="relative mt-6" style={{ paddingLeft: "28px" }}>
        <div
          className="absolute top-0 bottom-0"
          style={{ left: "12px", width: "2px", background: "var(--border)" }}
        />

        {LIFECYCLE_EVENTS.map((event) => {
          const eventBindings = bindingsForEvent(event);
          const hasBindings = eventBindings.length > 0;

          return (
            <div key={event} className="relative mb-6">
              <div
                className="absolute rounded-full"
                style={{
                  left: "-22px",
                  top: "4px",
                  width: "12px",
                  height: "12px",
                  background: hasBindings ? "var(--accent-blue, #3b82f6)" : "var(--border)",
                  border: "2px solid var(--bg-base, #1e293b)",
                }}
              />
              <div
                className="text-[10px] uppercase tracking-widest"
                style={{ color: hasBindings ? "var(--text-muted)" : "var(--text-dim)" }}
              >
                {event}
              </div>
              <div className="mt-2">
                {eventBindings.length > 0 ? (
                  eventBindings.map((b) => (
                    <div
                      key={`${b.templateId}-${b.craftCategory}`}
                      className="flex items-center justify-between rounded-md border p-2.5"
                      style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ color: "var(--accent-blue, #3b82f6)" }}>{"\u25A0"}</span>
                        <span className="text-[11px]" style={{ color: "var(--text-primary)" }}>
                          {templateName(b.templateId)}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                          {templates?.find((t) => t.id === b.templateId)?.items.length ?? 0} items
                        </span>
                      </div>
                      <span className="cursor-pointer text-xs" style={{ color: "var(--text-dim)" }}>
                        {"\u00D7"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div
                    className="cursor-pointer rounded-md border border-dashed p-2.5 text-xs"
                    style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
                  >
                    + Assign checklist template...
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/routes/checklists/assignments.tsx
git commit -m "feat(web): add checklist event assignment page"
```

---

## Task 22: Register checklist routes

**Files:**
- Modify: the router configuration file (find the existing route definitions)

- [ ] **Step 1: Find and update the router config**

Locate the route configuration file in `packages/web/src/` (likely `routes.tsx` or the root route file). Add the checklist routes alongside the existing project/craft routes:

```typescript
// Add these routes to the router configuration
{
  path: "checklists",
  lazy: () => import("./routes/checklists/index"),
},
{
  path: "checklists/:id",
  lazy: () => import("./routes/checklists/template"),
},
{
  path: "checklists/assignments",
  lazy: () => import("./routes/checklists/assignments"),
},
```

- [ ] **Step 2: Build and verify**

Run: `pnpm run build`
Expected: PASS — no TypeScript errors, routes registered

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/
git commit -m "feat(web): register checklist routes"
```

---

## Task 23: Final integration test and build verification

- [ ] **Step 1: Run the full test suite**

Run: `pnpm run test`
Expected: PASS — all tests green across all packages

- [ ] **Step 2: Run the full build**

Run: `pnpm run build`
Expected: PASS — all packages compile

- [ ] **Step 3: Run lint**

Run: `pnpm run lint`
Expected: PASS — no lint errors

- [ ] **Step 4: Run format check**

Run: `pnpm run format:check`
Expected: PASS — or run `pnpm run format` to fix

- [ ] **Step 5: Final commit if any formatting fixes needed**

```bash
git add -A
git commit -m "chore: format and lint fixes"
```
