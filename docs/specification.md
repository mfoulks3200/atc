# ATC (Air Traffic Control) — Formal Specification

**Version:** 0.4.0
**Status:** Draft
**Date:** 2026-04-28
**Brief:** [`docs/overview.md`](overview.md)

**Changelog:**
- 0.4.0 (2026-04-28): Add VSDD adversarial review rules (RULE-VEC-6 through RULE-VEC-9, RULE-CTRL-3a). Introduces `adversarial_review` vector type with reviewer identity constraint and mandatory controls handoff.
- 0.3.0 (2026-04-21): Add UX Review protocol (§4.7, RULE-UXR-1 through RULE-UXR-5).
- 0.2.0 (2026-04-21): Add Spec-Driven Development protocol (§2.7, §4.6, RULE-SDD-1 through RULE-SDD-17).

## 1. Overview

ATC is an agent orchestration system that coordinates multiple autonomous agents working on concurrent code changes within a shared repository. It uses aviation terminology as its domain language.

This document is the authoritative reference for ATC's domain model, lifecycle, protocols, and invariants. The original design brief (`docs/overview.md`) is retained as informal design notes.

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
| Checklist        | A configurable, ordered list of validation tasks bound to lifecycle events.      |
| Checklist Template | A reusable checklist definition that can be bound to events and craft categories. |
| Lifecycle Event  | A hookable moment in the craft lifecycle (e.g., before takeoff, after landing).  |
| Landing Checklist| A checklist bound to the `before:landing-check` event. Legacy term for the pre-landing checklist. |
| Go-Around        | A return to implementation after a failed checklist or landing attempt.          |
| Landing Clearance| Permission from the tower to merge a craft's branch into main.                   |
| Landed           | A craft whose branch has been successfully merged. Terminal state.               |
| Origin Airport   | The spec/design stage; where crafts return on emergency.                         |
| Emergency        | A declaration that a craft cannot be landed; triggers return to origin.          |
| Temporary Flight Restriction (TFR) | An externally imposed pause on agent activity, scoped globally, per-project, or per-craft. |
| Spec Document    | A structured YAML/JSON document that fully describes a proposed craft — cargo, category, vectors, and pilot hints — submitted to ATC to create a craft automatically. |
| Spec-Driven Development (SDD) | The protocol by which ATC automatically creates and optionally launches a craft from a submitted spec document. |
| Selection Count  | A per-pilot monotonic counter tracking how many times a pilot has been auto-selected as captain or first officer, used for equitable workload distribution in SDD. |
| Adversarial Review Vector | A vector of type `adversarial_review` in a flight plan. Requires a designated reviewer pilot who is different from the pilot who completed the preceding vector, and mandates an exclusive controls handoff before the review begins. |

## 2. Domain Model

### 2.1 Craft

A **craft** is the fundamental unit of work in ATC. Each craft represents a single discrete change to the codebase.

#### Properties

| Property       | Type                | Constraints                        |
| -------------- | ------------------- | ---------------------------------- |
| Callsign       | `string`            | Unique, immutable after creation.  |
| Created At     | `Date`              | Required. Timestamp when the craft entered the Taxiing phase. |
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
- **RULE-CRAFT-6:** Every craft MUST record a creation timestamp at the moment it enters the Taxiing phase. This timestamp is immutable.

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
| `GoAround`              | A checklist failed and a go-around was initiated.                         |
| `Conflict`              | A disagreement between pilots on approach, and how it was resolved.       |
| `Observation`           | Any other noteworthy event, risk, or context worth preserving.            |
| `EmergencyDeclaration`  | The captain has declared an emergency (final entry before origin handoff).|
| `ChecklistRun`          | A checklist was executed. Contains full `ChecklistRunResult` metadata (see 4.2). |
| `TFRIssued`             | A TFR has taken effect on this craft. Records scope, mode, reason, and issuer.   |
| `TFRLifted`             | A TFR affecting this craft has been lifted. Records duration and issuer.          |
| `CraftCreated`          | The craft was created (flight plan opened, craft enters Taxiing).                 |
| `Launched`              | The craft was launched from Taxiing into InFlight.                                |
| `VectorFailed`          | A vector was reported as failed (reserved for the failing-vector protocol).       |
| `ChecklistItem`         | A single checklist item completed. Recorded once per item, alongside `ChecklistRun`. |
| `ClearanceRequested`    | The captain requested landing clearance from the tower.                           |
| `TowerEnqueued`         | The craft was added to the tower landing queue.                                   |
| `TowerDequeued`         | The craft was removed from the tower landing queue.                               |
| `StateTransition`       | The craft transitioned between lifecycle states. Used for structured audit trail. |
| `AgentOutput`           | A captured line of stdout/stderr from a piloting agent's subprocess. Recorded by the daemon's output pipe; distinct from `Observation`, which is authored by an agent. |
| `Merge`                 | The craft's branch was successfully merged into main by the tower (final lifecycle event before `Landed`). |
| `MergeStale`            | Tower attempted a merge but the craft's branch was not up to date with main. The craft is sent on a go-around. |
| `MergeConflict`         | Tower attempted a merge but encountered conflicts. The craft is sent on a go-around to resolve them. |
| `SpecCreated`           | The craft was created from a spec document via SDD. Records the submitter identity, submission source, spec title, and whether autoLaunch was requested and executed or suppressed (with reason). The raw spec document is attached. |

##### Rules

- **RULE-BBOX-1:** The black box MUST be created when the craft enters the Taxiing phase and MUST persist for the craft's entire lifecycle.
- **RULE-BBOX-2:** Black box entries are append-only. No entry may be modified or deleted once recorded.
- **RULE-BBOX-3:** All pilots (captain, first officers, and jumpseaters) MAY write to the black box.
- **RULE-BBOX-4:** In the event of an emergency declaration, the complete black box MUST be provided to the origin airport as the primary artifact for investigation.

### 2.2 Pilot

A **pilot** is an autonomous agent that can be assigned to a craft. Each pilot has a set of properties and a role-based seat assignment that determines their authority on any given craft.

#### 2.2.1 Properties

| Property        | Type       | Constraints                                              |
| --------------- | ---------- | -------------------------------------------------------- |
| Identifier      | `string`   | Unique across the system.                                |
| Certifications  | `string[]` | List of craft categories the pilot is certified to fly.  |
| Selection Count | `number`   | Monotonic counter; incremented each time this pilot is auto-selected as captain or first officer via SDD. Persisted; used for equitable scheduling. Default: 0. |

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
- **RULE-CTRL-3a:** During adversarial review (while an `adversarial_review` vector is the active vector), the designated reviewer MUST hold exclusive controls. The builder MUST release controls and the reviewer MUST acknowledge the handoff before the vector can be entered. All control transfers for adversarial review MUST be recorded in the black box per RULE-CTRL-7.
- **RULE-CTRL-4:** Pilots SHOULD claim exclusive controls for changes that risk conflicts if done concurrently.
- **RULE-CTRL-5:** Pilots MAY use shared controls when working on clearly separable concerns.
- **RULE-CTRL-6:** If a dispute arises over controls, the captain has final authority.
- **RULE-CTRL-7:** All control transfers and mode changes MUST be recorded in the black box.

#### 2.2.5 Intercom

The **intercom** is a shared communication channel for all pilots aboard a craft. All intercom traffic is recorded in the black box.

##### Message Types

| Type                 | Description                                                                     |
| -------------------- | ------------------------------------------------------------------------------- |
| Pilot Message        | A message from one pilot to the crew. Follows radio discipline rules below.     |
| System Notification  | An automated notification from the ATC system (e.g., checklist results). Contains: source system, summary, outcome, and optional reference to a black box entry for full details. |

##### Radio Discipline

- **RULE-ICOM-1:** A pilot MUST check that no other pilot is mid-transmission before sending a message.
- **RULE-ICOM-2:** Every transmission MUST use the 3W principle: who you are calling, who you are, where you are (current context in the codebase).
- **RULE-ICOM-3:** Safety-critical exchanges (especially control handoffs) MUST be explicitly read back by the receiving pilot.
- **RULE-ICOM-4:** A pilot MUST explicitly signal when their transmission is complete.
- **RULE-ICOM-5:** Transmissions MUST be concise, using clear and direct language with standard phraseology.
- **RULE-ICOM-6:** System notifications MUST include the source system, a human-readable summary, and a reference to the relevant black box entry when applicable.

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

| Property            | Type             | Constraints                                                                      |
| ------------------- | ---------------- | -------------------------------------------------------------------------------- |
| Name                | `string`         | Required. Short, descriptive identifier.                                         |
| Acceptance Criteria | `string`         | Required. Specific, verifiable conditions.                                       |
| Status              | `VectorStatus`   | One of: `Pending`, `Passed`, `Failed`.                                           |
| Type                | `VectorType`     | `standard` (default) or `adversarial_review`. If unset, defaults to `standard`. |
| Reviewer Pilot ID   | `string \| null` | Required when `type` is `adversarial_review`. `null` for standard vectors.      |

#### Rules

- **RULE-VEC-1:** A craft's flight plan MUST be assigned at creation (during Taxiing) and defines all vectors it must pass through.
- **RULE-VEC-2:** Vectors MUST be passed through in order. A pilot MUST NOT skip ahead to a later vector.
- **RULE-VEC-3:** When a craft passes through a vector, the pilot MUST report it to ATC (see Section 4.1).
- **RULE-VEC-4:** A craft MUST NOT enter the Landing Checklist phase until all vectors in its flight plan have been passed and reported.
- **RULE-VEC-5:** If a vector's acceptance criteria cannot be met, the pilot MAY declare an emergency (see Section 4.3).
- **RULE-VEC-6:** A Vector MAY carry a `type` of `standard` (default) or `adversarial_review`. If `type` is unset, it MUST be treated as `standard`.
- **RULE-VEC-7:** An `adversarial_review` vector MUST specify a `reviewerPilotId` at flight plan creation. The designated reviewer MUST NOT be the pilot who filed the most recent preceding vector report on this craft.
- **RULE-VEC-8:** A pilot MAY NOT file a passing vector report for an `adversarial_review` vector if they filed the immediately preceding standard vector report on this craft.
- **RULE-VEC-9:** The designated reviewer for an `adversarial_review` vector MUST hold a Captain or First Officer seat on the craft at the time the vector is entered.

### 2.5 Origin Airport

The **origin airport** represents the spec/implementation design stage.

#### Rules

- **RULE-ORIG-1:** Crafts that cannot be landed after repeated attempts MUST be sent back to the origin airport for re-evaluation.
- **RULE-ORIG-2:** The origin airport MUST receive the craft's callsign, cargo description, flight plan, and complete black box upon emergency return.
- **RULE-ORIG-3:** The origin airport uses the black box to diagnose root cause and determine whether the craft should be re-planned, re-scoped, or abandoned.

### 2.6 Temporary Flight Restriction

A **Temporary Flight Restriction (TFR)** is an externally imposed constraint that pauses agent activity to prevent token usage. TFRs do not alter craft lifecycle state — they act as an overlay that blocks all agent actions while active.

#### Properties

| Property   | Type                                  | Constraints                                                                  |
|------------|---------------------------------------|------------------------------------------------------------------------------|
| Identifier | `string`                              | Unique, immutable after creation.                                            |
| Scope      | `"global"`, `"project"`, or `"craft"` | Required. Determines what is affected.                                       |
| Target     | `string \| null`                      | Required for `project` (project ID) and `craft` (callsign) scopes. Null for global. |
| Mode       | `"graceful"` or `"immediate"`         | Required. Default: `graceful`.                                               |
| Reason     | `string`                              | Required. Why the TFR was issued.                                            |
| Issued By  | `"user"` or `"tower"`                 | Required. Who issued the TFR.                                                |
| Issued At  | `Date`                                | Timestamp when the TFR was issued.                                           |
| Lifted At  | `Date \| null`                        | Null while active. Set when lifted.                                          |

#### Rules

- **RULE-TFR-1:** A TFR MUST have a unique identifier, a scope, a mode, a reason, and an issuer.
- **RULE-TFR-2:** A TFR scoped to `project` MUST specify a project target. A TFR scoped to `craft` MUST specify a craft callsign. A `global` TFR MUST have a null target.
- **RULE-TFR-3:** The user MAY issue a TFR at any scope (global, project, or craft).
- **RULE-TFR-4:** The tower MAY issue a TFR at the project or craft scope only if tower-initiated TFRs are enabled in project configuration. The tower MUST NOT issue global TFRs.
- **RULE-TFR-5:** A TFR MUST NOT alter a craft's lifecycle state. Affected crafts retain their current `CraftStatus` but MUST have a `holdingPattern` flag set to `true`.
- **RULE-TFR-6:** While a craft's `holdingPattern` flag is `true`, no pilot on that craft MAY take any action — no code modifications, no vector reports, no checklist executions, no intercom messages, no control transfers.
- **RULE-TFR-7:** Multiple TFRs MAY be active simultaneously. A craft is in a holding pattern if *any* active TFR applies to it (by global scope, matching project, or matching callsign).
- **RULE-TFR-8:** Lifting a TFR clears the `holdingPattern` flag on all affected crafts that are not subject to another active TFR.

### 2.7 Spec Document

A **spec document** is a structured YAML or JSON document submitted to ATC to automatically create a craft. It is the machine-readable input to the Spec-Driven Development (SDD) protocol (see §4.6).

#### Properties

| Property                    | Type                                     | Required | Description |
| --------------------------- | ---------------------------------------- | -------- | ----------- |
| Title                       | `string`                                 | Yes      | Short name for the work. Used in callsign generation and search. |
| Cargo                       | `string`                                 | Yes      | Full description of the change and its scope. Becomes the craft's `cargo`. |
| Category                    | `CraftCategory`                          | Yes      | Craft category. Must match a project-configured category. |
| Vectors                     | `SpecVector[]`                           | Yes      | Ordered list of flight-plan milestones. At least one required. |
| Priority                    | `low \| medium \| high \| critical`      | No       | Default: `medium`. |
| Auto Launch                 | `boolean`                                | No       | Default: `false`. Request immediate craft launch. Subject to layered safety guards (see §4.6.3). |
| Callsign Override           | `string \| null`                         | No       | Explicit callsign. Must be unique. If absent, auto-generated (see §4.6.2). |
| Pilots                      | `SpecPilotHints`                         | No       | Optional pilot assignment hints (see below). |
| Notes                       | `string \| null`                         | No       | Markdown. Stored verbatim in the craft's black box at creation. |
| Metadata                    | `Record<string, string>`                 | No       | Arbitrary key-value pairs stored in the black box. |

**SpecVector:**

| Field    | Type       | Required | Description |
| -------- | ---------- | -------- | ----------- |
| Name     | `string`   | Yes      | Short, descriptive milestone name. |
| Criteria | `string[]` | Yes      | One or more acceptance criteria in natural language. Each criterion must be specific, binary, and testable. |

**SpecPilotHints:**

| Field                    | Type       | Description |
| ------------------------ | ---------- | ----------- |
| Captain                  | `string`   | Explicit pilot ID. If absent, auto-selected. |
| First Officers           | `string[]` | Explicit first officer pilot IDs. |
| Jumpseaters              | `string[]` | Explicit jumpseat pilot IDs. |
| Require Certifications   | `string[]` | Additional certifications the auto-selected captain must hold. |
| Exclude                  | `string[]` | Pilot IDs excluded from auto-selection. |

#### Rules

- **RULE-SDD-1:** A spec document MUST include `title`, `cargo`, `category`, and at least one entry in `vectors`. Submissions missing any required field MUST be rejected with `SPEC_VALIDATION_ERROR`.
- **RULE-SDD-2:** Each vector entry MUST include a `name` and at least one non-empty string in `criteria`. A vector with no criteria MUST be rejected with `SPEC_VALIDATION_ERROR`.
- **RULE-SDD-3:** The `category` field MUST match one of the project-configured craft categories. An unknown category MUST be rejected with `UNKNOWN_CATEGORY`.
- **RULE-SDD-5:** If an explicit callsign override is provided, it MUST be unique across all crafts in the project. A collision MUST be rejected with `CALLSIGN_CONFLICT`.
- **RULE-SDD-6:** If an explicit `pilots.captain` is provided, that pilot MUST hold a certification for the spec's `category`. A mismatch MUST be rejected with `PILOT_NOT_CERTIFIED`.
- **RULE-SDD-7:** If explicit `pilots.firstOfficers` are provided, each listed pilot MUST hold a certification for the spec's `category`. A mismatch MUST be rejected with `PILOT_NOT_CERTIFIED`.

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
| 4 | `LandingChecklist`| `ClearedToLand`    | All required checks pass; tower grants clearance.      | All required checklist items pass.   |
| 5 | `LandingChecklist`| `GoAround`         | One or more required checks fail.                      | At least one required checklist item failed. |
| 6 | `GoAround`        | `LandingChecklist` | Pilot re-attempts after addressing failures.           | Pilot has addressed failure(s).      |
| 7 | `GoAround`        | `Emergency`        | Repeated failures exceed threshold or pilot escalates. | Captain decision.                    |
| 8 | `ClearedToLand`   | `Landed`           | Tower merges branch into main.                         | Branch up to date with main.         |
| 9 | `Emergency`       | `ReturnToOrigin`   | Craft sent back to design stage with black box.        | Emergency declaration recorded in black box. |

### 3.3 Rules

- **RULE-LIFE-1:** A craft MUST begin in the `Taxiing` state.
- **RULE-LIFE-2:** Only transitions listed in Section 3.2 are valid. Any unlisted transition is illegal.
- **RULE-LIFE-3:** `Taxiing` → `InFlight` requires a captain, cargo, and flight plan to be assigned.
- **RULE-LIFE-4:** `InFlight` → `LandingChecklist` requires all vectors in the flight plan to be passed and reported.
- **RULE-LIFE-5:** `LandingChecklist` → `ClearedToLand` requires all **required** checklist items to pass (advisory failures are permitted) and the tower to grant clearance.
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

### 4.2 Checklists

Checklists are configurable, ordered lists of validation tasks that run automatically at lifecycle events. They generalize the original landing checklist concept into a system that can gate any lifecycle transition or run observational checks after transitions complete.

#### 4.2.1 Lifecycle Events

A **lifecycle event** is a hookable moment in the craft lifecycle. Events come in before/after pairs.

| Event                    | Fires When                              | Type   |
| ------------------------ | --------------------------------------- | ------ |
| `before:takeoff`         | `Taxiing → InFlight`                    | Before |
| `after:takeoff`          | After `Taxiing → InFlight` completes    | After  |
| `before:vector-complete` | `reportVector()` called                 | Before |
| `after:vector-complete`  | After vector report is recorded         | After  |
| `before:landing-check`   | `LandingChecklist → ClearedToLand`      | Before |
| `after:landing-check`    | After landing check passes              | After  |
| `before:go-around`       | `GoAround → LandingChecklist`           | Before |
| `after:go-around`        | After go-around re-attempt begins       | After  |
| `before:emergency`       | `GoAround → Emergency`                  | Before |
| `after:emergency`        | After emergency is declared             | After  |
| `before:landing`         | `ClearedToLand → Landed`               | Before |
| `after:landing`          | After branch is merged                  | After  |

#### 4.2.2 Checklist Items

Each item in a checklist has:

| Field       | Type                                | Required | Description                                              |
| ----------- | ----------------------------------- | -------- | -------------------------------------------------------- |
| Name        | `string`                            | Yes      | Unique within template.                                  |
| Description | `string`                            | No       | Returned to agents on failure for remediation context.   |
| Severity    | `"required"` or `"advisory"`        | Yes      | Required items block before-event transitions.           |
| Executor    | `ShellExecutor` or `McpToolExecutor` | Yes     | How to run the check.                                    |

**ShellExecutor:** A shell command. Pass/fail determined by exit code (0 = pass).

**McpToolExecutor:** An MCP tool invocation by name with parameters.

#### 4.2.3 Templates and Bindings

A **checklist template** is a named, ordered list of items. Templates are bound to lifecycle events and craft categories via **checklist bindings**. A craft inherits all bindings matching its category. The wildcard category `"*"` matches all crafts.

#### 4.2.4 Per-Craft Overrides

Individual crafts may override inherited bindings for a specific event:

- **Add items** — appended after template items.
- **Remove items** — skipped by name.
- **Disable template** — the template is not run for this craft and event.

#### 4.2.5 Default Checklist

A built-in template bound to `before:landing-check` for all categories provides baseline validation:

| Check          | Severity | Validation                                 |
| -------------- | -------- | ------------------------------------------ |
| Tests          | Required | All test suites pass.                      |
| Lint           | Required | No lint errors or warnings.                |
| Documentation  | Advisory | Required docs are present and up to date.  |
| Build          | Required | Project builds successfully.               |

Projects configure checklists by creating templates and bindings. The defaults are provided as a starting point.

#### 4.2.6 Execution and Results

Every checklist execution produces a `ChecklistRunResult` containing:

| Field         | Description                                                           |
| ------------- | --------------------------------------------------------------------- |
| Checklist name | The template that was executed.                                      |
| Event         | The lifecycle event that triggered the run.                           |
| Craft callsign | The craft this ran against.                                          |
| Attempt       | Attempt number (1-indexed, increments on re-runs for the same event). |
| Timestamp     | When the run completed.                                               |
| Passed        | True if no required items failed.                                     |
| Item results  | Per-item: name, passed, severity, message, captured output, duration. |

Output is capped at 500 lines per item to keep black box entries manageable.

#### Rules

- **RULE-CHKL-1:** A checklist template is a named, ordered list of items. Each item has a name, executor (shell command or MCP tool reference), severity (`required` or `advisory`), and optional failure description.
- **RULE-CHKL-2:** Templates are bound to lifecycle events and craft categories. A craft inherits all bindings matching its category. The wildcard category `"*"` matches all crafts.
- **RULE-CHKL-3:** Individual crafts MAY override inherited bindings: add items, remove items by name, or disable a template entirely for a specific event.
- **RULE-CHKL-4:** For before-events, required item failure MUST block the transition. Advisory failures MUST be logged but MUST NOT block. For after-events, no failures block; all results are informational.
- **RULE-CHKL-5:** Every checklist execution MUST be recorded as a `ChecklistRun` entry in the craft's black box with full metadata: event, attempt number, per-item results (name, passed, severity, message, output, duration), and overall outcome.
- **RULE-CHKL-6:** On checklist completion, a system-generated notification MUST be posted to the craft's intercom with the outcome and a reference to the black box entry. Agents retrieve full details via tool call.
- **RULE-CHKL-7:** Checklist items MUST execute sequentially in template order. Override-added items are appended after template items.
- **RULE-CHKL-8:** The lifecycle event enum is extensible. Adding a new event requires only a new enum value and wiring it to the relevant transition or action.

#### Legacy Compatibility

The original RULE-LCHK-1 through RULE-LCHK-4 are superseded by RULE-CHKL-1 through RULE-CHKL-8. The `before:landing-check` event replaces the hardcoded landing checklist phase. The default template (Tests, Lint, Documentation, Build) preserves the original behavior.

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

### 4.5 TFR Protocol

#### Issuance

1. The issuer (user or tower, per RULE-TFR-3/4) declares a TFR with scope, mode, reason, and target.
2. The system records the TFR with a timestamp.
3. The system identifies all affected crafts based on scope and target.

#### Enforcement — Graceful Mode (default)

1. All affected agents receive a TFR notification.
2. Agents are given a brief wind-down window to reach a safe stopping point.
3. During wind-down, agents MUST record their current state in the black box as an `Observation` entry.
4. After wind-down, the `holdingPattern` flag is set on all affected crafts.
5. A `TFRIssued` entry is recorded in each affected craft's black box.

#### Enforcement — Immediate Mode

1. All affected agents are stopped immediately.
2. The `holdingPattern` flag is set on all affected crafts with no wind-down window.
3. A `TFRIssued` entry is recorded in each affected craft's black box by the system (since agents cannot act).

#### Lifting

1. The user lifts the TFR (only the user may lift a TFR, regardless of who issued it).
2. The system sets `liftedAt` on the TFR record.
3. The `holdingPattern` flag is cleared on all affected crafts not subject to another active TFR.
4. All affected agents automatically resume from their prior state.

#### Rules

- **RULE-TFRP-1:** In graceful mode, agents MUST be given a wind-down window to reach a safe stopping point and record state before the holding pattern takes effect.
- **RULE-TFRP-2:** In immediate mode, the holding pattern takes effect instantly with no wind-down.
- **RULE-TFRP-3:** Only the user MAY lift a TFR, regardless of who issued it.
- **RULE-TFRP-4:** When a TFR is lifted, all affected agents MUST automatically resume from their prior state.
- **RULE-TFRP-5:** A `TFRIssued` and `TFRLifted` entry MUST be recorded in the black box of every affected craft.
- **RULE-TFRP-6:** TFR events MUST be posted as system notifications on each affected craft's intercom.
- **RULE-TFRP-7:** The tower MUST maintain a log of all TFR events with full metadata.

### 4.6 Spec-Driven Craft Creation Protocol

**Spec-Driven Development (SDD)** is the process by which a spec document (§2.7) is submitted to ATC and automatically converted into a fully-initialized craft in the Taxiing state, optionally launched immediately.

#### 4.6.1 Creation Procedure

When a spec is submitted, ATC executes the following steps in order:

1. **Parse** the spec document (YAML or JSON). On parse failure, return `SPEC_PARSE_ERROR`.
2. **Validate** fields against RULE-SDD-1 through RULE-SDD-7. On failure, return `SPEC_VALIDATION_ERROR`, `UNKNOWN_CATEGORY`, `CALLSIGN_CONFLICT`, `PILOT_NOT_CERTIFIED`, or `PILOT_ROLE_CONFLICT` as appropriate.
3. **Generate callsign** from the spec title if no override is provided (see §4.6.2). The callsign counter MUST NOT be persisted yet.
4. **Generate flight plan** — convert the `vectors` array into `Vector` objects in declaration order, each with status `Pending`.
5. **Select pilots** via the auto-selection algorithm (see §4.6.4) for any unspecified seats.
6. **Dry-run exit** — if dry-run was requested (RULE-SDD-15), return the fully-computed would-be craft object (with callsign, flight plan, and crew) and stop. The callsign counter MUST NOT be persisted; `selectionCount` MUST NOT be incremented. No records, branches, or agents are created.
7. **Persist callsign counter** to the project config store.
8. **Create git worktree branch** named `<callsign>` off the project's main branch. If this fails, return `BRANCH_CREATION_FAILED` — no craft record has been written.
9. **Write craft record** in the `Taxiing` state to the craft store. If this fails, delete the worktree branch as a compensating action, then return the error.
10. **Record black box entry** — append a `SpecCreated` entry recording: requester identity, submission source, spec title, notes, metadata, and whether `autoLaunch` was requested and whether it was executed or suppressed (RULE-SDD-16).
11. **Evaluate autoLaunch** — if `autoLaunch: true` and all guards pass (RULE-SDD-11 through RULE-SDD-14), transition the craft to `InFlight` and start the captain's agent. Otherwise, record the suppression reason in the black box entry and leave the craft in `Taxiing`.
12. **Return** the created craft object.

**Rollback (compensating transaction):** Steps 8 and 9 are not atomic. The git branch is created first because it is the cheaper operation to compensate: if step 9 (craft store write) fails, the branch is deleted and the error returned. On daemon startup, a reconciliation scan removes orphaned worktree branches that have no corresponding craft store record.

#### 4.6.2 Callsign Generation

When no callsign override is provided, ATC generates a callsign deterministically:

1. Slugify the spec `title` (lowercase; replace spaces and special characters with hyphens; collapse consecutive hyphens; trim).
2. Truncate to 40 characters at a word boundary.
3. Append a zero-padded monotonic counter from the project config store: `<slug>-<NN>` (e.g., `add-oauth2-login-01`). The counter increments per spec-created craft. Zero-padding expands as needed (`01` → `99` → `100`). The counter MUST be persisted to the project config store before the branch creation step (§4.6.1 step 7). In dry-run mode (§4.6.1 step 6), the counter MUST NOT be persisted.
4. If the result collides with an existing craft callsign, increment the counter and retry. If 100 consecutive increments all collide, fail with `CALLSIGN_CONFLICT` rather than looping indefinitely.

#### 4.6.3 AutoLaunch Safety

`autoLaunch: true` in a spec requests that the craft transition from `Taxiing` to `InFlight` immediately after creation, spawning the captain's agent process. All of the following guards MUST pass; failure of any one suppresses `autoLaunch` and leaves the craft in `Taxiing`.

- **RULE-SDD-11:** `autoLaunch` MUST be suppressed unless the project configuration explicitly sets `allowAutoLaunch: true`.
- **RULE-SDD-12:** An active TFR covering the target project (global or project-scoped) MUST suppress `autoLaunch`, regardless of project opt-in. The craft is created with `holdingPattern: true` (consistent with RULE-TFR-5 and RULE-TFR-6).
- **RULE-SDD-13:** The API key or session used to submit the spec MUST carry a `spec:autolaunch` permission scope. Keys with only `spec:submit` scope have `autoLaunch` suppressed even when the project allows it.
- **RULE-SDD-14:** When a spec is submitted by an agent (identified by `agentId` in the request context), `autoLaunch` MUST be suppressed. An agent-created craft requires human or tower confirmation before transitioning to `InFlight`. This prevents runaway spawn chains.

#### 4.6.4 Pilot Auto-Selection

When no explicit captain is provided, ATC applies the following algorithm to select one:

1. **Certification filter:** Collect all pilots certified for the spec's `category`.
2. **Exclusion filter:** Remove pilots listed in `spec.pilots.exclude`.
3. **Additional certification filter:** If `spec.pilots.requireCertifications` is non-empty, further filter to pilots holding all listed certifications.
4. **Workload score:** For each remaining candidate, compute:
   ```
   workload_score = (active_captaincies × 1.0) + (active_fo_assignments × 0.5)
   ```
   where "active" means the craft's status is `Taxiing`, `InFlight`, or `LandingClearanceRequested`. The FO weight (`0.5`) is configurable via `pilotSelectionFoWeight` in project config (default: `0.5`).
5. **Sort ascending** by workload score.
6. **Tie-break** by `selectionCount` ascending — prefer the pilot selected least often across all auto-selection events.
7. **Select** the top-scoring pilot and increment their `selectionCount`.
8. **Reject** if no candidates remain: return `NO_CERTIFIED_PILOT`.

The same algorithm (excluding the chosen captain) selects first officers when a minimum crew is configured for the category. Each auto-selected FO has their `selectionCount` incremented.

##### Rules

- **RULE-SDD-8:** Auto-selected captains MUST be certified for the craft's category (RULE-PILOT-2 applies).
- **RULE-SDD-9:** If no certified pilot is available after all filters, the spec submission MUST fail with `NO_CERTIFIED_PILOT`. The error message MUST enumerate the required category, any additional `requireCertifications`, and the certifications held by each available pilot, so the operator knows which filter eliminated each candidate.
- **RULE-SDD-10:** ATC MUST NOT assign the same pilot as both captain and first officer. This constraint MUST be checked explicitly before returning the selection.

#### 4.6.5 Submission Interfaces

Spec documents may be submitted through three interfaces:

**REST API:**

```
POST /api/v1/projects/:name/crafts/from-spec
Content-Type: application/json | application/yaml

Query: ?dryRun=true  — validate without side effects (RULE-SDD-15)
```

The endpoint accepts YAML or JSON. A YAML body parser MUST be registered in the HTTP server for YAML submissions. The endpoint is not idempotent — duplicate callsigns are rejected with `CALLSIGN_CONFLICT`.

**Spec Inbox (File Watch):**

When a project is configured with a `specInbox` directory, ATC watches it. Files with a `.spec.yaml` or `.spec.json` extension are automatically submitted on creation. Processed files are moved to `specInbox/.processed/`; failed files to `specInbox/.failed/` with a `.error` JSON sidecar containing at minimum: `{ code: string, message: string, timestamp: string, sourceFile: string }`.

**CLI:**

```bash
atc spec submit --project <name> --file <path>
atc spec submit --project <name> --file <path> --dry-run
```

#### 4.6.6 Audit Trail

- **RULE-SDD-15:** The spec submission interface MUST support a dry-run mode. In dry-run mode, the daemon validates the spec, generates the callsign, flight plan, and pilot selection, and returns the fully-computed would-be craft object — but creates no records, branches, or agents. The callsign counter MUST NOT be persisted and pilot `selectionCount` values MUST NOT be incremented in dry-run mode.
- **RULE-SDD-16:** The `SpecCreated` black box entry MUST record: requester identity (`userId`, `apiKeyId`, or `agentId`), submission source (`rest`, `file-watch`, `cli`), spec title, notes (if provided), metadata (if provided), whether `autoLaunch` was requested in the spec, and whether it was executed or suppressed — including the suppression reason if applicable.
- **RULE-SDD-17:** The file-watch inbox processor MUST NOT process the same file twice. Deduplication MUST be enforced by inode + modification timestamp or by content hash.

#### 4.6.7 Acceptance Criteria Guidelines

Criteria are natural language strings verified by the pilot through self-assessment. Criteria must be:

- **Specific** — names the endpoint, file, state, or behavior.
- **Binary** — pass or fail without subjective thresholds.
- **Testable** — the pilot can write a test or run a manual check against it.

Criteria express *what success looks like*. Structural gates (tests pass, lint clean, build succeeds) belong in the landing checklist, not in criteria.

#### 4.6.8 Error Reference

| Code | HTTP | Description |
|------|------|-------------|
| `SPEC_PARSE_ERROR` | 400 | Spec document is malformed YAML/JSON. |
| `SPEC_VALIDATION_ERROR` | 422 | Required field is missing or invalid. |
| `UNKNOWN_CATEGORY` | 422 | `category` does not match any project-configured category. |
| `CALLSIGN_CONFLICT` | 409 | Callsign already in use (explicit override collision or 100 generated collisions). |
| `NO_CERTIFIED_PILOT` | 422 | No pilots certified for the category remain after all filters. |
| `PILOT_NOT_CERTIFIED` | 422 | Explicitly named pilot lacks required certification. |
| `PILOT_ROLE_CONFLICT` | 422 | Same pilot assigned as both captain and first officer (RULE-SDD-10). |
| `BRANCH_CREATION_FAILED` | 500 | Git branch could not be created. No craft record is written. |

### 4.7 UX Review Protocol

Changes that introduce or modify user-facing behavior require UX review before landing. This protocol ensures that user-visible surfaces — error messages, submission flows, dashboard components, and pilot-facing guidance — are evaluated for consistency, clarity, and recoverability before they ship.

#### 4.7.1 Applicability

A UX review is required when a change touches any of the following:

- New or modified error message templates (§4.6.8 or any future error reference).
- The SDD spec document schema or submission flow (§4.6).
- Dashboard views, components, or layout in the web package.
- The operating manual (`docs/agent/operating-manual.md`).
- Protocol sections (§4.*) that introduce user-visible confirmation, notification, or interaction steps.
- CLI output formatting or interactive prompts.

Changes that are purely internal (refactors, backend logic with no user-visible surface, test-only changes) are exempt.

#### 4.7.2 Review Procedure

1. The implementing pilot performs a **UX impact triage** as part of the contribution checklist. If the change has user-facing impact, a UX review subtask is created.
2. The UX review subtask is assigned to a designated UX reviewer. It includes: a summary of affected surfaces, links to relevant `RULE-*` identifiers, and before/after screenshots or mockups when applicable.
3. The UX reviewer evaluates the change against the UX review criteria (§4.7.3).
4. The UX reviewer either signs off or requests changes. UX sign-off is a blocking gate — the craft cannot proceed to landing clearance without it.

#### 4.7.3 Review Criteria

- **RULE-UXR-1:** User-facing changes MUST use terminology consistent with the domain model defined in §1.1. Introducing synonyms or alternative terms for established concepts (e.g., "task" instead of "craft") is not permitted without a spec update.
- **RULE-UXR-2:** Error messages, labels, and instructions MUST be understandable by a pilot or operator with standard domain knowledge. Messages MUST NOT require reading source code to interpret.
- **RULE-UXR-3:** All user-visible state transitions MUST have coverage for success, error, loading, and empty states. A new UI surface that only renders the happy path fails UX review.
- **RULE-UXR-4:** Changes to the web package MUST maintain or improve accessibility: sufficient color contrast (WCAG AA), keyboard navigability, and screen-reader-compatible markup.
- **RULE-UXR-5:** Destructive or irreversible actions MUST require explicit user confirmation before execution. Users MUST be able to recover from errors without losing in-progress work.

## 5. Appendices

### Appendix A: Rule Index

| Rule ID        | Summary                                                              | Section |
| -------------- | -------------------------------------------------------------------- | ------- |
| RULE-CRAFT-1   | Craft callsign must be unique and immutable.                         | 2.1     |
| RULE-CRAFT-2   | Craft must have exactly one git branch (1:1).                        | 2.1     |
| RULE-CRAFT-3   | Craft must have a cargo description at creation.                     | 2.1     |
| RULE-CRAFT-4   | Craft must have a category at creation.                              | 2.1     |
| RULE-CRAFT-5   | Craft must have exactly one captain at all times.                    | 2.1     |
| RULE-CRAFT-6   | Craft must record an immutable creation timestamp at Taxiing.        | 2.1     |
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
| RULE-CTRL-3a   | Adversarial reviewer holds exclusive controls; builder must release before vector entry. | 2.2.4 |
| RULE-CTRL-4    | Should use exclusive controls for conflict-prone changes.            | 2.2.4   |
| RULE-CTRL-5    | May use shared controls for separable concerns.                      | 2.2.4   |
| RULE-CTRL-6    | Captain has final authority on control disputes.                     | 2.2.4   |
| RULE-CTRL-7    | Control transfers must be recorded in black box.                     | 2.2.4   |
| RULE-ICOM-1    | Check channel is clear before transmitting.                          | 2.2.5   |
| RULE-ICOM-2    | Use 3W principle in every transmission.                              | 2.2.5   |
| RULE-ICOM-3    | Read back safety-critical exchanges.                                 | 2.2.5   |
| RULE-ICOM-4    | Signal when transmission is complete.                                | 2.2.5   |
| RULE-ICOM-5    | Keep transmissions concise with standard phraseology.                | 2.2.5   |
| RULE-ICOM-6    | System notifications must include source, summary, and bbox ref.     | 2.2.5   |
| RULE-TOWER-1   | Exactly one tower per repository.                                    | 2.3     |
| RULE-TOWER-2   | Tower must verify all vector reports before granting clearance.      | 2.3     |
| RULE-TOWER-3   | Tower must verify branch is up to date before merge.                 | 2.3     |
| RULE-VEC-1     | Flight plan assigned at creation during Taxiing.                     | 2.4     |
| RULE-VEC-2     | Vectors must be passed in order; no skipping.                        | 2.4     |
| RULE-VEC-3     | Pilot must report vector passage to ATC.                             | 2.4     |
| RULE-VEC-4     | All vectors must be passed before Landing Checklist.                 | 2.4     |
| RULE-VEC-5     | May declare emergency if vector criteria cannot be met.              | 2.4     |
| RULE-VEC-6     | Vector type is `standard` (default) or `adversarial_review`.        | 2.4     |
| RULE-VEC-7     | adversarial_review vector must specify reviewerPilotId; reviewer must not have filed the preceding vector report. | 2.4 |
| RULE-VEC-8     | Pilot may not file passing report for adversarial_review vector if they filed the immediately preceding standard report. | 2.4 |
| RULE-VEC-9     | Designated reviewer must hold Captain or First Officer seat at vector entry. | 2.4 |
| RULE-ORIG-1    | Unlandable crafts must be sent to origin airport.                    | 2.5     |
| RULE-ORIG-2    | Origin receives callsign, cargo, flight plan, and black box.        | 2.5     |
| RULE-ORIG-3    | Origin diagnoses root cause and decides re-plan/re-scope/abandon.   | 2.5     |
| RULE-LIFE-1    | Craft begins in Taxiing state.                                       | 3.3     |
| RULE-LIFE-2    | Only listed transitions are valid.                                   | 3.3     |
| RULE-LIFE-3    | Taxiing → InFlight requires captain, cargo, flight plan.            | 3.3     |
| RULE-LIFE-4    | InFlight → LandingChecklist requires all vectors passed/reported.   | 3.3     |
| RULE-LIFE-5    | LandingChecklist → ClearedToLand requires all required checks pass + tower. | 3.3 |
| RULE-LIFE-6    | ClearedToLand → Landed requires branch up to date + merge.         | 3.3     |
| RULE-LIFE-7    | Emergency → ReturnToOrigin requires EmergencyDeclaration in bbox.   | 3.3     |
| RULE-LIFE-8    | Landed and ReturnToOrigin are terminal; no transitions out.          | 3.3     |
| RULE-VRPT-1    | Vector report must be filed on every vector passage.                 | 4.1     |
| RULE-VRPT-2    | Report must include callsign, vector name, evidence, timestamp.      | 4.1     |
| RULE-VRPT-3    | ATC must record report and update flight plan status.                | 4.1     |
| RULE-VRPT-4    | Missing vector report means landing clearance denied.                | 4.1     |
| RULE-CHKL-1    | Template is named, ordered list with name, executor, severity, description. | 4.2  |
| RULE-CHKL-2    | Templates bound to lifecycle events and craft categories.            | 4.2     |
| RULE-CHKL-3    | Crafts may override bindings: add, remove, or disable.               | 4.2     |
| RULE-CHKL-4    | Before-events: required failures block; after-events: never block.   | 4.2     |
| RULE-CHKL-5    | Every execution recorded as ChecklistRun in black box with full metadata. | 4.2  |
| RULE-CHKL-6    | System notification posted to intercom on completion.                | 4.2     |
| RULE-CHKL-7    | Items execute sequentially; override items appended after template.  | 4.2     |
| RULE-CHKL-8    | Lifecycle event enum is extensible.                                  | 4.2     |
| RULE-EMER-1    | Only the captain may declare an emergency.                           | 4.3     |
| RULE-EMER-2    | Captain must record EmergencyDeclaration in black box.               | 4.3     |
| RULE-EMER-3    | Craft must return to origin on emergency.                            | 4.3     |
| RULE-EMER-4    | Origin receives callsign, cargo, flight plan, and black box.        | 4.3     |
| RULE-TMRG-1    | Tower must verify all vector reports before clearance.               | 4.4     |
| RULE-TMRG-2    | Tower must verify branch is up to date before merge.                 | 4.4     |
| RULE-TMRG-3    | Tower may send craft on go-around for merge conflicts.               | 4.4     |
| RULE-TMRG-4    | Merges sequenced FCFS by default.                                    | 4.4     |
| RULE-TFR-1     | TFR must have identifier, scope, mode, reason, and issuer.           | 2.6     |
| RULE-TFR-2     | Project/craft TFRs require target; global TFRs have null target.     | 2.6     |
| RULE-TFR-3     | User may issue TFR at any scope.                                     | 2.6     |
| RULE-TFR-4     | Tower may issue project/craft TFR if enabled; never global.          | 2.6     |
| RULE-TFR-5     | TFR must not alter lifecycle state; uses holdingPattern flag.        | 2.6     |
| RULE-TFR-6     | No pilot actions permitted while holdingPattern is true.             | 2.6     |
| RULE-TFR-7     | Multiple TFRs may coexist; craft holds if any TFR applies.           | 2.6     |
| RULE-TFR-8     | Lifting TFR clears holdingPattern unless another TFR still applies.  | 2.6     |
| RULE-TFRP-1    | Graceful mode: wind-down window before holding pattern.              | 4.5     |
| RULE-TFRP-2    | Immediate mode: no wind-down, instant hold.                          | 4.5     |
| RULE-TFRP-3    | Only the user may lift a TFR.                                        | 4.5     |
| RULE-TFRP-4    | Agents auto-resume when TFR is lifted.                               | 4.5     |
| RULE-TFRP-5    | TFRIssued and TFRLifted entries in affected craft black boxes.       | 4.5     |
| RULE-TFRP-6    | TFR events posted as intercom system notifications.                  | 4.5     |
| RULE-TFRP-7    | Tower maintains log of all TFR events.                               | 4.5     |
| RULE-SDD-1     | Spec must include title, cargo, category, and at least one vector.   | 2.7     |
| RULE-SDD-2     | Each vector must have a name and at least one non-empty criterion; reject with SPEC_VALIDATION_ERROR. | 2.7     |
| RULE-SDD-3     | Category must match a project-configured craft category.             | 2.7     |
| RULE-SDD-5     | Explicit callsign override must be unique.                           | 2.7     |
| RULE-SDD-6     | Explicit captain must be certified for the spec's category.          | 2.7     |
| RULE-SDD-7     | Explicit first officers must be certified for the spec's category.   | 2.7     |
| RULE-SDD-8     | Auto-selected captains must be certified (RULE-PILOT-2 applies).     | 4.6.4   |
| RULE-SDD-9     | No eligible pilot after filtering → fail with NO_CERTIFIED_PILOT.   | 4.6.4   |
| RULE-SDD-10    | Same pilot must not be assigned as both captain and first officer.   | 4.6.4   |
| RULE-SDD-11    | autoLaunch suppressed unless project sets allowAutoLaunch: true.     | 4.6.3   |
| RULE-SDD-12    | Active TFR suppresses autoLaunch; craft created with holdingPattern. | 4.6.3   |
| RULE-SDD-13    | API key must carry spec:autolaunch scope to enable autoLaunch.       | 4.6.3   |
| RULE-SDD-14    | Agent-submitted specs cannot autoLaunch.                             | 4.6.3   |
| RULE-SDD-15    | Dry-run: full validation + computation, no persistence or side effects. | 4.6.6   |
| RULE-SDD-16    | SpecCreated bbox entry must record identity, source, title, notes, metadata, autoLaunch outcome. | 4.6.6 |
| RULE-SDD-17    | File-watch inbox must not process the same file twice.               | 4.6.5   |
| RULE-UXR-1     | User-facing changes must use domain model terminology from §1.1.     | 4.7.3   |
| RULE-UXR-2     | Error messages/labels must be understandable without reading source.  | 4.7.3   |
| RULE-UXR-3     | All user-visible states covered: success, error, loading, empty.     | 4.7.3   |
| RULE-UXR-4     | Web changes must maintain/improve accessibility (WCAG AA).           | 4.7.3   |
| RULE-UXR-5     | Destructive actions require confirmation; errors must be recoverable.| 4.7.3   |
