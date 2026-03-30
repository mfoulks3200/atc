---
title: Landing Checklist
sidebar_position: 2
---

# Landing Checklist

The **landing checklist** is a configurable set of validation checks that must all pass before a craft can request landing clearance from the [tower](/docs/concepts/tower). It's the final quality gate before merging.

## Aviation Analogy

Before landing, pilots run through a checklist — landing gear down, flaps set, speed correct. Every item must be verified. If something's wrong, they go around and try again. ATC's landing checklist works the same way — every validation must pass, or the craft goes around.

## Default Checks

| Check | Validation |
|---|---|
| **Tests** | All test suites pass |
| **Lint** | No lint errors or warnings |
| **Documentation** | Required docs are present and up to date |
| **Build** | Project builds successfully |

These are the defaults. Projects can add, remove, or modify checks to fit their needs.

## How It Works

1. The craft has passed all vectors in its flight plan and transitions to the **LandingChecklist** state.
2. The pilot (captain or first officer holding controls) executes each checklist item.
3. **If all items pass:** The craft requests landing clearance from the tower. If granted, it transitions to **ClearedToLand**.
4. **If any item fails:** The craft transitions to **GoAround**. The pilot fixes the issues and re-enters the checklist.

## The Go-Around Loop

A go-around is not a failure — it's a normal part of the process. The pilot:

1. Reviews which checklist items failed.
2. Fixes the issues (failing tests, lint errors, missing docs, build errors).
3. Records a `GoAround` entry in the [black box](/docs/concepts/black-box).
4. Re-enters the LandingChecklist state and runs the checks again.

This loop can repeat as many times as needed. However, if the pilot can't resolve the issues after repeated attempts, the captain may [declare an emergency](/docs/protocols/emergency-declaration).

## Rules

- **RULE-LCHK-1:** The landing checklist must be executed by the pilot (captain or first officer) holding controls.
- **RULE-LCHK-2:** All checklist items must pass for the craft to request landing clearance.
- **RULE-LCHK-3:** If any checklist item fails, the craft must perform a go-around.
- **RULE-LCHK-4:** The landing checklist is project-configurable. Projects may add, remove, or modify checks.

## Example

```
Landing Checklist for craft feat-auth-flow:

  ✅ Tests      — 142 passed, 0 failed
  ❌ Lint       — 3 errors in src/auth/callback.ts
  ✅ Docs       — JSDoc present on all exports
  ✅ Build      — tsc --build succeeded

Result: FAIL → Go-around initiated
  Pilot fixing: lint errors in callback.ts (unused imports, missing semicolons)
```

## Related Concepts

- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) — LandingChecklist, GoAround, and ClearedToLand states
- [Tower](/docs/concepts/tower) — grants clearance after checklist passes
- [Tower Merge Protocol](/docs/protocols/tower-merge-protocol) — what happens after clearance
- [Emergency Declaration](/docs/protocols/emergency-declaration) — when go-arounds can't fix the problem
