# ATC Formal Specification — Design Document

**Date:** 2026-03-26
**Status:** Draft
**Brief:** `docs/spec.md` (unchanged, retained as informal design notes)

## Purpose

Produce two formal specifications from the existing `docs/spec.md` design brief:

1. **Human specification** — an authoritative reference for developers building ATC
2. **Agent specification** — a machine-consumable type package plus a behavioral operating manual for agents running inside ATC

## Deliverables

### 1. `docs/specification.md` — Formal Human Specification

A single comprehensive markdown document. The authoritative source of truth for ATC's domain model, lifecycle, protocols, and invariants.

**Structure:**

#### Section 1: Front Matter & Overview

- Version, status, scope statement.
- References `docs/spec.md` as the original design brief.
- **Terminology table** mapping every aviation metaphor to its software meaning (craft = unit of work, pilot = agent, tower = merge coordinator, vector = milestone, etc.).

#### Section 2: Domain Model

Each entity gets a formal definition with typed property tables and numbered rule identifiers.

**2.1 Craft**
- Properties with types and constraints (e.g., Callsign: string, unique, immutable after creation).
- Black Box subsection: entry schema, append-only invariant, entry types.
- Rule IDs: `RULE-CRAFT-*`, `RULE-BBOX-*`

**2.2 Pilot**
- Properties, certifications, seat assignment rules as numbered invariants.
- Controls subsection: exclusive/shared modes, handoff protocol.
- Intercom subsection: radio discipline, 3W principle.
- Rule IDs: `RULE-PILOT-*`, `RULE-SEAT-*`, `RULE-CTRL-*`, `RULE-ICOM-*`

**2.3 Tower**
- Responsibilities, one-tower-per-repo constraint, merge protocol reference.
- Rule IDs: `RULE-TOWER-*`

**2.4 Vector**
- Properties with types, flight plan as ordered collection, reporting requirements.
- Relationship between vector status and lifecycle gating.
- Rule IDs: `RULE-VEC-*`

**2.5 Origin Airport**
- Definition, what it receives on emergency (callsign, cargo, flight plan, black box).
- Rule IDs: `RULE-ORIG-*`

#### Section 3: Craft Lifecycle

- **State enum:** `Taxiing`, `In-Flight`, `Landing-Checklist`, `Go-Around`, `Cleared-to-Land`, `Landed`, `Emergency`, `Return-to-Origin`. Terminal states: `Landed`, `Return-to-Origin`.
- **Transition table:** Each transition gets a rule ID (e.g., `RULE-LIFE-1`) with explicit preconditions.
- **Illegal transitions:** Any transition not listed is invalid. No implicit paths.
- Rule IDs: `RULE-LIFE-*`

#### Section 4: Protocols

Operational procedures spanning multiple entities:

- **4.1 Vector Reporting Protocol** — report schema, mandatory filing, tower verification. Rule IDs: `RULE-VRPT-*`
- **4.2 Landing Checklist** — configurable checks, execution by pilot, failure triggers go-around. Rule IDs: `RULE-LCHK-*`
- **4.3 Emergency Declaration** — trigger conditions, black box final entry, handoff to origin. Rule IDs: `RULE-EMER-*`
- **4.4 Tower Merge Protocol** — full merge sequence (vector verification, queue, rebase check, merge, mark landed), conflict handling. Rule IDs: `RULE-TMRG-*`

#### Section 5: Appendices

- **Appendix A: Rule Index** — flat table of every `RULE-*` identifier with one-line summary and section reference.

#### Rule ID Conventions

- All rule identifiers are prefixed with `RULE-` followed by a section prefix: `CRAFT`, `BBOX`, `PILOT`, `SEAT`, `CTRL`, `ICOM`, `TOWER`, `VEC`, `ORIG`, `LIFE`, `VRPT`, `LCHK`, `EMER`, `TMRG`.
- Rules are numbered sequentially within their prefix: `RULE-CRAFT-1`, `RULE-CRAFT-2`, etc.
- Insertions between existing rules use letter suffixes: `RULE-CTRL-2a`, `RULE-CTRL-2b` — no renumbering.

---

### 2. `packages/types/` — `@atc/types` Package

A new TypeScript package in the monorepo containing pure type definitions, interfaces, enums, and const objects. No runtime logic, no dependencies.

**Structure:**

```
packages/types/
  package.json            # @atc/types, version 0.0.1
  tsconfig.json
  src/
    index.ts              # barrel export
    entities.ts           # Craft, Pilot, Vector, BlackBoxEntry, VectorReport interfaces
    enums.ts              # CraftStatus, SeatType, ControlMode, VectorStatus, BlackBoxEntryType
    lifecycle.ts          # state machine type definitions, transition definitions, preconditions
    permissions.ts        # permissions matrix (seat type → allowed actions)
```

**Contents:**

- **`enums.ts`** — `CraftStatus` (Taxiing, InFlight, LandingChecklist, GoAround, ClearedToLand, Landed, Emergency, ReturnToOrigin), `SeatType` (Captain, FirstOfficer, Jumpseat), `ControlMode` (Exclusive, Shared), `VectorStatus` (Pending, Passed, Failed), `BlackBoxEntryType` (Decision, VectorPassed, GoAround, Conflict, Observation, EmergencyDeclaration). All exhaustive, no implicit values.
- **`entities.ts`** — TypeScript interfaces for `Craft`, `Pilot`, `Vector`, `BlackBoxEntry`, `VectorReport`, `FlightPlan`, `ControlState`. Fields include types and document constraints via JSDoc comments referencing `RULE-*` IDs.
- **`lifecycle.ts`** — `CraftTransition` type with `from`, `to`, `trigger`, and `preconditions` fields. A `TRANSITIONS` const array defining all valid state transitions. Terminal states identified.
- **`permissions.ts`** — A const permissions matrix mapping `SeatType` to allowed actions (`modifyCode`, `holdControls`, `writeBlackBox`, `fileVectorReport`, `declareEmergency`, `requestLandingClearance`).

Rule IDs from the human spec are embedded as JSDoc comments on relevant type definitions for traceability.

---

### 3. `docs/agent/operating-manual.md` — Agent Behavioral Guidance

A markdown document written in second person, injected into agent context at runtime. Tells agents *how to behave*, not *what things are*.

**Structure:**

- **1: Role Briefing** — Written with placeholder tokens (e.g., `{seat_type}`, `{callsign}`) that are populated by the system when the manual is injected into an agent's context. Explains what the assigned seat means practically — permissions, authority, chain of command.
- **2: Flying the Craft** — How to navigate vectors: work in order, verify acceptance criteria, file reports, wait for ATC acknowledgment. What to do when stuck.
- **3: Controls Protocol** — Claiming/releasing controls, exclusive vs. shared, exact handoff phraseology, resolving contention.
- **4: Radio Discipline** — 3W principle, read-back requirements, conciseness rules as direct instructions. Example exchanges for common scenarios.
- **5: Landing** — When to initiate checklist, what to verify, how to request clearance. What a go-around looks like from the pilot's perspective.
- **6: Emergencies** — When to declare, what to record in the black box, what happens next. Bias toward early declaration over repeated futile attempts.
- **7: Black Box Discipline** — What to record and when. Bias toward over-recording. Guidance on categorizing entries (Decision vs. Observation, etc.).

Each section references relevant `RULE-*` IDs from the human spec for traceability.

---

## File Layout Summary

```
docs/
  spec.md                                          # existing brief (unchanged)
  specification.md                                  # formal human spec (NEW)
  agent/
    operating-manual.md                             # agent behavioral guidance (NEW)
  superpowers/
    specs/
      2026-03-26-formal-spec-design.md              # this design document

packages/
  types/                                            # @atc/types (NEW)
    package.json
    tsconfig.json
    src/
      index.ts
      entities.ts
      enums.ts
      lifecycle.ts
      permissions.ts
  core/                                             # @atc/core (existing, will import @atc/types)
    ...
```

## Relationship Between Documents

```
docs/spec.md (brief)
    │
    ├──> docs/specification.md (human spec, source of truth)
    │        │
    │        ├── RULE-* IDs referenced by ──> packages/types/src/*.ts (JSDoc comments)
    │        │
    │        └── RULE-* IDs referenced by ──> docs/agent/operating-manual.md
    │
    └── (retained as informal design notes)
```

## Out of Scope

- Runtime logic or behavior implementation (belongs in `@atc/core`).
- Agent prompt engineering beyond the operating manual structure.
- CI/CD integration or automated rule enforcement.
- The `@atc/core` package implementation — that follows after the spec is written.
