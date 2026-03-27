# @atc/checklist

Landing checklist runner for the ATC system. Defines checklist items as named async validation steps, executes them sequentially, and aggregates pass/fail results. When any item fails, the craft must perform a go-around.

## Installation

```bash
pnpm add @atc/checklist
```

This is an internal workspace package (`workspace:*`).

## API Reference

### Types

#### `ChecklistItem`

A named async validation step. See `RULE-LCHK-4`.

| Property | Type | Description |
|---|---|---|
| `name` | `string` | Display name (e.g., "Tests", "Lint") |
| `validate` | `() => Promise<ChecklistItemResult>` | Async function that runs the validation |

#### `ChecklistItemResult`

Result of a single checklist item. See `RULE-LCHK-2`.

| Property | Type | Description |
|---|---|---|
| `name` | `string` | Name of the checklist item |
| `passed` | `boolean` | Whether the validation passed |
| `message` | `string?` | Optional human-readable message |

#### `ChecklistResult`

Aggregate result of the full checklist run. See `RULE-LCHK-2`, `RULE-LCHK-3`.

| Property | Type | Description |
|---|---|---|
| `passed` | `boolean` | True only if ALL items passed |
| `items` | `readonly ChecklistItemResult[]` | Results for every item, in execution order |
| `failedItems` | `readonly ChecklistItemResult[]` | Subset where `passed` is false |

### Functions

#### `createChecklistItem(name: string, validate: () => Promise<ChecklistItemResult>): ChecklistItem`

Creates a frozen checklist item from a name and an async validation function. See `RULE-LCHK-4`.

#### `runChecklist(items: readonly ChecklistItem[]): Promise<ChecklistResult>`

Runs every item sequentially and aggregates results. All items are always executed regardless of individual pass/fail — the full picture is always reported.

Throws `ChecklistError` if `items` is empty.

See `RULE-LCHK-1`, `RULE-LCHK-2`, `RULE-LCHK-3`.

#### `createDefaultChecklist(): readonly ChecklistItem[]`

Creates the default landing checklist with 4 placeholder validators (Tests, Lint, Documentation, Build). Each placeholder always passes — projects override these with real implementations.

See `RULE-LCHK-4`.

## Usage

```typescript
import { runChecklist, createChecklistItem, createDefaultChecklist } from "@atc/checklist";

// Run the default checklist
const defaults = createDefaultChecklist();
const result = await runChecklist(defaults);
console.log(result.passed); // true (all placeholders pass)

// Create a custom checklist item
const testsItem = createChecklistItem("Tests", async () => {
  const passed = await runTestSuite();
  return { name: "Tests", passed, message: passed ? "All tests pass" : "3 failures" };
});

// Run a custom checklist
const customResult = await runChecklist([testsItem]);
if (!customResult.passed) {
  console.log("Go-around required:", customResult.failedItems);
}
```

## Specification Rules

| Rule | Description |
|---|---|
| `RULE-LCHK-1` | Checklist is executed by the pilot holding controls |
| `RULE-LCHK-2` | `passed` is true only if every item passed |
| `RULE-LCHK-3` | A false result means a go-around is required |
| `RULE-LCHK-4` | The checklist is project-configurable |

## Dependencies

| Package | Purpose |
|---|---|
| `@atc/types` | Domain types |
| `@atc/errors` | `ChecklistError` |

## Related Packages

- [`@atc/errors`](../errors/) — `ChecklistError` thrown on empty checklists
- [`@atc/tower`](../tower/) — Tower verifies checklist passed before granting clearance
- [`@atc/daemon`](../daemon/) — Daemon runs the checklist pipeline
