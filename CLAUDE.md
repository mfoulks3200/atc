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

## Architecture

This is a pnpm monorepo with TypeScript (ES2022, Node16 module resolution, strict mode).

### Packages

- **`@atc/types`** — Pure type definitions, enums, and const objects. No runtime logic, no dependencies. Defines the complete ATC domain model: `CraftStatus` (8 lifecycle states), `SeatType`, `ControlMode`, `VectorStatus`, `BlackBoxEntryType`, entity interfaces (`Craft`, `Pilot`, `Vector`, etc.), state machine (`TRANSITIONS`, `TERMINAL_STATES`), and permissions matrix (`PERMISSIONS`).

- **`@atc/core`** — Runtime implementation of the ATC system. Currently a placeholder — all domain logic is to be built here, importing types from `@atc/types`.

### Key Documents

- **`docs/specification.md`** — The authoritative formal spec. Defines every entity, rule, and protocol with numbered `RULE-*` identifiers (62 total). Implementation must match this spec. If they diverge, surface the discrepancy before merging.
- **`docs/spec.md`** — The original informal design brief. Retained as design notes.
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
