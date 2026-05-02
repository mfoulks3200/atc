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

#### End-to-end tests

The Playwright suite in `@airtrafficcontrol/e2e` is **not** run by `pnpm run test` — it boots a real daemon against a `mkdtemp` scratch profile, drives the built web bundle through `vite preview`, and tears everything down on shutdown. Run it locally before merging changes that touch the daemon REST/WebSocket surface, the web dashboard, or anything that affects the dashboard / craft detail screenshots in the README.

```bash
pnpm --filter @airtrafficcontrol/e2e exec playwright install chromium  # one-time
pnpm --filter @airtrafficcontrol/web build                             # build the bundle preview serves
pnpm --filter @airtrafficcontrol/e2e test                              # smoke + screenshot suites
```

If a UI change altered the dashboard or craft detail view, regenerate the README screenshots and commit the updated PNGs in `docs/assets/screenshots/`:

```bash
pnpm --filter @airtrafficcontrol/e2e test:screenshots
```

### 6. UX Review

Changes that affect user-facing surfaces require UX review before landing. This applies to spec changes, protocol changes, and any implementation work that introduces or modifies user-visible behavior.

#### 6a. UX Impact Triage (all changes)

- [ ] **Assess whether the change has user-facing impact.** User-facing impact includes: new or modified UI components, error messages shown to users, submission or confirmation flows, dashboard views, CLI output formatting, or protocol sections that define user-visible behavior.
- [ ] **If no user-facing impact:** No further UX review is needed. Proceed to step 7.

#### 6b. UX Review Gate (user-facing changes)

If the change has user-facing impact, complete the following:

- [ ] **Create a UX review subtask** assigned to the UX Designer. The subtask must include:
  - A summary of what changed and which user-facing surfaces are affected.
  - Links to the relevant spec rules (`RULE-*`) or protocol sections, if applicable.
  - Screenshots or mockups of the before/after state, when the change is visual.
- [ ] **UX Designer sign-off** is required before landing. The reviewer evaluates against the UX review checklist (see below).

Changes that **always** require UX review:

- New or modified error message templates.
- Changes to the SDD spec document schema or submission flow (§4.6).
- New dashboard views, components, or layout changes in `@airtrafficcontrol/web`.
- Changes to the operating manual (`docs/agent/operating-manual.md`) that alter pilot-facing guidance.
- Protocol changes (§4.*) that introduce user-visible confirmation, notification, or interaction steps.

#### UX Review Checklist

The UX Designer evaluates the following during review:

- [ ] **Consistency:** Does the change follow established patterns and terminology from the domain model (§1.1)?
- [ ] **Clarity:** Are error messages, labels, and instructions understandable without domain expertise beyond what a pilot or operator would have?
- [ ] **Completeness:** Are all user-visible states covered (success, error, loading, empty)?
- [ ] **Accessibility:** Does the change maintain or improve accessibility (contrast, keyboard navigation, screen reader support)?
- [ ] **Recoverability:** Can users recover from errors without losing work? Are destructive actions confirmed?

> **See also:** RULE-UXR-1 through RULE-UXR-5 in `docs/specification.md`.

### 7. Spec Compliance

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

#### 7a. Technical Writer Review Gate (state machine / protocol changes)

Certain changes require Technical Writer review in addition to the developer self-check above. Developer self-check alone has proven insufficient to prevent post-merge spec gaps (see [AIR-474](/AIR/issues/AIR-474)).

**This gate is triggered when a PR introduces or modifies any of the following:**

- New or modified **lifecycle state transitions** in the `TRANSITIONS` map (`packages/types/src/lifecycle.ts`).
- New **`RULE-*` identifiers** added to `docs/specification.md`.
- New or modified **protocol steps** in any `§4.*` section of `docs/specification.md`.
- Changes to **`packages/types/src/enums.ts`** that add, rename, or remove enum members.
- Changes to `docs/specification.md` or `docs/agent/operating-manual.md` that alter pilot-facing behavior.

**Required steps when the gate is triggered:**

- [ ] **Assign the Technical Writer as a required reviewer** on the PR before requesting landing clearance. Reference the Technical Writer by role, not by agent ID.
- [ ] **Do not land the PR** until the Technical Writer has reviewed and signed off that spec coverage is complete — the relevant `RULE-*` identifier exists, the Rule Index in Appendix A is updated, and `docs/agent/operating-manual.md` reflects any change to pilot behavior.

> **If in doubt whether the gate applies,** assign the Technical Writer anyway. The cost of an unnecessary review is far lower than the cost of a post-merge spec fix.

### 8. Public API Changes

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

## CI Gate Enforcement (RULE-TMRG-5)

The tower merge protocol **structurally enforces** that the landing checklist must pass before a craft can enter the merge queue. This is not a guideline — it is a code-level gate that cannot be bypassed:

1. The landing checklist runs Tests, Lint, and Build as **required** items. A craft transitions to `ClearedToLand` only when all required items pass.
2. The tower clearance endpoint rejects any craft not in `ClearedToLand` status with HTTP 409.
3. The tower merge endpoint independently verifies `ClearedToLand` status as a defense-in-depth check.

Agents cannot bypass this gate by documenting intent to fix later, manually editing craft status, or requesting clearance before the checklist completes. The enforcement is at the API layer in both the `@airtrafficcontrol/tower` library and the daemon route handlers.

## Requesting QA Review

The 90% coverage threshold is the **implementer's responsibility** to verify before requesting QA review. Delegating coverage verification to QA costs at minimum two extra heartbeat round trips — the review, the fix, the re-review.

### Pre-flight (required before creating the QA subtask)

Run these in order and verify each passes:

```bash
pnpm run test -- --coverage   # all changed files ≥ 90% statements AND branches
pnpm run lint                  # zero errors
pnpm run build                 # zero type errors
```

Branch coverage is the metric that most frequently trips QA — statement coverage is easier to achieve. Inspect the **Branch %** column in the coverage report explicitly, not just the overall summary.

### QA subtask template

When creating the QA review subtask, paste this block verbatim into the subtask description and fill it in:

```markdown
**Pre-flight completed by implementer:**
- [ ] `pnpm run test -- --coverage` — all changed files ≥ 90% statements and branches
- [ ] `pnpm run lint` — zero errors
- [ ] `pnpm run build` — zero type errors

**Coverage report (paste relevant lines from `pnpm run test -- --coverage` here):**
<paste output here>
```

> **QA rejection policy:** If the QA subtask description does not include a pasted coverage report showing ≥ 90% for all changed files, QA must reject the review request immediately and return the task to the implementer with a comment naming the missing report. The coverage gate is the implementer's gate — not QA's gate to discover.

## Quick Reference

| Step | Command | Must Pass |
|---|---|---|
| Format | `pnpm run format` | No diff after running |
| Lint | `pnpm run lint` | Zero errors, zero warnings |
| Type check | `pnpm run build` | Zero errors |
| Tests | `pnpm run test` | All passing |
| Coverage | `pnpm run test -- --coverage` | 90% minimum on changed files |
| UX review | UX impact triage; subtask if user-facing | UX Designer sign-off on user-facing changes |
| Spec compliance | Review against `docs/specification.md` | No discrepancies, or spec updated |
| TW review | Assign Technical Writer if §7a triggers apply | Technical Writer sign-off before landing |
| CI gate | Landing checklist must pass | Tower rejects merge without `ClearedToLand` (RULE-TMRG-5) |
