---
title: Formal Specification
sidebar_position: 2
---

# ATC (Air Traffic Control) — Formal Specification

**Version:** 0.1.0
**Status:** Draft
**Date:** 2026-03-26
**Brief:** [`docs/spec.md`](design-brief.md)

## 1. Overview

ATC is an agent orchestration system that coordinates multiple autonomous agents working on concurrent code changes within a shared repository. It uses aviation terminology as its domain language.

This document is the authoritative reference for ATC's domain model, lifecycle, protocols, and invariants. The original design brief (`docs/design-brief.md`) is retained as informal design notes.

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
