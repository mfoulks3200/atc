---
title: Contributing
sidebar_position: 3
---

# Contributing — Change Validation Checklist

This document defines the required steps for making and validating changes in the ATC codebase. All agents and contributors must complete every applicable item before a change is considered ready to land.

## Prerequisites

```bash
pnpm install
```

## Checklist

Complete these steps in order after making changes. Every item must pass before requesting landing clearance.

### 1. Documentation (TypeDoc)

- [ ] All exported functions, classes, interfaces, types, enums, and constants have JSDoc comments.
- [ ] All non-trivial parameters and return values are documented.
- [ ] JSDoc comments describe **what** and **why**, not just restating the type signature.
- [ ] Where applicable, `@see RULE-*` references link back to the formal specification (`docs/specification.md`).

**Example:**

```typescript
/**
 * Validates that a pilot is certified to occupy the given seat on a craft.
 * Returns false if the pilot lacks the required certification for non-jumpseat positions.
 *
 * @param pilot - The pilot to validate.
 * @param seat - The seat being assigned.
 * @param craftCategory - The craft's category.
 * @returns Whether the assignment is valid.
 * @see RULE-SEAT-2, RULE-SEAT-3
 */
export function isValidSeatAssignment(
  pilot: Pilot,
  seat: SeatType,
  craftCategory: string,
): boolean {
```

### 2. Formatting

- [ ] Run Prettier and fix any formatting issues.

```bash
pnpm run format
```

- [ ] Verify no formatting issues remain.

```bash
pnpm run format:check
```

### 3. Linting

- [ ] Run ESLint and fix all errors and warnings.

```bash
pnpm run lint
```

If there are auto-fixable issues:

```bash
pnpm run lint -- --fix
```

### 4. Type Checking

- [ ] Run the TypeScript compiler and verify there are no type errors.

```bash
pnpm run build
```

All packages must compile cleanly with zero errors.

### 5. Tests

- [ ] Write or update tests for all changed behavior.
- [ ] Tests must cover both expected behavior and meaningful edge cases.
- [ ] Achieve a minimum of **90% code coverage** on changed files.

Run the full test suite:

```bash
pnpm run test
```

Run tests with coverage:

```bash
pnpm run test -- --coverage
```

Review the coverage report and verify that changed files meet the 90% threshold across statements, branches, functions, and lines.

- [ ] All tests pass with zero failures.

### 6. Spec Compliance

Every change must be checked against the formal specification at `docs/specification.md`. The implementation and the spec must agree — one or the other must be updated before merging.

- [ ] **Review changed code against the spec.** For each file you modified, identify the relevant `RULE-*` identifiers and verify that your implementation matches the spec's definitions, constraints, and state transitions.

- [ ] **If the implementation differs from the spec:** Stop and surface the discrepancy to the user. Do not merge until one of the following is resolved:
  - The implementation is corrected to match the spec, **or**
  - The spec is updated to reflect the intended change (with the user's approval).

- [ ] **If the change introduces new behavior not mentioned in the spec:** Assess whether it is a major change (new entity, new state, new protocol, new rule, changed lifecycle, changed permissions). If so:
  - Add the relevant definitions, rules, and `RULE-*` identifiers to `docs/specification.md`.
  - Update the Rule Index in Appendix A.
  - Update `docs/agent/operating-manual.md` if the change affects pilot behavior.
  - Update `packages/types/` if the change affects the domain model.

- [ ] **If the change is minor** (internal refactor, bug fix, implementation detail not visible in the domain model), no spec update is needed.

**When in doubt, ask.** It is always better to flag a potential spec discrepancy than to silently merge a change that contradicts the spec.

### 7. Public API Changes

If any change modifies the **public API surface** of a package (exported types, interfaces, functions, enums, or constants), the following additional steps are required:

- [ ] **Bump the package version** in the affected package's `package.json` following semver:
  - **Patch** (`0.0.x`) — Bug fixes, internal changes that don't alter the API shape.
  - **Minor** (`0.x.0`) — New exports, new optional fields, backward-compatible additions.
  - **Major** (`x.0.0`) — Removed exports, renamed exports, changed type signatures, breaking changes.

- [ ] **Update the changelog** — Add a `CHANGELOG.md` entry in the affected package directory. Use the following format:

```markdown
## [0.1.0] - 2026-03-26

### Added
- `SomeNewType` interface for representing X.
- `someFunction()` for doing Y.

### Changed
- `ExistingType.field` type changed from `string` to `string[]`.

### Removed
- `DeprecatedType` — replaced by `NewType`.
```

Changelog categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`.

- [ ] Verify that downstream packages still compile after the API change:

```bash
pnpm run build
```

## Quick Reference

| Step | Command | Must Pass |
|---|---|---|
| Format | `pnpm run format` | No diff after running |
| Lint | `pnpm run lint` | Zero errors, zero warnings |
| Type check | `pnpm run build` | Zero errors |
| Tests | `pnpm run test` | All passing |
| Coverage | `pnpm run test -- --coverage` | 90% minimum on changed files |
| Spec compliance | Review against `docs/specification.md` | No discrepancies, or spec updated |
