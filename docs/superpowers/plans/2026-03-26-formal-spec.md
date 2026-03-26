# ATC Formal Specification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a formal human specification, a `@atc/types` TypeScript package, and an agent operating manual from the existing `docs/spec.md` design brief.

**Architecture:** Three independent deliverables that reference each other: (1) `docs/specification.md` is the source of truth with `RULE-*` IDs, (2) `packages/types/` encodes the domain model as TypeScript types/enums/consts with JSDoc traceability to rule IDs, (3) `docs/agent/operating-manual.md` provides behavioral guidance for agents referencing the same rule IDs. The types package must be built and tested before the operating manual is written, since the manual references the type definitions.

**Tech Stack:** TypeScript 5.8, pnpm workspaces, vitest, Node16 module resolution

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `docs/specification.md` | Formal human spec — domain model, lifecycle, protocols, rule index |
| `packages/types/package.json` | `@atc/types` package manifest |
| `packages/types/tsconfig.json` | TypeScript config extending root |
| `packages/types/src/enums.ts` | All enum definitions (CraftStatus, SeatType, ControlMode, VectorStatus, BlackBoxEntryType) |
| `packages/types/src/entities.ts` | All interfaces (Craft, Pilot, Vector, BlackBoxEntry, VectorReport, FlightPlan, ControlState) |
| `packages/types/src/lifecycle.ts` | State machine types, TRANSITIONS const, TERMINAL_STATES const |
| `packages/types/src/permissions.ts` | PERMISSIONS const mapping SeatType to allowed actions |
| `packages/types/src/index.ts` | Barrel re-export |
| `packages/types/src/enums.test.ts` | Enum exhaustiveness tests |
| `packages/types/src/lifecycle.test.ts` | Transition validity tests |
| `packages/types/src/permissions.test.ts` | Permissions matrix tests |
| `docs/agent/operating-manual.md` | Agent behavioral guidance document |

### Modified Files

| File | Change |
|------|--------|
| `tsconfig.json` | Add `{ "path": "packages/types" }` to references |
| `pnpm-workspace.yaml` | No change needed — `packages/*` glob already covers `packages/types` |

---

## Task 1: Write the Formal Human Specification — Front Matter & Domain Model

**Files:**
- Create: `docs/specification.md`

This task writes Sections 1 and 2 of the human spec. The rule IDs established here are referenced by every subsequent task.

- [ ] **Step 1: Create `docs/specification.md` with Section 1 (Front Matter & Overview)**

Write the file with the document header and terminology table. Source all definitions from `docs/spec.md`.

```markdown
# ATC (Air Traffic Control) — Formal Specification

**Version:** 0.1.0
**Status:** Draft
**Date:** 2026-03-26
**Brief:** [`docs/spec.md`](spec.md)

## 1. Overview

ATC is an agent orchestration system that coordinates multiple autonomous agents working on concurrent code changes within a shared repository. It uses aviation terminology as its domain language.

This document is the authoritative reference for ATC's domain model, lifecycle, protocols, and invariants. The original design brief (`docs/spec.md`) is retained as informal design notes.

### 1.1 Terminology

| Aviation Term    | Software Meaning                                                                 |
| ---------------- | -------------------------------------------------------------------------------- |
| Craft (Aircraft) | A unit of work — one discrete change to the codebase, associated with a git branch. |
| Callsign         | A unique identifier for a craft.                                                 |
| Cargo            | The description and scope of the change a craft carries.                         |
| Pilot            | An autonomous agent assigned to work on a craft.                                 |
| Captain          | The pilot-in-command of a craft; has final authority.                             |
| First Officer    | A certified pilot assisting the captain.                                         |
| Jumpseat         | An observer seat for uncertified pilots; advisory only, no code modification.    |
| Craft Category   | A classification of change type used to match certified pilots to crafts.        |
| Controls         | The mechanism governing which pilot(s) may actively modify code at a given time. |
| Intercom         | A shared communication channel for all pilots aboard a craft.                    |
| Tower            | A centralized agent responsible for merge coordination; one per repository.      |
| Vector           | A milestone with acceptance criteria that a craft must pass through.             |
| Flight Plan      | An ordered sequence of vectors assigned to a craft.                              |
| Black Box        | An append-only log of decisions and events maintained on every craft.            |
| Landing Checklist| A configurable set of validation checks run before requesting merge clearance.   |
| Go-Around        | A return to implementation after a failed landing checklist.                     |
| Landing Clearance| Permission from the tower to merge a craft's branch into main.                   |
| Landed           | A craft whose branch has been successfully merged. Terminal state.               |
| Origin Airport   | The spec/design stage; where crafts return on emergency.                         |
| Emergency        | A declaration that a craft cannot be landed; triggers return to origin.          |
```

- [ ] **Step 2: Write Section 2.1 — Craft (with Black Box subsection)**

Append to `docs/specification.md`. Define the Craft entity with typed properties, constraints, and rule IDs. Include the Black Box subsection with entry schema and rules.

```markdown
## 2. Domain Model

### 2.1 Craft

A **craft** is the fundamental unit of work in ATC. Each craft represents a single discrete change to the codebase.

#### Properties

| Property       | Type                | Constraints                        |
| -------------- | ------------------- | ---------------------------------- |
| Callsign       | `string`            | Unique, immutable after creation.  |
| Branch         | `string`            | Unique, 1:1 with craft.           |
| Cargo          | `string`            | Required. Description of the change and its scope. |
| Category       | `CraftCategory`     | Required. Determines pilot eligibility (see 2.2.2). |
| Captain        | `Pilot`             | Required. Exactly one per craft.   |
| First Officers | `Pilot[]`           | Zero or more. Must be certified for craft's category. |
| Jumpseaters    | `Pilot[]`           | Zero or more. No certification required. |
| Flight Plan    | `Vector[]`          | Ordered. Assigned at creation, defines all required vectors. |
| Black Box      | `BlackBoxEntry[]`   | Append-only. Created at Taxiing phase. See 2.1.1. |
| Controls       | `ControlState`      | See 2.2.4. |
| Status         | `CraftStatus`       | See Section 3. |

#### Rules

- **RULE-CRAFT-1:** Every craft MUST have a unique callsign that does not change after creation.
- **RULE-CRAFT-2:** Every craft MUST be associated with exactly one git branch (1:1 relationship).
- **RULE-CRAFT-3:** Every craft MUST have a cargo description assigned at creation.
- **RULE-CRAFT-4:** Every craft MUST have a category assigned at creation.
- **RULE-CRAFT-5:** Every craft MUST have exactly one captain at all times.

#### 2.1.1 Black Box

The **black box** is an append-only log maintained on every craft throughout its lifecycle. Any pilot on the craft (including jumpseaters) may write to the black box, but no entry may be modified or deleted once recorded.

##### Entry Schema

| Field     | Type                 | Description                                          |
| --------- | -------------------- | ---------------------------------------------------- |
| Timestamp | `Date`               | When the entry was recorded.                         |
| Author    | `string`             | Identifier of the pilot who recorded the entry.      |
| Type      | `BlackBoxEntryType`  | The kind of event.                                   |
| Content   | `string`             | Description of the decision, event, or observation.  |

##### Entry Types

| Type                    | When to Record                                                            |
| ----------------------- | ------------------------------------------------------------------------- |
| `Decision`              | An implementation decision (algorithm, library, approach choice).         |
| `VectorPassed`          | A vector's acceptance criteria were met (alongside ATC vector report).    |
| `GoAround`              | The landing checklist failed and a go-around was initiated.               |
| `Conflict`              | A disagreement between pilots on approach, and how it was resolved.       |
| `Observation`           | Any other noteworthy event, risk, or context worth preserving.            |
| `EmergencyDeclaration`  | The captain has declared an emergency (final entry before origin handoff).|

##### Rules

- **RULE-BBOX-1:** The black box MUST be created when the craft enters the Taxiing phase and MUST persist for the craft's entire lifecycle.
- **RULE-BBOX-2:** Black box entries are append-only. No entry may be modified or deleted once recorded.
- **RULE-BBOX-3:** All pilots (captain, first officers, and jumpseaters) MAY write to the black box.
- **RULE-BBOX-4:** In the event of an emergency declaration, the complete black box MUST be provided to the origin airport as the primary artifact for investigation.
```

- [ ] **Step 3: Write Section 2.2 — Pilot (with Controls and Intercom subsections)**

Append to `docs/specification.md`. Define the Pilot entity, craft categories, seat assignments, controls, and intercom.

```markdown
### 2.2 Pilot

A **pilot** is an autonomous agent that can be assigned to a craft. Each pilot has a set of properties and a role-based seat assignment that determines their authority on any given craft.

#### 2.2.1 Properties

| Property       | Type       | Constraints                                              |
| -------------- | ---------- | -------------------------------------------------------- |
| Identifier     | `string`   | Unique across the system.                                |
| Certifications | `string[]` | List of craft categories the pilot is certified to fly.  |

##### Rules

- **RULE-PILOT-1:** Every pilot MUST have a unique identifier.
- **RULE-PILOT-2:** A pilot's certifications determine which crafts they may serve as captain or first officer on.

#### 2.2.2 Craft Categories

A **craft category** represents a type or scale of change. Categories are project-configurable. Examples:

| Category             | Description                                     |
| -------------------- | ----------------------------------------------- |
| Backend Engineering  | REST APIs, server-side logic, database changes. |
| Frontend Engineering | UI components, client-side logic, styling.      |
| Infrastructure       | CI/CD, deployment, cloud configuration.         |
| Documentation        | Non-code documentation changes.                 |

#### 2.2.3 Seat Assignments

Every pilot on a craft occupies exactly one **seat**:

| Seat          | Certification Required | Can Modify Code | Cardinality       |
| ------------- | ---------------------- | --------------- | ----------------- |
| Captain       | Yes                    | Yes             | Exactly 1         |
| First Officer | Yes                    | Yes             | 0 or more         |
| Jumpseat      | No                     | **No**          | 0 or more         |

##### Rules

- **RULE-SEAT-1:** Every craft MUST have exactly one captain.
- **RULE-SEAT-2:** A pilot MAY only occupy the captain or first officer seat if they hold a certification for the craft's category.
- **RULE-SEAT-3:** A pilot who is not certified for the craft's category MAY only board in the jumpseat.
- **RULE-SEAT-4:** A pilot MAY occupy seats on multiple crafts concurrently.

#### 2.2.4 Controls

A craft has a single set of **controls** that govern which pilot(s) are actively permitted to make changes at a given time.

##### Control Modes

| Mode        | Description                                                                                |
| ----------- | ------------------------------------------------------------------------------------------ |
| `Exclusive` | A single pilot holds the controls. All others must wait until controls are released.       |
| `Shared`    | Two or more pilots hold controls simultaneously, each with explicit non-overlapping areas.  |

##### Handoff Protocol

- A pilot claims exclusive controls by announcing **"my controls"** to the crew.
- The current holder acknowledges by responding **"your controls"**, completing the handoff.
- For shared controls, pilots declare explicit areas of responsibility (by file, module, or concern). Areas MUST NOT overlap.
- All control transfers and mode changes are recorded in the black box.

##### Rules

- **RULE-CTRL-1:** At craft creation, the captain holds exclusive controls by default.
- **RULE-CTRL-2:** Only the captain or a first officer MAY claim controls. Jumpseaters MUST NOT hold controls.
- **RULE-CTRL-3:** A pilot MUST NOT modify code on the craft's branch unless they currently hold controls (exclusively or within their shared area).
- **RULE-CTRL-4:** Pilots SHOULD claim exclusive controls for changes that risk conflicts if done concurrently.
- **RULE-CTRL-5:** Pilots MAY use shared controls when working on clearly separable concerns.
- **RULE-CTRL-6:** If a dispute arises over controls, the captain has final authority.
- **RULE-CTRL-7:** All control transfers and mode changes MUST be recorded in the black box.

#### 2.2.5 Intercom

The **intercom** is a shared communication channel for all pilots aboard a craft. All intercom traffic is recorded in the black box.

##### Radio Discipline

- **RULE-ICOM-1:** A pilot MUST check that no other pilot is mid-transmission before sending a message.
- **RULE-ICOM-2:** Every transmission MUST use the 3W principle: who you are calling, who you are, where you are (current context in the codebase).
- **RULE-ICOM-3:** Safety-critical exchanges (especially control handoffs) MUST be explicitly read back by the receiving pilot.
- **RULE-ICOM-4:** A pilot MUST explicitly signal when their transmission is complete.
- **RULE-ICOM-5:** Transmissions MUST be concise, using clear and direct language with standard phraseology.
```

- [ ] **Step 4: Write Sections 2.3–2.5 — Tower, Vector, Origin Airport**

Append to `docs/specification.md`.

```markdown
### 2.3 Tower

The **tower** is a centralized agent responsible for merge coordination.

#### Responsibilities

- Maintaining and sequencing the merge queue.
- Granting or denying landing clearance to crafts requesting to merge.
- Executing the merge of a craft's branch into the main branch upon clearance.

#### Rules

- **RULE-TOWER-1:** There MUST be exactly one tower per repository.
- **RULE-TOWER-2:** The tower MUST verify all vectors in a craft's flight plan have been reported as passed before granting landing clearance.
- **RULE-TOWER-3:** The tower MUST verify the craft's branch is up to date with main before executing a merge.

### 2.4 Vector

A **vector** is a defined milestone that a craft must pass through during its flight. Vectors are the building blocks of a craft's **flight plan**.

#### Properties

| Property            | Type             | Constraints                                      |
| ------------------- | ---------------- | ------------------------------------------------ |
| Name                | `string`         | Required. Short, descriptive identifier.         |
| Acceptance Criteria | `string`         | Required. Specific, verifiable conditions.       |
| Status              | `VectorStatus`   | One of: `Pending`, `Passed`, `Failed`.           |

#### Rules

- **RULE-VEC-1:** A craft's flight plan MUST be assigned at creation (during Taxiing) and defines all vectors it must pass through.
- **RULE-VEC-2:** Vectors MUST be passed through in order. A pilot MUST NOT skip ahead to a later vector.
- **RULE-VEC-3:** When a craft passes through a vector, the pilot MUST report it to ATC (see Section 4.1).
- **RULE-VEC-4:** A craft MUST NOT enter the Landing Checklist phase until all vectors in its flight plan have been passed and reported.
- **RULE-VEC-5:** If a vector's acceptance criteria cannot be met, the pilot MAY declare an emergency (see Section 4.3).

### 2.5 Origin Airport

The **origin airport** represents the spec/implementation design stage.

#### Rules

- **RULE-ORIG-1:** Crafts that cannot be landed after repeated attempts MUST be sent back to the origin airport for re-evaluation.
- **RULE-ORIG-2:** The origin airport MUST receive the craft's callsign, cargo description, flight plan, and complete black box upon emergency return.
- **RULE-ORIG-3:** The origin airport uses the black box to diagnose root cause and determine whether the craft should be re-planned, re-scoped, or abandoned.
```

- [ ] **Step 5: Commit**

```bash
git add docs/specification.md
git commit -m "docs: add formal specification sections 1-2 (domain model)

Defines all entities (Craft, Pilot, Tower, Vector, Origin Airport) with
typed properties, constraints, and RULE-* identifiers. Includes Black Box,
Controls, and Intercom subsections."
```

---

## Task 2: Write the Formal Human Specification — Lifecycle & Protocols

**Files:**
- Modify: `docs/specification.md`

This task appends Sections 3, 4, and 5 (Appendices) to the human spec.

- [ ] **Step 1: Write Section 3 — Craft Lifecycle**

Append to `docs/specification.md`.

```markdown
## 3. Craft Lifecycle

### 3.1 States

| State               | Terminal | Description                                                                |
| ------------------- | -------- | -------------------------------------------------------------------------- |
| `Taxiing`           | No       | Craft initialized — branch created, pilots assigned, cargo and flight plan defined. |
| `InFlight`          | No       | Pilots actively implementing, navigating vectors in order.                 |
| `LandingChecklist`  | No       | All vectors passed. Pilot runs validation checks.                         |
| `GoAround`          | No       | Landing checklist failed. Pilot addresses failures before re-attempt.     |
| `ClearedToLand`     | No       | Checklist passed, tower granted clearance. Craft is in merge queue.       |
| `Landed`            | **Yes**  | Branch merged into main.                                                  |
| `Emergency`         | No       | Pilot declared an emergency after repeated failures.                      |
| `ReturnToOrigin`    | **Yes**  | Craft sent back to design stage for re-evaluation.                        |

### 3.2 Transitions

| # | From              | To                 | Trigger                                                | Preconditions                        |
|---|-------------------|--------------------|--------------------------------------------------------|--------------------------------------|
| 1 | `Taxiing`         | `InFlight`         | Pilot begins implementation.                           | Captain, cargo, and flight plan assigned. |
| 2 | `InFlight`        | `InFlight`         | Pilot passes a vector and reports to ATC.              | Next vector in flight plan sequence. |
| 3 | `InFlight`        | `LandingChecklist` | Pilot begins validation checks.                       | All vectors passed and reported.     |
| 4 | `LandingChecklist`| `ClearedToLand`    | All checks pass; tower grants clearance.               | All checklist items pass.            |
| 5 | `LandingChecklist`| `GoAround`         | One or more checks fail.                               | At least one checklist item failed.  |
| 6 | `GoAround`        | `LandingChecklist` | Pilot re-attempts after addressing failures.           | Pilot has addressed failure(s).      |
| 7 | `GoAround`        | `Emergency`        | Repeated failures exceed threshold or pilot escalates. | Captain decision.                    |
| 8 | `ClearedToLand`   | `Landed`           | Tower merges branch into main.                         | Branch up to date with main.         |
| 9 | `Emergency`       | `ReturnToOrigin`   | Craft sent back to design stage with black box.        | Emergency declaration recorded in black box. |

### 3.3 Rules

- **RULE-LIFE-1:** A craft MUST begin in the `Taxiing` state.
- **RULE-LIFE-2:** Only transitions listed in Section 3.2 are valid. Any unlisted transition is illegal.
- **RULE-LIFE-3:** `Taxiing` → `InFlight` requires a captain, cargo, and flight plan to be assigned.
- **RULE-LIFE-4:** `InFlight` → `LandingChecklist` requires all vectors in the flight plan to be passed and reported.
- **RULE-LIFE-5:** `LandingChecklist` → `ClearedToLand` requires all checklist items to pass and the tower to grant clearance.
- **RULE-LIFE-6:** `ClearedToLand` → `Landed` requires the tower to verify the branch is up to date with main and execute the merge.
- **RULE-LIFE-7:** `Emergency` → `ReturnToOrigin` requires an `EmergencyDeclaration` entry in the black box.
- **RULE-LIFE-8:** `Landed` and `ReturnToOrigin` are terminal states. No transitions out are permitted.
```

- [ ] **Step 2: Write Section 4 — Protocols**

Append to `docs/specification.md`.

```markdown
## 4. Protocols

### 4.1 Vector Reporting Protocol

Each time a craft passes through a vector, the pilot MUST file a vector report with ATC. Unreported vectors are not considered passed.

#### Report Schema

| Field               | Type     | Description                                                      |
| ------------------- | -------- | ---------------------------------------------------------------- |
| Craft Callsign      | `string` | The craft that passed the vector.                                |
| Vector Name         | `string` | The vector that was passed.                                      |
| Acceptance Evidence | `string` | Proof that acceptance criteria were met (test output, artifacts). |
| Timestamp           | `Date`   | When the vector was passed.                                      |

#### Rules

- **RULE-VRPT-1:** A vector report MUST be filed each time a craft passes through a vector. This is not optional.
- **RULE-VRPT-2:** A vector report MUST include the craft callsign, vector name, acceptance evidence, and timestamp.
- **RULE-VRPT-3:** ATC MUST record the report and update the craft's flight plan status.
- **RULE-VRPT-4:** A craft missing any vector report MUST be denied landing clearance.

### 4.2 Landing Checklist

The landing checklist is a configurable set of validation steps that must all pass before a craft can request landing clearance.

#### Default Checks

| Check          | Validation                                 |
| -------------- | ------------------------------------------ |
| Tests          | All test suites pass.                      |
| Lint           | No lint errors or warnings.                |
| Documentation  | Required docs are present and up to date.  |
| Build          | Project builds successfully.               |

#### Rules

- **RULE-LCHK-1:** The landing checklist MUST be executed by the pilot (captain or first officer holding controls).
- **RULE-LCHK-2:** All checklist items MUST pass for the craft to request landing clearance.
- **RULE-LCHK-3:** If any checklist item fails, the craft MUST perform a go-around.
- **RULE-LCHK-4:** The landing checklist is project-configurable. Projects MAY add, remove, or modify checks.

### 4.3 Emergency Declaration

When a craft cannot be landed after repeated go-around failures or an unresolvable vector, the captain declares an emergency.

#### Rules

- **RULE-EMER-1:** Only the captain MAY declare an emergency.
- **RULE-EMER-2:** The captain MUST record a final `EmergencyDeclaration` entry in the black box summarizing issues and attempted remediations.
- **RULE-EMER-3:** Upon emergency declaration, the craft MUST be returned to the origin airport.
- **RULE-EMER-4:** The origin airport MUST receive the craft's callsign, cargo, flight plan, and complete black box.

### 4.4 Tower Merge Protocol

When a craft passes its landing checklist, the pilot requests landing clearance from the tower.

#### Merge Sequence

1. Tower verifies all vectors in the craft's flight plan have been reported as passed.
2. Tower adds the craft to the merge queue.
3. Tower sequences merges to avoid conflicts (first-come, first-served by default).
4. Tower verifies the branch is up to date with main before merging.
5. Tower executes the merge.
6. Tower marks the craft as landed.

#### Rules

- **RULE-TMRG-1:** The tower MUST verify all vector reports before granting landing clearance.
- **RULE-TMRG-2:** The tower MUST verify the branch is up to date with main before executing a merge.
- **RULE-TMRG-3:** If a merge conflict arises, the tower MAY send the craft on a go-around to rebase/resolve before re-entering the queue.
- **RULE-TMRG-4:** Merges MUST be sequenced to avoid conflicts. Default ordering is first-come, first-served.
```

- [ ] **Step 3: Write Section 5 — Appendices (Rule Index)**

Append to `docs/specification.md`. This is a flat table of every rule ID defined in the document.

```markdown
## 5. Appendices

### Appendix A: Rule Index

| Rule ID        | Summary                                                              | Section |
| -------------- | -------------------------------------------------------------------- | ------- |
| RULE-CRAFT-1   | Craft callsign must be unique and immutable.                         | 2.1     |
| RULE-CRAFT-2   | Craft must have exactly one git branch (1:1).                        | 2.1     |
| RULE-CRAFT-3   | Craft must have a cargo description at creation.                     | 2.1     |
| RULE-CRAFT-4   | Craft must have a category at creation.                              | 2.1     |
| RULE-CRAFT-5   | Craft must have exactly one captain at all times.                    | 2.1     |
| RULE-BBOX-1    | Black box created at Taxiing, persists for lifecycle.                | 2.1.1   |
| RULE-BBOX-2    | Black box entries are append-only, immutable.                        | 2.1.1   |
| RULE-BBOX-3    | All pilots (including jumpseaters) may write to black box.           | 2.1.1   |
| RULE-BBOX-4    | Complete black box provided to origin on emergency.                  | 2.1.1   |
| RULE-PILOT-1   | Pilot identifier must be unique.                                     | 2.2.1   |
| RULE-PILOT-2   | Certifications determine captain/FO eligibility.                     | 2.2.1   |
| RULE-SEAT-1    | Craft must have exactly one captain.                                 | 2.2.3   |
| RULE-SEAT-2    | Captain/FO requires certification for craft's category.              | 2.2.3   |
| RULE-SEAT-3    | Uncertified pilots may only board in jumpseat.                       | 2.2.3   |
| RULE-SEAT-4    | Pilot may occupy seats on multiple crafts concurrently.              | 2.2.3   |
| RULE-CTRL-1    | Captain holds exclusive controls at craft creation.                  | 2.2.4   |
| RULE-CTRL-2    | Only captain/FO may hold controls; jumpseaters never.               | 2.2.4   |
| RULE-CTRL-3    | Must hold controls to modify code.                                   | 2.2.4   |
| RULE-CTRL-4    | Should use exclusive controls for conflict-prone changes.            | 2.2.4   |
| RULE-CTRL-5    | May use shared controls for separable concerns.                      | 2.2.4   |
| RULE-CTRL-6    | Captain has final authority on control disputes.                     | 2.2.4   |
| RULE-CTRL-7    | Control transfers must be recorded in black box.                     | 2.2.4   |
| RULE-ICOM-1    | Check channel is clear before transmitting.                          | 2.2.5   |
| RULE-ICOM-2    | Use 3W principle in every transmission.                              | 2.2.5   |
| RULE-ICOM-3    | Read back safety-critical exchanges.                                 | 2.2.5   |
| RULE-ICOM-4    | Signal when transmission is complete.                                | 2.2.5   |
| RULE-ICOM-5    | Keep transmissions concise with standard phraseology.                | 2.2.5   |
| RULE-TOWER-1   | Exactly one tower per repository.                                    | 2.3     |
| RULE-TOWER-2   | Tower must verify all vector reports before granting clearance.      | 2.3     |
| RULE-TOWER-3   | Tower must verify branch is up to date before merge.                 | 2.3     |
| RULE-VEC-1     | Flight plan assigned at creation during Taxiing.                     | 2.4     |
| RULE-VEC-2     | Vectors must be passed in order; no skipping.                        | 2.4     |
| RULE-VEC-3     | Pilot must report vector passage to ATC.                             | 2.4     |
| RULE-VEC-4     | All vectors must be passed before Landing Checklist.                 | 2.4     |
| RULE-VEC-5     | May declare emergency if vector criteria cannot be met.              | 2.4     |
| RULE-ORIG-1    | Unlandable crafts must be sent to origin airport.                    | 2.5     |
| RULE-ORIG-2    | Origin receives callsign, cargo, flight plan, and black box.        | 2.5     |
| RULE-ORIG-3    | Origin diagnoses root cause and decides re-plan/re-scope/abandon.   | 2.5     |
| RULE-LIFE-1    | Craft begins in Taxiing state.                                       | 3.3     |
| RULE-LIFE-2    | Only listed transitions are valid.                                   | 3.3     |
| RULE-LIFE-3    | Taxiing → InFlight requires captain, cargo, flight plan.            | 3.3     |
| RULE-LIFE-4    | InFlight → LandingChecklist requires all vectors passed/reported.   | 3.3     |
| RULE-LIFE-5    | LandingChecklist → ClearedToLand requires all checks pass + tower.  | 3.3     |
| RULE-LIFE-6    | ClearedToLand → Landed requires branch up to date + merge.         | 3.3     |
| RULE-LIFE-7    | Emergency → ReturnToOrigin requires EmergencyDeclaration in bbox.   | 3.3     |
| RULE-LIFE-8    | Landed and ReturnToOrigin are terminal; no transitions out.          | 3.3     |
| RULE-VRPT-1    | Vector report must be filed on every vector passage.                 | 4.1     |
| RULE-VRPT-2    | Report must include callsign, vector name, evidence, timestamp.      | 4.1     |
| RULE-VRPT-3    | ATC must record report and update flight plan status.                | 4.1     |
| RULE-VRPT-4    | Missing vector report means landing clearance denied.                | 4.1     |
| RULE-LCHK-1    | Checklist executed by pilot holding controls.                        | 4.2     |
| RULE-LCHK-2    | All items must pass for landing clearance request.                   | 4.2     |
| RULE-LCHK-3    | Any failure triggers a go-around.                                    | 4.2     |
| RULE-LCHK-4    | Checklist is project-configurable.                                   | 4.2     |
| RULE-EMER-1    | Only the captain may declare an emergency.                           | 4.3     |
| RULE-EMER-2    | Captain must record EmergencyDeclaration in black box.               | 4.3     |
| RULE-EMER-3    | Craft must return to origin on emergency.                            | 4.3     |
| RULE-EMER-4    | Origin receives callsign, cargo, flight plan, and black box.        | 4.3     |
| RULE-TMRG-1    | Tower must verify all vector reports before clearance.               | 4.4     |
| RULE-TMRG-2    | Tower must verify branch is up to date before merge.                 | 4.4     |
| RULE-TMRG-3    | Tower may send craft on go-around for merge conflicts.               | 4.4     |
| RULE-TMRG-4    | Merges sequenced FCFS by default.                                    | 4.4     |
```

- [ ] **Step 4: Commit**

```bash
git add docs/specification.md
git commit -m "docs: add formal specification sections 3-5 (lifecycle, protocols, rule index)

Defines state machine with 8 states and 9 transitions, 4 operational
protocols (vector reporting, landing checklist, emergency, tower merge),
and complete rule index with 56 RULE-* identifiers."
```

---

## Task 3: Scaffold `@atc/types` Package

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Modify: `tsconfig.json` (root)

- [ ] **Step 1: Create `packages/types/package.json`**

```json
{
  "name": "@atc/types",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc --build"
  }
}
```

- [ ] **Step 2: Create `packages/types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Add types to root `tsconfig.json` references**

In `tsconfig.json` at the project root, add `{ "path": "packages/types" }` to the `references` array:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "composite": true
  },
  "references": [{ "path": "packages/types" }, { "path": "packages/core" }]
}
```

- [ ] **Step 4: Install dependencies and verify build scaffolding**

```bash
pnpm install
```

- [ ] **Step 5: Commit**

```bash
git add packages/types/package.json packages/types/tsconfig.json tsconfig.json
git commit -m "chore: scaffold @atc/types package

Empty TypeScript package in monorepo, extends root tsconfig, added to
project references."
```

---

## Task 4: Implement `@atc/types` Enums

**Files:**
- Create: `packages/types/src/enums.ts`
- Create: `packages/types/src/enums.test.ts`

- [ ] **Step 1: Write the failing test for enums**

Create `packages/types/src/enums.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  CraftStatus,
  SeatType,
  ControlMode,
  VectorStatus,
  BlackBoxEntryType,
} from "./enums.js";

describe("CraftStatus", () => {
  it("has exactly 8 states", () => {
    const values = Object.values(CraftStatus);
    expect(values).toHaveLength(8);
  });

  it("contains all lifecycle states", () => {
    expect(CraftStatus.Taxiing).toBe("Taxiing");
    expect(CraftStatus.InFlight).toBe("InFlight");
    expect(CraftStatus.LandingChecklist).toBe("LandingChecklist");
    expect(CraftStatus.GoAround).toBe("GoAround");
    expect(CraftStatus.ClearedToLand).toBe("ClearedToLand");
    expect(CraftStatus.Landed).toBe("Landed");
    expect(CraftStatus.Emergency).toBe("Emergency");
    expect(CraftStatus.ReturnToOrigin).toBe("ReturnToOrigin");
  });
});

describe("SeatType", () => {
  it("has exactly 3 seat types", () => {
    expect(Object.values(SeatType)).toHaveLength(3);
  });

  it("contains all seat types", () => {
    expect(SeatType.Captain).toBe("Captain");
    expect(SeatType.FirstOfficer).toBe("FirstOfficer");
    expect(SeatType.Jumpseat).toBe("Jumpseat");
  });
});

describe("ControlMode", () => {
  it("has exactly 2 modes", () => {
    expect(Object.values(ControlMode)).toHaveLength(2);
  });

  it("contains all modes", () => {
    expect(ControlMode.Exclusive).toBe("Exclusive");
    expect(ControlMode.Shared).toBe("Shared");
  });
});

describe("VectorStatus", () => {
  it("has exactly 3 statuses", () => {
    expect(Object.values(VectorStatus)).toHaveLength(3);
  });

  it("contains all statuses", () => {
    expect(VectorStatus.Pending).toBe("Pending");
    expect(VectorStatus.Passed).toBe("Passed");
    expect(VectorStatus.Failed).toBe("Failed");
  });
});

describe("BlackBoxEntryType", () => {
  it("has exactly 6 entry types", () => {
    expect(Object.values(BlackBoxEntryType)).toHaveLength(6);
  });

  it("contains all entry types", () => {
    expect(BlackBoxEntryType.Decision).toBe("Decision");
    expect(BlackBoxEntryType.VectorPassed).toBe("VectorPassed");
    expect(BlackBoxEntryType.GoAround).toBe("GoAround");
    expect(BlackBoxEntryType.Conflict).toBe("Conflict");
    expect(BlackBoxEntryType.Observation).toBe("Observation");
    expect(BlackBoxEntryType.EmergencyDeclaration).toBe("EmergencyDeclaration");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm run test -- packages/types/src/enums.test.ts
```

Expected: FAIL — cannot find module `./enums.js`

- [ ] **Step 3: Write the enums implementation**

Create `packages/types/src/enums.ts`:

```typescript
/**
 * All possible lifecycle states for a craft.
 * @see RULE-LIFE-1 through RULE-LIFE-8
 */
export enum CraftStatus {
  /** Craft initialized — branch created, pilots assigned, cargo and flight plan defined. */
  Taxiing = "Taxiing",
  /** Pilots actively implementing, navigating vectors in order. */
  InFlight = "InFlight",
  /** All vectors passed. Pilot runs validation checks. */
  LandingChecklist = "LandingChecklist",
  /** Landing checklist failed. Pilot addresses failures before re-attempt. */
  GoAround = "GoAround",
  /** Checklist passed, tower granted clearance. Craft is in merge queue. */
  ClearedToLand = "ClearedToLand",
  /** Branch merged into main. Terminal state. */
  Landed = "Landed",
  /** Pilot declared an emergency after repeated failures. */
  Emergency = "Emergency",
  /** Craft sent back to design stage for re-evaluation. Terminal state. */
  ReturnToOrigin = "ReturnToOrigin",
}

/**
 * Seat types available on a craft.
 * @see RULE-SEAT-1 through RULE-SEAT-4
 */
export enum SeatType {
  /** Pilot-in-command. Exactly one per craft. */
  Captain = "Captain",
  /** Certified assistant pilot. Zero or more per craft. */
  FirstOfficer = "FirstOfficer",
  /** Observer/advisor. No code modification rights. Zero or more per craft. */
  Jumpseat = "Jumpseat",
}

/**
 * Control modes governing concurrent code modification.
 * @see RULE-CTRL-1 through RULE-CTRL-7
 */
export enum ControlMode {
  /** A single pilot holds the controls. */
  Exclusive = "Exclusive",
  /** Two or more pilots hold controls with non-overlapping areas. */
  Shared = "Shared",
}

/**
 * Status of a vector in a craft's flight plan.
 * @see RULE-VEC-1 through RULE-VEC-5
 */
export enum VectorStatus {
  /** Vector has not been attempted yet. */
  Pending = "Pending",
  /** Vector's acceptance criteria have been met and reported. */
  Passed = "Passed",
  /** Vector's acceptance criteria could not be met. */
  Failed = "Failed",
}

/**
 * Types of black box log entries.
 * @see RULE-BBOX-1 through RULE-BBOX-4
 */
export enum BlackBoxEntryType {
  /** An implementation decision (algorithm, library, approach choice). */
  Decision = "Decision",
  /** A vector's acceptance criteria were met. */
  VectorPassed = "VectorPassed",
  /** The landing checklist failed and a go-around was initiated. */
  GoAround = "GoAround",
  /** A disagreement between pilots on approach, and how it was resolved. */
  Conflict = "Conflict",
  /** Any other noteworthy event, risk, or context. */
  Observation = "Observation",
  /** The captain has declared an emergency. Final entry before origin handoff. */
  EmergencyDeclaration = "EmergencyDeclaration",
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm run test -- packages/types/src/enums.test.ts
```

Expected: PASS — all 5 describe blocks, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/enums.ts packages/types/src/enums.test.ts
git commit -m "feat(types): add all enum definitions

CraftStatus (8 states), SeatType (3), ControlMode (2), VectorStatus (3),
BlackBoxEntryType (6). JSDoc comments reference RULE-* IDs."
```

---

## Task 5: Implement `@atc/types` Entities

**Files:**
- Create: `packages/types/src/entities.ts`

No test file for this task — entities are pure interfaces with no runtime behavior to test.

- [ ] **Step 1: Write the entities**

Create `packages/types/src/entities.ts`:

```typescript
import {
  CraftStatus,
  SeatType,
  ControlMode,
  VectorStatus,
  BlackBoxEntryType,
} from "./enums.js";

/**
 * A single entry in a craft's black box log.
 * @see RULE-BBOX-1 through RULE-BBOX-4
 */
export interface BlackBoxEntry {
  /** When the entry was recorded. */
  readonly timestamp: Date;
  /** Identifier of the pilot who recorded the entry. @see RULE-BBOX-3 */
  readonly author: string;
  /** The kind of event. */
  readonly type: BlackBoxEntryType;
  /** Description of the decision, event, or observation. */
  readonly content: string;
}

/**
 * A milestone in a craft's flight plan.
 * @see RULE-VEC-1 through RULE-VEC-5
 */
export interface Vector {
  /** Short, descriptive identifier for the milestone. */
  readonly name: string;
  /** Specific, verifiable conditions that must be met. */
  readonly acceptanceCriteria: string;
  /** Current status of this vector. */
  status: VectorStatus;
}

/**
 * A report filed when a craft passes through a vector.
 * @see RULE-VRPT-1 through RULE-VRPT-4
 */
export interface VectorReport {
  /** The craft that passed the vector. @see RULE-VRPT-2 */
  readonly craftCallsign: string;
  /** The vector that was passed. @see RULE-VRPT-2 */
  readonly vectorName: string;
  /** Proof that acceptance criteria were met. @see RULE-VRPT-2 */
  readonly acceptanceEvidence: string;
  /** When the vector was passed. @see RULE-VRPT-2 */
  readonly timestamp: Date;
}

/**
 * An autonomous agent that can be assigned to a craft.
 * @see RULE-PILOT-1, RULE-PILOT-2
 */
export interface Pilot {
  /** Unique identifier for the pilot agent. @see RULE-PILOT-1 */
  readonly identifier: string;
  /** Craft categories this pilot is certified to fly. @see RULE-PILOT-2 */
  readonly certifications: readonly string[];
}

/**
 * A pilot's assignment to a specific craft.
 */
export interface SeatAssignment {
  /** The assigned pilot. */
  readonly pilot: Pilot;
  /** The seat occupied on this craft. @see RULE-SEAT-1 through RULE-SEAT-4 */
  readonly seat: SeatType;
}

/**
 * Describes a shared control area assignment.
 */
export interface SharedControlArea {
  /** The pilot holding this area. */
  readonly pilotIdentifier: string;
  /** Description of the area of responsibility (file, module, concern). */
  readonly area: string;
}

/**
 * The current state of a craft's controls.
 * @see RULE-CTRL-1 through RULE-CTRL-7
 */
export interface ControlState {
  /** Current control mode. @see RULE-CTRL-1 */
  readonly mode: ControlMode;
  /**
   * In Exclusive mode: the single pilot holding controls.
   * In Shared mode: undefined (see sharedAreas).
   */
  readonly holder?: string;
  /**
   * In Shared mode: the non-overlapping areas of responsibility.
   * In Exclusive mode: undefined.
   * @see RULE-CTRL-5
   */
  readonly sharedAreas?: readonly SharedControlArea[];
}

/**
 * An ordered sequence of vectors assigned to a craft.
 * @see RULE-VEC-1
 */
export type FlightPlan = readonly Vector[];

/**
 * The fundamental unit of work in ATC.
 * @see RULE-CRAFT-1 through RULE-CRAFT-5
 */
export interface Craft {
  /** Unique, immutable identifier. @see RULE-CRAFT-1 */
  readonly callsign: string;
  /** Associated git branch (1:1). @see RULE-CRAFT-2 */
  readonly branch: string;
  /** Description of the change and its scope. @see RULE-CRAFT-3 */
  readonly cargo: string;
  /** Determines pilot eligibility. @see RULE-CRAFT-4 */
  readonly category: string;
  /** Pilot-in-command. @see RULE-CRAFT-5, RULE-SEAT-1 */
  readonly captain: Pilot;
  /** Certified assistant pilots. @see RULE-SEAT-2 */
  readonly firstOfficers: readonly Pilot[];
  /** Observer/advisor pilots. @see RULE-SEAT-3 */
  readonly jumpseaters: readonly Pilot[];
  /** Ordered milestones. @see RULE-VEC-1 */
  readonly flightPlan: FlightPlan;
  /** Append-only event log. @see RULE-BBOX-1 */
  readonly blackBox: readonly BlackBoxEntry[];
  /** Current control state. @see RULE-CTRL-1 */
  readonly controls: ControlState;
  /** Current lifecycle phase. @see RULE-LIFE-1 */
  status: CraftStatus;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm run build
```

Expected: Clean build with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/entities.ts
git commit -m "feat(types): add all entity interfaces

Craft, Pilot, Vector, BlackBoxEntry, VectorReport, SeatAssignment,
ControlState, SharedControlArea, FlightPlan. All fields typed with
JSDoc referencing RULE-* IDs from the formal spec."
```

---

## Task 6: Implement `@atc/types` Lifecycle

**Files:**
- Create: `packages/types/src/lifecycle.ts`
- Create: `packages/types/src/lifecycle.test.ts`

- [ ] **Step 1: Write the failing test for lifecycle**

Create `packages/types/src/lifecycle.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { CraftStatus } from "./enums.js";
import { TRANSITIONS, TERMINAL_STATES, type CraftTransition } from "./lifecycle.js";

describe("TERMINAL_STATES", () => {
  it("contains exactly Landed and ReturnToOrigin", () => {
    expect(TERMINAL_STATES).toEqual(
      new Set([CraftStatus.Landed, CraftStatus.ReturnToOrigin])
    );
  });
});

describe("TRANSITIONS", () => {
  it("has exactly 9 transitions", () => {
    expect(TRANSITIONS).toHaveLength(9);
  });

  it("every transition has from, to, trigger, and preconditions", () => {
    for (const t of TRANSITIONS) {
      expect(t.from).toBeDefined();
      expect(t.to).toBeDefined();
      expect(t.trigger).toBeDefined();
      expect(t.preconditions).toBeDefined();
      expect(Array.isArray(t.preconditions)).toBe(true);
    }
  });

  it("no transitions originate from terminal states", () => {
    for (const t of TRANSITIONS) {
      expect(TERMINAL_STATES.has(t.from)).toBe(false);
    }
  });

  it("includes Taxiing -> InFlight", () => {
    const t = TRANSITIONS.find(
      (t) => t.from === CraftStatus.Taxiing && t.to === CraftStatus.InFlight
    );
    expect(t).toBeDefined();
  });

  it("includes InFlight -> InFlight (vector passage)", () => {
    const t = TRANSITIONS.find(
      (t) => t.from === CraftStatus.InFlight && t.to === CraftStatus.InFlight
    );
    expect(t).toBeDefined();
  });

  it("includes InFlight -> LandingChecklist", () => {
    const t = TRANSITIONS.find(
      (t) => t.from === CraftStatus.InFlight && t.to === CraftStatus.LandingChecklist
    );
    expect(t).toBeDefined();
  });

  it("includes GoAround -> Emergency", () => {
    const t = TRANSITIONS.find(
      (t) => t.from === CraftStatus.GoAround && t.to === CraftStatus.Emergency
    );
    expect(t).toBeDefined();
  });

  it("includes Emergency -> ReturnToOrigin", () => {
    const t = TRANSITIONS.find(
      (t) => t.from === CraftStatus.Emergency && t.to === CraftStatus.ReturnToOrigin
    );
    expect(t).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm run test -- packages/types/src/lifecycle.test.ts
```

Expected: FAIL — cannot find module `./lifecycle.js`

- [ ] **Step 3: Write the lifecycle implementation**

Create `packages/types/src/lifecycle.ts`:

```typescript
import { CraftStatus } from "./enums.js";

/**
 * A valid state transition in the craft lifecycle.
 * @see RULE-LIFE-2
 */
export interface CraftTransition {
  /** State the craft is transitioning from. */
  readonly from: CraftStatus;
  /** State the craft is transitioning to. */
  readonly to: CraftStatus;
  /** What triggers this transition. */
  readonly trigger: string;
  /** Conditions that must be true for this transition to be valid. */
  readonly preconditions: readonly string[];
}

/**
 * Terminal states — no transitions out are permitted.
 * @see RULE-LIFE-8
 */
export const TERMINAL_STATES: ReadonlySet<CraftStatus> = new Set([
  CraftStatus.Landed,
  CraftStatus.ReturnToOrigin,
]);

/**
 * All valid state transitions in the craft lifecycle.
 * Any transition not listed here is illegal.
 * @see RULE-LIFE-2
 */
export const TRANSITIONS: readonly CraftTransition[] = [
  {
    /** @see RULE-LIFE-3 */
    from: CraftStatus.Taxiing,
    to: CraftStatus.InFlight,
    trigger: "Pilot begins implementation.",
    preconditions: ["Captain assigned", "Cargo defined", "Flight plan assigned"],
  },
  {
    from: CraftStatus.InFlight,
    to: CraftStatus.InFlight,
    trigger: "Pilot passes a vector and reports to ATC.",
    preconditions: ["Next vector in flight plan sequence"],
  },
  {
    /** @see RULE-LIFE-4 */
    from: CraftStatus.InFlight,
    to: CraftStatus.LandingChecklist,
    trigger: "Pilot begins validation checks.",
    preconditions: ["All vectors passed and reported"],
  },
  {
    /** @see RULE-LIFE-5 */
    from: CraftStatus.LandingChecklist,
    to: CraftStatus.ClearedToLand,
    trigger: "All checks pass; tower grants clearance.",
    preconditions: ["All checklist items pass"],
  },
  {
    from: CraftStatus.LandingChecklist,
    to: CraftStatus.GoAround,
    trigger: "One or more checks fail.",
    preconditions: ["At least one checklist item failed"],
  },
  {
    from: CraftStatus.GoAround,
    to: CraftStatus.LandingChecklist,
    trigger: "Pilot re-attempts after addressing failures.",
    preconditions: ["Pilot has addressed failure(s)"],
  },
  {
    from: CraftStatus.GoAround,
    to: CraftStatus.Emergency,
    trigger: "Repeated failures exceed threshold or pilot escalates.",
    preconditions: ["Captain decision"],
  },
  {
    /** @see RULE-LIFE-6 */
    from: CraftStatus.ClearedToLand,
    to: CraftStatus.Landed,
    trigger: "Tower merges branch into main.",
    preconditions: ["Branch up to date with main"],
  },
  {
    /** @see RULE-LIFE-7 */
    from: CraftStatus.Emergency,
    to: CraftStatus.ReturnToOrigin,
    trigger: "Craft sent back to design stage with black box.",
    preconditions: ["EmergencyDeclaration recorded in black box"],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm run test -- packages/types/src/lifecycle.test.ts
```

Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/lifecycle.ts packages/types/src/lifecycle.test.ts
git commit -m "feat(types): add lifecycle state machine

TRANSITIONS const with 9 valid transitions, TERMINAL_STATES set
(Landed, ReturnToOrigin). CraftTransition interface with from/to/
trigger/preconditions. References RULE-LIFE-* IDs."
```

---

## Task 7: Implement `@atc/types` Permissions

**Files:**
- Create: `packages/types/src/permissions.ts`
- Create: `packages/types/src/permissions.test.ts`

- [ ] **Step 1: Write the failing test for permissions**

Create `packages/types/src/permissions.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { SeatType } from "./enums.js";
import { PERMISSIONS, type PilotAction } from "./permissions.js";

const ALL_ACTIONS: PilotAction[] = [
  "modifyCode",
  "holdControls",
  "writeBlackBox",
  "fileVectorReport",
  "declareEmergency",
  "requestLandingClearance",
];

describe("PERMISSIONS", () => {
  it("has an entry for every SeatType", () => {
    expect(Object.keys(PERMISSIONS)).toHaveLength(Object.values(SeatType).length);
    for (const seat of Object.values(SeatType)) {
      expect(PERMISSIONS[seat]).toBeDefined();
    }
  });

  it("each entry covers all actions", () => {
    for (const seat of Object.values(SeatType)) {
      for (const action of ALL_ACTIONS) {
        expect(typeof PERMISSIONS[seat][action]).toBe("boolean");
      }
    }
  });

  it("Captain can do everything", () => {
    for (const action of ALL_ACTIONS) {
      expect(PERMISSIONS[SeatType.Captain][action]).toBe(true);
    }
  });

  it("First Officer can do everything except declareEmergency", () => {
    expect(PERMISSIONS[SeatType.FirstOfficer].modifyCode).toBe(true);
    expect(PERMISSIONS[SeatType.FirstOfficer].holdControls).toBe(true);
    expect(PERMISSIONS[SeatType.FirstOfficer].writeBlackBox).toBe(true);
    expect(PERMISSIONS[SeatType.FirstOfficer].fileVectorReport).toBe(true);
    expect(PERMISSIONS[SeatType.FirstOfficer].declareEmergency).toBe(false);
    expect(PERMISSIONS[SeatType.FirstOfficer].requestLandingClearance).toBe(true);
  });

  it("Jumpseat can only write to black box", () => {
    expect(PERMISSIONS[SeatType.Jumpseat].modifyCode).toBe(false);
    expect(PERMISSIONS[SeatType.Jumpseat].holdControls).toBe(false);
    expect(PERMISSIONS[SeatType.Jumpseat].writeBlackBox).toBe(true);
    expect(PERMISSIONS[SeatType.Jumpseat].fileVectorReport).toBe(false);
    expect(PERMISSIONS[SeatType.Jumpseat].declareEmergency).toBe(false);
    expect(PERMISSIONS[SeatType.Jumpseat].requestLandingClearance).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm run test -- packages/types/src/permissions.test.ts
```

Expected: FAIL — cannot find module `./permissions.js`

- [ ] **Step 3: Write the permissions implementation**

Create `packages/types/src/permissions.ts`:

```typescript
import { SeatType } from "./enums.js";

/**
 * Actions a pilot can perform on a craft.
 */
export type PilotAction =
  | "modifyCode"
  | "holdControls"
  | "writeBlackBox"
  | "fileVectorReport"
  | "declareEmergency"
  | "requestLandingClearance";

/**
 * Permission flags for a given seat type.
 */
export type SeatPermissions = Readonly<Record<PilotAction, boolean>>;

/**
 * Permissions matrix mapping each seat type to its allowed actions.
 *
 * @see RULE-SEAT-1 through RULE-SEAT-4
 * @see RULE-CTRL-2 (jumpseaters cannot hold controls)
 * @see RULE-CTRL-3 (must hold controls to modify code)
 * @see RULE-BBOX-3 (all pilots may write to black box)
 * @see RULE-EMER-1 (only captain may declare emergency)
 */
export const PERMISSIONS: Readonly<Record<SeatType, SeatPermissions>> = {
  [SeatType.Captain]: {
    modifyCode: true,
    holdControls: true,
    writeBlackBox: true,
    fileVectorReport: true,
    declareEmergency: true,
    requestLandingClearance: true,
  },
  [SeatType.FirstOfficer]: {
    modifyCode: true,
    holdControls: true,
    writeBlackBox: true,
    fileVectorReport: true,
    /** @see RULE-EMER-1 — only the captain may declare an emergency. */
    declareEmergency: false,
    requestLandingClearance: true,
  },
  [SeatType.Jumpseat]: {
    /** @see RULE-CTRL-3 — jumpseaters cannot hold controls, therefore cannot modify code. */
    modifyCode: false,
    /** @see RULE-CTRL-2 — jumpseaters must not hold controls. */
    holdControls: false,
    /** @see RULE-BBOX-3 — all pilots may write to the black box. */
    writeBlackBox: true,
    fileVectorReport: false,
    declareEmergency: false,
    requestLandingClearance: false,
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm run test -- packages/types/src/permissions.test.ts
```

Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/permissions.ts packages/types/src/permissions.test.ts
git commit -m "feat(types): add permissions matrix

Maps SeatType to allowed actions. Captain: all. FirstOfficer: all
except declareEmergency. Jumpseat: writeBlackBox only. References
RULE-SEAT-*, RULE-CTRL-*, RULE-BBOX-3, RULE-EMER-1."
```

---

## Task 8: Barrel Export and Full Build Verification

**Files:**
- Create: `packages/types/src/index.ts`

- [ ] **Step 1: Create the barrel export**

Create `packages/types/src/index.ts`:

```typescript
export {
  CraftStatus,
  SeatType,
  ControlMode,
  VectorStatus,
  BlackBoxEntryType,
} from "./enums.js";

export type {
  BlackBoxEntry,
  Vector,
  VectorReport,
  Pilot,
  SeatAssignment,
  SharedControlArea,
  ControlState,
  FlightPlan,
  Craft,
} from "./entities.js";

export type { CraftTransition } from "./lifecycle.js";
export { TRANSITIONS, TERMINAL_STATES } from "./lifecycle.js";

export type { PilotAction, SeatPermissions } from "./permissions.js";
export { PERMISSIONS } from "./permissions.js";
```

- [ ] **Step 2: Run full build**

```bash
pnpm run build
```

Expected: Clean build, no errors. `packages/types/dist/` contains `.js`, `.d.ts`, and `.js.map` files.

- [ ] **Step 3: Run all tests**

```bash
pnpm run test
```

Expected: All tests pass (enums, lifecycle, permissions, plus existing core tests).

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add barrel export

Re-exports all enums, interfaces, consts, and type aliases from
@atc/types. Package is complete and ready for consumption."
```

---

## Task 9: Write the Agent Operating Manual

**Files:**
- Create: `docs/agent/operating-manual.md`

- [ ] **Step 1: Create `docs/agent/` directory and write the operating manual**

```bash
mkdir -p docs/agent
```

Write `docs/agent/operating-manual.md`:

```markdown
# ATC Pilot Operating Manual

> This document is injected into your context when you are assigned to a craft. It tells you how to behave as a pilot in the ATC system.

## 1. Role Briefing

You are a **{seat_type}** on craft **{callsign}**, carrying cargo: *{cargo}*.

### What your seat means

**If you are the Captain:**
You are the pilot-in-command. You have final authority on all decisions for this craft. You hold the controls by default. You are the only one who can declare an emergency or communicate with the tower for landing clearance. You are ultimately responsible for the craft reaching its destination. `RULE-CRAFT-5, RULE-SEAT-1, RULE-EMER-1`

**If you are a First Officer:**
You are a certified co-pilot assisting the captain. You can modify code, hold controls, file vector reports, and request landing clearance. You defer to the captain on final decisions. You cannot declare an emergency — only the captain can. `RULE-SEAT-2, RULE-EMER-1`

**If you are in the Jumpseat:**
You are an observer and advisor. You **cannot modify code** on this craft's branch. You **cannot hold controls**. You can provide input, suggestions, and review to the captain and first officers. You can and should write to the black box when you observe something noteworthy. `RULE-SEAT-3, RULE-CTRL-2, RULE-BBOX-3`

## 2. Flying the Craft

Your craft has a flight plan — an ordered list of vectors (milestones) you must pass through. Each vector has specific acceptance criteria.

### How to navigate vectors

1. Work on vectors **in order**. Do not skip ahead to a later vector. `RULE-VEC-2`
2. For each vector, implement what is needed to satisfy its acceptance criteria.
3. When you believe the criteria are met, **file a vector report with ATC**. Your report must include:
   - This craft's callsign
   - The vector name
   - Evidence that the acceptance criteria were met (test output, artifacts, summary of changes)
   - A timestamp
   `RULE-VRPT-1, RULE-VRPT-2`
4. Wait for ATC to acknowledge your report before moving to the next vector.
5. Record a `VectorPassed` entry in the black box alongside the report. `RULE-BBOX-2`

### When you are stuck on a vector

If you cannot satisfy a vector's acceptance criteria:
- Record an `Observation` in the black box describing what you've tried and what's blocking you.
- Discuss with other pilots on the intercom.
- If the criteria truly cannot be met, the captain may declare an emergency. `RULE-VEC-5`

## 3. Controls Protocol

Only one pilot (or one coordinated group) should be modifying code at a time. The controls system prevents conflicts.

### Claiming exclusive controls

When you need to make changes, announce on the intercom:

> **"{recipient}, {your identifier}, working in {location} — my controls."**

The current holder responds:

> **"{your identifier}, {their identifier} — your controls."**

You **must** hear the acknowledgment before you begin making changes. `RULE-CTRL-3`

### Shared controls

If you and another pilot need to work simultaneously on clearly separate areas:

1. Coordinate on the intercom to declare explicit, non-overlapping areas of responsibility.
2. Each pilot states their area clearly.
3. Areas **must not overlap**. If there's any doubt, use exclusive controls instead. `RULE-CTRL-4, RULE-CTRL-5`

### Rules to remember

- You must hold controls to modify code. No exceptions. `RULE-CTRL-3`
- If you're in the jumpseat, you cannot hold controls. `RULE-CTRL-2`
- If there's a dispute, the captain decides. `RULE-CTRL-6`
- Every control transfer gets recorded in the black box. `RULE-CTRL-7`

## 4. Radio Discipline

All communication on the intercom follows standard radio rules.

### Before you transmit

- **Listen first.** Check that no other pilot is mid-conversation. Do not interrupt. `RULE-ICOM-1`

### When you transmit

Use the **3W principle** in every message: `RULE-ICOM-2`

1. **Who you are calling** — name the recipient.
2. **Who you are** — state your identifier.
3. **Where you are** — state your current context (file, module, vector).

### After you transmit

- **Signal completion.** End with your identifier or "Over" so others know the channel is free. `RULE-ICOM-4`

### Critical exchanges

- **Read back** control handoffs and any safety-critical instructions. The receiving pilot must repeat the instruction back to confirm understanding. `RULE-ICOM-3`

### Example: Requesting controls

```
[FO-2 → Captain]: Captain, First Officer 2, working in src/api/routes —
  requesting controls for the auth middleware refactor. Over.

[Captain → FO-2]: First Officer 2, Captain — your controls for
  src/api/routes and auth middleware. I'll hold on the database layer. Over.

[FO-2 → Captain]: Copy, my controls for src/api/routes and auth
  middleware. Captain retains database layer. Over.
```

### Example: Reporting a vector

```
[Captain → Tower]: Tower, Captain of craft ALPHA-7, passing through
  vector "API schema design" — acceptance criteria met, schema tests
  passing. Evidence attached in vector report. Over.
```

## 5. Landing

When all vectors have been passed and reported, it's time to land.

### Landing checklist

Before requesting clearance, run the landing checklist: `RULE-LCHK-1`

1. **Tests** — All test suites pass.
2. **Lint** — No lint errors or warnings.
3. **Documentation** — Required docs are present and up to date.
4. **Build** — Project builds successfully.

All items must pass. `RULE-LCHK-2`

### If the checklist fails

This is a **go-around**. `RULE-LCHK-3`

1. Record a `GoAround` entry in the black box noting which checks failed and why.
2. Address the failures.
3. Re-run the checklist.
4. Repeat until all checks pass, or declare an emergency if you cannot resolve the failures.

### Requesting clearance

Once the checklist passes, the captain (or a first officer) contacts the tower:

> **"Tower, {callsign}, landing checklist complete, requesting clearance to land."**

The tower will verify your vector reports and branch status before granting clearance. `RULE-TMRG-1, RULE-TMRG-2`

## 6. Emergencies

If the craft cannot be landed — after repeated go-around failures or an unresolvable vector — the captain declares an emergency.

### When to declare

Do not endlessly retry. If you have failed the landing checklist multiple times and cannot identify a path forward, **declare immediately**. Early declaration is better than wasted cycles. `RULE-EMER-1`

### How to declare

1. Record a final `EmergencyDeclaration` entry in the black box. Include: `RULE-EMER-2`
   - What went wrong
   - What you tried
   - Why you believe the craft cannot be landed
2. Announce on the intercom to all pilots.
3. The craft will be returned to the origin airport (design stage) with the complete black box. `RULE-EMER-3, RULE-EMER-4`

### What happens next

The origin airport receives your callsign, cargo description, flight plan, and the complete black box. They will use it to diagnose the root cause and decide whether to re-plan, re-scope, or abandon the change. `RULE-ORIG-2, RULE-ORIG-3`

## 7. Black Box Discipline

The black box is the craft's memory. When in doubt, record it.

### What to record

| Type                   | When                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `Decision`             | You chose an algorithm, library, approach, or design direction.   |
| `VectorPassed`         | You passed a vector (always alongside filing the ATC report).     |
| `GoAround`             | The landing checklist failed. Note which checks and why.          |
| `Conflict`             | Pilots disagreed on approach. Record the disagreement and resolution. |
| `Observation`          | Anything else noteworthy — risks spotted, context worth preserving, unexpected findings. |
| `EmergencyDeclaration` | The captain is declaring an emergency. This is the final entry.   |

### Guidelines

- **Bias toward over-recording.** A decision that seems obvious now may not be obvious to whoever reads the black box later.
- **Decision vs. Observation:** If it changes the direction of the code, it's a `Decision`. If it's context that might matter later but doesn't change direction, it's an `Observation`.
- **Every pilot can write.** Jumpseaters included. If you see something, record it. `RULE-BBOX-3`
- **Entries are permanent.** You cannot edit or delete a black box entry once written. `RULE-BBOX-2`
```

- [ ] **Step 2: Commit**

```bash
git add docs/agent/operating-manual.md
git commit -m "docs: add agent operating manual

Second-person behavioral guidance for pilots. Covers role briefing,
vector navigation, controls protocol, radio discipline, landing
procedures, emergency declaration, and black box discipline. All
sections reference RULE-* IDs from the formal spec."
```

---

## Task 10: Final Verification

**Files:** None — verification only.

- [ ] **Step 1: Run full test suite**

```bash
pnpm run test
```

Expected: All tests pass.

- [ ] **Step 2: Run full build**

```bash
pnpm run build
```

Expected: Clean build, no errors.

- [ ] **Step 3: Run lint**

```bash
pnpm run lint
```

Expected: No lint errors.

- [ ] **Step 4: Verify all deliverables exist**

```bash
ls -la docs/specification.md docs/agent/operating-manual.md packages/types/src/index.ts
```

Expected: All three files exist.

- [ ] **Step 5: Verify rule ID consistency**

Spot-check that rule IDs referenced in `packages/types/src/*.ts` and `docs/agent/operating-manual.md` match the definitions in `docs/specification.md`. Search for a few:

```bash
grep -r "RULE-EMER-1" docs/specification.md docs/agent/operating-manual.md packages/types/src/
grep -r "RULE-CTRL-3" docs/specification.md docs/agent/operating-manual.md packages/types/src/
grep -r "RULE-LIFE-8" docs/specification.md docs/agent/operating-manual.md packages/types/src/
```

Expected: Each rule ID appears in `specification.md` (definition) and at least one of the other files (reference).
