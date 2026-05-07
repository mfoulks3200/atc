# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ATC (Air Traffic Control) is an agent orchestration system that coordinates multiple autonomous agents working on concurrent code changes in a shared repository. It uses aviation terminology as its domain language — changes are "crafts" flown by "pilots" who navigate "vectors" and request "landing clearance" from a "tower" to merge.

## Commands

```bash
pnpm run build              # TypeScript compilation (tsc --build)
pnpm run test               # Run all tests (vitest run)
pnpm run test -- --coverage # Run tests with coverage report
pnpm run test:watch         # Watch mode
pnpm run lint               # ESLint
pnpm run lint -- --fix      # ESLint with auto-fix
pnpm run format             # Prettier write
pnpm run format:check       # Prettier check
```

Run a single test file:

```bash
pnpm run test -- packages/types/src/enums.test.ts
```

End-to-end tests live in `@airtrafficcontrol/e2e` and are not run by `pnpm run test` — they boot a real daemon against a scratch profile and drive the built web bundle through `vite preview` (Chromium only):

```bash
pnpm --filter @airtrafficcontrol/e2e exec playwright install chromium  # one-time
pnpm --filter @airtrafficcontrol/web build                             # build the bundle preview serves
pnpm --filter @airtrafficcontrol/e2e test                              # smoke + screenshot suites
pnpm --filter @airtrafficcontrol/e2e test:screenshots                  # screenshot suite only
```

## Architecture

This is a pnpm monorepo with TypeScript (ES2022, Node16 module resolution, strict mode).

### Packages

- **`@airtrafficcontrol/types`** — Pure type definitions, enums, and const objects. No runtime logic, no dependencies. Defines the complete ATC domain model: `CraftStatus` (8 lifecycle states), `SeatType`, `ControlMode`, `VectorStatus`, `BlackBoxEntryType`, entity interfaces (`Craft`, `Pilot`, `Vector`, etc.), state machine (`TRANSITIONS`, `TERMINAL_STATES`), and permissions matrix (`PERMISSIONS`).

- **`@airtrafficcontrol/errors`** — Domain error classes. Base `AtcError` carries a `ruleId: string` for traceability back to the spec. Subclasses: `CraftError`, `SeatAssignmentError`, `ControlsError`, `BlackBoxError`, `LifecycleError` (with `from`/`to` context), `VectorError`, `ChecklistError`, `EmergencyError`, `TowerError`. No error classes yet for RULE-ORIG-* or RULE-PILOT-* rules.

- **`@airtrafficcontrol/validation`** — Pure validation functions. `isPilotCertified` (RULE-PILOT-2), `isValidSeatAssignment`/`validateSeatAssignment` (RULE-SEAT-2, RULE-SEAT-3), `validateCraftCrew` (RULE-CRAFT-5, RULE-SEAT-1, RULE-SEAT-2), and `canPerformAction`/`canHoldControls` (RULE-CTRL-2) backed by the `PERMISSIONS` matrix from `@airtrafficcontrol/types`.

- **`@airtrafficcontrol/core`** — Runtime domain logic. Implements craft creation with validation (`createCraft`), controls management (`createInitialControls`, `claimExclusiveControls`, `shareControls`, `isHoldingControls`), lifecycle state machine (`transitionCraft`, `canTransition`, `isTerminalState`), flight plan operations (`getNextVector`, `reportVector`, `allVectorsPassed`, `createVectorReport`), and black box operations (`createBlackBoxEntry`, `appendToBlackBox`). Depends on `@airtrafficcontrol/types`, `@airtrafficcontrol/errors`, `@airtrafficcontrol/validation`.

- **`@airtrafficcontrol/checklist`** — Landing checklist runner. Defines a composable `ChecklistItem` interface and `runChecklist` function. Includes `createDefaultChecklist` with the four spec-defined defaults (Tests, Lint, Documentation, Build) as placeholder validators. Project-configurable per RULE-LCHK-4.

- **`@airtrafficcontrol/tower`** — Tower merge coordination. `Tower` class with `requestClearance` (verifies all vectors passed), FCFS merge queue (`enqueue`/`dequeue`/`peek`), and `declareEmergency` (RULE-EMER-1 through RULE-EMER-4). Note: merge execution (branch verification, actual merge, mark landed) is not yet implemented.

- **`@airtrafficcontrol/daemon`** — Fastify-based HTTP/WebSocket server. Owns process lifecycle, configuration (global + per-profile), state persistence (agent, craft, and tower stores backed by atomic JSON files), REST API (`/api/v1` with routes for projects, crafts, vectors, tower, agents, pilots, intercom, blackbox, health), WebSocket pub/sub with channel patterns, git utilities (bare repos, worktrees), and a shell-based checklist runner. Introduces `AgentStatus` (`running | paused | suspended | terminated`) which is not yet in the spec.

- **`@airtrafficcontrol/adapter-claude-agent-sdk`** — Stub adapter for the Anthropic Claude Agent SDK. Implements the `AgentAdapter` interface as no-ops. Includes `buildSystemPrompt` which constructs a structured system prompt from craft state for agent context.

- **`@airtrafficcontrol/web`** — React SPA dashboard (Vite + React Router + TanStack Query). Read-focused UI over the daemon's REST and WebSocket APIs. No domain logic — purely presentational. Note: duplicates domain types locally in `types/api.ts` instead of importing from `@airtrafficcontrol/types`.

- **`@airtrafficcontrol/e2e`** — Playwright (Chromium-only) end-to-end test package. Boots the daemon against a `mkdtemp` scratch profile via `scripts/run-daemon.ts` and drives the built web bundle through `vite preview`. Houses the smoke suite (dashboard, projects, crafts, pilots, settings round trips) and a screenshot suite that seeds a deterministic demo dataset and writes `dashboard.png` / `craft-detail.png` to `docs/assets/screenshots/` for the README. Not exercised by `pnpm run test`; run with `pnpm --filter @airtrafficcontrol/e2e test`.

### Key Documents

- **`docs/specification.md`** — The authoritative formal spec. Defines every entity, rule, and protocol with numbered `RULE-*` identifiers (62 total). Implementation must match this spec. If they diverge, surface the discrepancy before merging.
- **`docs/overview.md`** — The original informal design brief. Retained as design notes.
- **`docs/agent/operating-manual.md`** — Behavioral guidance for agents operating as pilots within ATC. Written in second person with placeholder tokens (`{seat_type}`, `{callsign}`, `{cargo}`).
- **`docs/contributing.md`** — Full validation checklist. Must be followed for every change.

## Contribution Rules

All changes must pass the checklist in `docs/contributing.md` before merging. Key requirements:

- **JSDoc on all exports** with `@see RULE-*` references linking to `docs/specification.md`.
- **90% test coverage minimum** on changed files.
- **Spec compliance is mandatory.** Check changes against `docs/specification.md`. If the implementation differs from the spec, surface it. If new major behavior isn't in the spec, update the spec, the Rule Index (Appendix A), and the operating manual as needed.
- **Public API changes** require a semver version bump and a `CHANGELOG.md` entry in the affected package.

## Code Style

- Double quotes, trailing commas, semicolons, 100-char print width (Prettier).
- Imports use `.js` extensions (Node16 module resolution requires this even for `.ts` source files).
- Tests are colocated: `foo.ts` has `foo.test.ts` in the same directory.
- Test files match pattern `packages/*/src/**/*.test.ts`.

## Domain Model Quick Reference

| Term | Meaning |
|---|---|
| Craft | Unit of work tied to a git branch |
| Pilot | Autonomous agent with certifications |
| Captain | Pilot-in-command, final authority, only one who can declare emergency |
| First Officer | Certified co-pilot, can modify code |
| Jumpseat | Observer/advisor, cannot modify code or hold controls |
| Vector | Milestone with acceptance criteria, must be passed in order |
| Flight Plan | Ordered sequence of vectors |
| Black Box | Append-only event log on every craft |
| Tower | Merge coordinator, one per repo |
| Controls | Exclusive or shared code modification rights |

Rule IDs follow the format `RULE-{PREFIX}-{N}` (e.g., `RULE-CRAFT-1`, `RULE-CTRL-3`). Insertions use letter suffixes (`RULE-CTRL-2a`) to avoid renumbering.

## Known Spec Gaps

The spec (`docs/specification.md`) covers the domain model and protocols but has not been updated to reflect the full codebase. Key gaps:

- **Rule enforcement is split** between `@airtrafficcontrol/core` (library-level) and `@airtrafficcontrol/daemon` (HTTP route handlers). Some transition preconditions (RULE-LIFE-3, RULE-LCHK-3, RULE-EMER-1, RULE-VEC-2) are only enforced in daemon routes, not in core.
- **`transitionCraft()` skips most preconditions.** Only RULE-LIFE-4 (all vectors passed) and RULE-LIFE-7 (EmergencyDeclaration in bbox) are checked. RULE-LIFE-3, RULE-LIFE-5, RULE-LIFE-6 are not enforced at the core level.
- **`shareControls()` doesn't validate seat type.** A jumpseat pilot ID can be passed in shared areas, violating RULE-CTRL-2.
- **`runChecklist()` has no authorization check.** RULE-LCHK-1 requires the executing pilot to hold controls — the function accepts no pilot/craft context.
- **The spec doesn't cover the daemon, agents, web, or adapter packages.** Agent lifecycle (`AgentStatus`), the REST/WebSocket API, persistence, and the adapter interface are implementation-only concepts with no spec rules.
- **Pilot persistence is implemented.** Pilot records are backed by `PilotStore` with atomic JSON persistence, loaded on startup and flushed periodically alongside agents and crafts.
