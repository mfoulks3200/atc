# @atc/checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A configurable landing checklist runner that validates all pre-merge checks and reports pass/fail results.

**Architecture:** Define checklist items as async validation functions. The runner executes all items and aggregates results. Projects configure their own checklist items; defaults are provided. Pure async functions, no side effects beyond running the validators.

**Tech Stack:** TypeScript 5.8, vitest, pnpm workspaces

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `packages/checklist/package.json` | `@atc/checklist` package manifest |
| `packages/checklist/tsconfig.json` | TypeScript config extending root |
| `packages/checklist/src/types.ts` | `ChecklistItem`, `ChecklistItemResult`, `ChecklistResult` interfaces |
| `packages/checklist/src/runner.ts` | `runChecklist`, `createChecklistItem` functions |
| `packages/checklist/src/runner.test.ts` | Runner tests (TDD) |
| `packages/checklist/src/defaults.ts` | `createDefaultChecklist` factory |
| `packages/checklist/src/defaults.test.ts` | Defaults tests (TDD) |
| `packages/checklist/src/index.ts` | Barrel re-export |

### Modified Files

| File | Change |
|------|--------|
| `tsconfig.json` | Add `{ "path": "packages/checklist" }` to references |

---

## Task 1: Scaffold the Package

**Files:**
- Create: `packages/checklist/package.json`
- Create: `packages/checklist/tsconfig.json`
- Modify: `tsconfig.json` (root)

- [ ] **Step 1: Create `packages/checklist/package.json`**

```json
{
  "name": "@atc/checklist",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc --build"
  },
  "dependencies": {
    "@atc/types": "workspace:*",
    "@atc/errors": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/checklist/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [
    { "path": "../types" },
    { "path": "../errors" }
  ]
}
```

- [ ] **Step 3: Add project reference to root `tsconfig.json`**

Add `{ "path": "packages/checklist" }` to the `references` array:

```json
{
  "references": [
    { "path": "packages/types" },
    { "path": "packages/core" },
    { "path": "packages/checklist" }
  ]
}
```

- [ ] **Step 4: Create `packages/checklist/src/` directory and empty `index.ts`**

```typescript
// packages/checklist/src/index.ts
// Barrel file — populated as modules are implemented.
```

- [ ] **Step 5: Run `pnpm install` from the repo root to link the new workspace package**

```bash
pnpm install
```

---

## Task 2: Define Types

**Files:**
- Create: `packages/checklist/src/types.ts`
- Modify: `packages/checklist/src/index.ts`

- [ ] **Step 1: Create `packages/checklist/src/types.ts`**

```typescript
/**
 * Result of a single checklist item validation.
 *
 * @see RULE-LCHK-2 — each item contributes a pass/fail to the aggregate result.
 */
export interface ChecklistItemResult {
  /** Name of the checklist item that produced this result. */
  readonly name: string;
  /** Whether the validation passed. */
  readonly passed: boolean;
  /** Optional human-readable message (e.g., error details on failure). */
  readonly message?: string;
}

/**
 * A single checklist item — a named async validation step.
 *
 * @see RULE-LCHK-4 — projects define their own checklist items.
 */
export interface ChecklistItem {
  /** Display name for this checklist item (e.g., "Tests", "Lint"). */
  readonly name: string;
  /** Async function that runs the validation and returns a result. */
  readonly validate: () => Promise<ChecklistItemResult>;
}

/**
 * Aggregate result of running the full landing checklist.
 *
 * @see RULE-LCHK-2 — `passed` is true only if every item passed.
 * @see RULE-LCHK-3 — if `passed` is false, a go-around is required.
 */
export interface ChecklistResult {
  /** True only if ALL items passed. */
  readonly passed: boolean;
  /** Results for every item, in execution order. */
  readonly items: readonly ChecklistItemResult[];
  /** Subset of `items` where `passed` is false. Empty when checklist passes. */
  readonly failedItems: readonly ChecklistItemResult[];
}
```

- [ ] **Step 2: Update `packages/checklist/src/index.ts` to export types**

```typescript
export type {
  ChecklistItem,
  ChecklistItemResult,
  ChecklistResult,
} from "./types.js";
```

---

## Task 3: Implement the Runner (TDD)

**Files:**
- Create: `packages/checklist/src/runner.test.ts`
- Create: `packages/checklist/src/runner.ts`
- Modify: `packages/checklist/src/index.ts`

### Write Tests First

- [ ] **Step 1: Create `packages/checklist/src/runner.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { createChecklistItem, runChecklist } from "./runner.js";
import type { ChecklistItemResult } from "./types.js";

// ---------------------------------------------------------------------------
// createChecklistItem
// ---------------------------------------------------------------------------

describe("createChecklistItem", () => {
  it("returns a ChecklistItem with the given name and validate function", async () => {
    const result: ChecklistItemResult = { name: "Test", passed: true };
    const item = createChecklistItem("Test", async () => result);

    expect(item.name).toBe("Test");
    expect(await item.validate()).toBe(result);
  });
});

// ---------------------------------------------------------------------------
// runChecklist
// ---------------------------------------------------------------------------

describe("runChecklist", () => {
  it("returns passed: true when all items pass (RULE-LCHK-2)", async () => {
    const items = [
      createChecklistItem("A", async () => ({ name: "A", passed: true })),
      createChecklistItem("B", async () => ({ name: "B", passed: true })),
    ];

    const result = await runChecklist(items);

    expect(result.passed).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.failedItems).toHaveLength(0);
  });

  it("returns passed: false when any item fails (RULE-LCHK-2)", async () => {
    const items = [
      createChecklistItem("A", async () => ({ name: "A", passed: true })),
      createChecklistItem("B", async () => ({
        name: "B",
        passed: false,
        message: "lint errors found",
      })),
    ];

    const result = await runChecklist(items);

    expect(result.passed).toBe(false);
    expect(result.items).toHaveLength(2);
    expect(result.failedItems).toHaveLength(1);
    expect(result.failedItems[0]!.name).toBe("B");
    expect(result.failedItems[0]!.message).toBe("lint errors found");
  });

  it("returns passed: false when ALL items fail", async () => {
    const items = [
      createChecklistItem("A", async () => ({ name: "A", passed: false })),
      createChecklistItem("B", async () => ({ name: "B", passed: false })),
    ];

    const result = await runChecklist(items);

    expect(result.passed).toBe(false);
    expect(result.failedItems).toHaveLength(2);
  });

  it("preserves execution order in items array", async () => {
    const items = [
      createChecklistItem("First", async () => ({
        name: "First",
        passed: true,
      })),
      createChecklistItem("Second", async () => ({
        name: "Second",
        passed: true,
      })),
      createChecklistItem("Third", async () => ({
        name: "Third",
        passed: false,
      })),
    ];

    const result = await runChecklist(items);

    expect(result.items.map((i) => i.name)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("throws ChecklistError when items array is empty", async () => {
    await expect(runChecklist([])).rejects.toThrow(
      "Checklist must contain at least one item",
    );
  });

  it("runs all items even if early ones fail (collects all results)", async () => {
    const calls: string[] = [];
    const items = [
      createChecklistItem("A", async () => {
        calls.push("A");
        return { name: "A", passed: false };
      }),
      createChecklistItem("B", async () => {
        calls.push("B");
        return { name: "B", passed: true };
      }),
    ];

    const result = await runChecklist(items);

    expect(calls).toEqual(["A", "B"]);
    expect(result.items).toHaveLength(2);
    expect(result.failedItems).toHaveLength(1);
  });
});
```

### Implement Runner

- [ ] **Step 2: Create `packages/checklist/src/runner.ts`**

```typescript
import { ChecklistError } from "@atc/errors";
import type {
  ChecklistItem,
  ChecklistItemResult,
  ChecklistResult,
} from "./types.js";

/**
 * Creates a checklist item from a name and an async validation function.
 *
 * @param name - Display name for the checklist item.
 * @param validate - Async function that performs the validation.
 * @returns A frozen {@link ChecklistItem}.
 * @see RULE-LCHK-4
 */
export function createChecklistItem(
  name: string,
  validate: () => Promise<ChecklistItemResult>,
): ChecklistItem {
  return Object.freeze({ name, validate });
}

/**
 * Runs every item in the checklist and aggregates the results.
 *
 * All items are executed sequentially regardless of individual pass/fail —
 * the full picture is always reported.
 *
 * @param items - The checklist items to run. Must not be empty.
 * @returns Aggregate result with per-item detail.
 * @throws {ChecklistError} If `items` is empty.
 * @see RULE-LCHK-1 — executed by the pilot holding controls.
 * @see RULE-LCHK-2 — `passed` is true only if ALL items passed.
 * @see RULE-LCHK-3 — a false result means a go-around is required.
 */
export async function runChecklist(
  items: readonly ChecklistItem[],
): Promise<ChecklistResult> {
  if (items.length === 0) {
    throw new ChecklistError(
      "Checklist must contain at least one item",
      "RULE-LCHK-2",
    );
  }

  const results: ChecklistItemResult[] = [];

  for (const item of items) {
    const result = await item.validate();
    results.push(result);
  }

  const failedItems = results.filter((r) => !r.passed);

  return Object.freeze({
    passed: failedItems.length === 0,
    items: Object.freeze(results),
    failedItems: Object.freeze(failedItems),
  });
}
```

- [ ] **Step 3: Update `packages/checklist/src/index.ts` to export runner functions**

```typescript
export type {
  ChecklistItem,
  ChecklistItemResult,
  ChecklistResult,
} from "./types.js";

export { createChecklistItem, runChecklist } from "./runner.js";
```

- [ ] **Step 4: Run tests and verify all pass**

```bash
pnpm vitest run packages/checklist/src/runner.test.ts
```

All 7 tests should pass.

---

## Task 4: Implement Default Checklist (TDD)

**Files:**
- Create: `packages/checklist/src/defaults.test.ts`
- Create: `packages/checklist/src/defaults.ts`
- Modify: `packages/checklist/src/index.ts`

### Write Tests First

- [ ] **Step 1: Create `packages/checklist/src/defaults.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { createDefaultChecklist } from "./defaults.js";
import { runChecklist } from "./runner.js";

describe("createDefaultChecklist", () => {
  it("returns exactly 4 default checklist items", () => {
    const items = createDefaultChecklist();

    expect(items).toHaveLength(4);
  });

  it("includes Tests, Lint, Documentation, and Build items (RULE-LCHK-4)", () => {
    const items = createDefaultChecklist();
    const names = items.map((i) => i.name);

    expect(names).toEqual(["Tests", "Lint", "Documentation", "Build"]);
  });

  it("all default items pass (placeholder validators)", async () => {
    const items = createDefaultChecklist();
    const result = await runChecklist(items);

    expect(result.passed).toBe(true);
    expect(result.failedItems).toHaveLength(0);
  });

  it("each item result name matches the item name", async () => {
    const items = createDefaultChecklist();

    for (const item of items) {
      const result = await item.validate();
      expect(result.name).toBe(item.name);
      expect(result.passed).toBe(true);
    }
  });

  it("returns a frozen array", () => {
    const items = createDefaultChecklist();

    expect(Object.isFrozen(items)).toBe(true);
  });
});
```

### Implement Defaults

- [ ] **Step 2: Create `packages/checklist/src/defaults.ts`**

```typescript
import { createChecklistItem } from "./runner.js";
import type { ChecklistItem } from "./types.js";

/**
 * Creates the default landing checklist with placeholder validators.
 *
 * The four default checks correspond to the spec's default checklist
 * (Section 4.2). Each placeholder always passes — projects override
 * these with real implementations.
 *
 * @returns A frozen array of the 4 default checklist items.
 * @see RULE-LCHK-4 — the checklist is project-configurable.
 */
export function createDefaultChecklist(): readonly ChecklistItem[] {
  const defaults: readonly ChecklistItem[] = [
    createChecklistItem("Tests", async () => ({
      name: "Tests",
      passed: true,
      message: "Placeholder — all test suites pass.",
    })),
    createChecklistItem("Lint", async () => ({
      name: "Lint",
      passed: true,
      message: "Placeholder — no lint errors or warnings.",
    })),
    createChecklistItem("Documentation", async () => ({
      name: "Documentation",
      passed: true,
      message: "Placeholder — required docs are present and up to date.",
    })),
    createChecklistItem("Build", async () => ({
      name: "Build",
      passed: true,
      message: "Placeholder — project builds successfully.",
    })),
  ];

  return Object.freeze(defaults);
}
```

- [ ] **Step 3: Update `packages/checklist/src/index.ts` to export defaults**

```typescript
export type {
  ChecklistItem,
  ChecklistItemResult,
  ChecklistResult,
} from "./types.js";

export { createChecklistItem, runChecklist } from "./runner.js";
export { createDefaultChecklist } from "./defaults.js";
```

- [ ] **Step 4: Run all checklist tests and verify everything passes**

```bash
pnpm vitest run packages/checklist/src/
```

All 12 tests (7 runner + 5 defaults) should pass.

- [ ] **Step 5: Run the full build to verify type-checking**

```bash
pnpm run build
```

Zero errors expected.

---

## Validation

After all tasks are complete, run the contributing checklist from `docs/contributing.md`:

```bash
pnpm run format
pnpm run format:check
pnpm run lint
pnpm run build
pnpm run test
```

All commands must exit cleanly with zero errors and zero warnings.
