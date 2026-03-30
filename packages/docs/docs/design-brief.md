---
title: Design Brief
sidebar_position: 4
---

# ATC (Air Traffic Control) — Specification

## 1. Overview

ATC is an agent orchestration system that coordinates multiple autonomous agents working on concurrent code changes within a shared repository. It uses aviation terminology as its domain language.

## 2. Domain Model

### 2.1 Craft (Aircraft)

A **craft** is the fundamental unit of work in ATC. Each craft represents a single discrete change to the codebase.

| Property       | Description                                                                                |
| -------------- | ------------------------------------------------------------------------------------------ |
| Callsign       | A unique identifier for the craft, used for all cross-system refs.                         |
| Branch         | The git branch associated with this craft (1:1 relationship).                              |
| Cargo          | The change being made — a description of the work and its scope.                           |
| Category       | The craft category (see Section 2.2.2) that determines which pilots are eligible to fly.   |
| Captain        | The pilot-in-command, ultimately responsible for the craft.                                |
| First Officers | Zero or more additional certified pilots who assist the captain.                           |
| Jumpseaters    | Zero or more non-certified pilots who may observe and advise.                              |
| Flight Plan    | An ordered list of vectors the craft must pass through.                                    |
| Black Box      | An append-only log of implementation decisions and significant events (see Section 2.1.1). |
| Status         | The current phase of the craft's lifecycle (see Section 3).                                |

#### 2.1.1 Black Box

The **black box** is an append-only log maintained on every craft throughout its lifecycle. Any pilot on the craft (including jumpseaters) may write to the black box, but no entry may be modified or deleted once recorded.

Each black box entry contains:

| Field     | Description                                           |
| --------- | ----------------------------------------------------- |
| Timestamp | When the entry was recorded.                          |
| Author    | The pilot who recorded the entry.                     |
| Type      | The kind of event (see below).                        |
| Content   | A description of the decision, event, or observation. |

**Entry types:**

| Type                  | When to record                                                                      |
| --------------------- | ----------------------------------------------------------------------------------- |
| Decision              | An implementation decision was made (e.g., choice of algorithm, library, approach). |
| Vector Passed         | A vector's acceptance criteria were met (recorded alongside the ATC vector report). |
| Go-Around             | The landing checklist failed and a go-around was initiated.                         |
| Conflict              | A disagreement between pilots on approach, and how it was resolved.                 |
| Observation           | Any other noteworthy event, risk, or context the pilot wants preserved.             |
| Emergency Declaration | The captain has declared an emergency (final entry before handoff).                 |

**Key rules:**

1. The black box is created when the craft enters the Taxiing phase and persists for the craft's entire lifecycle.
2. All pilots (captain, first officers, and jumpseaters) should record significant decisions and events as they occur.
3. In the event of an emergency declaration, the complete black box is provided to the origin airport as the primary artifact for investigation and re-planning.

### 2.2 Pilot

A **pilot** is an autonomous agent that can be assigned to a craft. Each pilot has a set of properties and a role-based seat assignment that determines their authority on any given craft.

#### 2.2.1 Pilot Properties

| Property       | Description                                                           |
| -------------- | --------------------------------------------------------------------- |
| Identifier     | A unique identifier for the pilot agent.                              |
| Certifications | A list of craft categories the pilot is certified to fly (see 2.2.2). |

#### 2.2.2 Craft Categories

A **craft category** represents a type or scale of change. Categories are used to match pilots to crafts — only pilots holding a certification for a craft's category may serve as captain or first officer. Examples:

| Category             | Description                                     |
| -------------------- | ----------------------------------------------- |
| Backend Engineering  | REST APIs, server-side logic, database changes. |
| Frontend Engineering | UI components, client-side logic, styling.      |
| Infrastructure       | CI/CD, deployment, cloud configuration.         |
| Documentation        | Non-code documentation changes.                 |

Categories are project-configurable; the above are examples, not an exhaustive list.

#### 2.2.3 Seat Assignments

Every pilot on a craft occupies exactly one **seat**, which determines their level of authority:

| Seat          | Required Certification | Can Modify Code | Authority                                                                                                                                                                              |
| ------------- | ---------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Captain       | Yes                    | Yes             | Pilot-in-command. Ultimately responsible for the craft. Makes final decisions on direction, runs the landing checklist, and communicates with the tower. Exactly one per craft.        |
| First Officer | Yes                    | Yes             | Assists the captain with implementation. May perform any action the captain can, but defers to the captain on final decisions. Zero or more per craft.                                 |
| Jumpseat      | No                     | **No**          | Observer and advisor. May provide input, suggestions, and review to the captain and first officers, but **cannot directly modify code** on the craft's branch. Zero or more per craft. |

**Assignment rules:**

1. Every craft must have exactly one captain.
2. A pilot may only occupy the captain or first officer seat if they hold a certification for the craft's category.
3. A pilot who is not certified for the craft's category may only board in the jumpseat.
4. A pilot may occupy seats on multiple crafts concurrently (e.g., captain on one craft, jumpseat on another).

#### 2.2.4 Controls

A craft has a single set of **controls** that govern which pilot(s) are actively permitted to make changes at any given time. Only the captain and first officers may hold controls; jumpseaters are never eligible.

**Control modes:**

| Mode      | Description                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| Exclusive | A single pilot holds the controls. All other pilots must wait until controls are released.                        |
| Shared    | Two or more pilots hold the controls simultaneously, each with explicit, non-overlapping areas of responsibility. |

**Protocol:**

A pilot claims exclusive controls by announcing **"my controls"** to the crew. The current holder acknowledges by responding **"your controls"**, completing the handoff. This exchange is recorded in the black box.

To transition to shared controls, the pilots involved must coordinate and declare explicit areas of responsibility (e.g., by file, module, or concern). The areas must not overlap. The transition to shared mode and the agreed-upon boundaries are recorded in the black box.

**Rules:**

1. At craft creation, the captain holds exclusive controls by default.
2. Only the captain or a first officer may claim controls. Jumpseaters may never hold controls.
3. A pilot **must not** modify code on the craft's branch unless they currently hold controls (exclusively or within their shared area).
4. Pilots should claim exclusive controls for changes that risk conflicts if done concurrently (e.g., modifying the same file, changing shared interfaces, refactoring across modules).
5. Pilots may use shared controls when working on clearly separable concerns with no risk of interference.
6. If a dispute arises over controls, the captain has final authority.
7. All control transfers and mode changes must be recorded in the black box.

#### 2.2.5 Intercom

The **intercom** is a shared communication channel available to all pilots aboard a craft — captain, first officers, and jumpseaters alike. It functions as a group chat where pilots coordinate, discuss implementation decisions, raise concerns, and perform control handoffs.

All intercom traffic is recorded in the black box.

**Radio Discipline:**

Pilots must follow standard radio rules on the intercom to keep communication clear, explicit, and unambiguous:

1. **Listen before transmitting.** Before sending a message, check that no other pilot is mid-conversation or mid-transmission. Do not interrupt an active exchange.
2. **Use the 3W principle.** Every transmission should establish:
   - **Who you are calling** — the intended recipient(s).
   - **Who you are** — your own identifier.
   - **Where you are** — your current context (e.g., file, or area of the codebase you are working in).
3. **Read back critical instructions.** Safety-critical exchanges — especially control handoffs (`"my controls"` / `"your controls"`) — must be explicitly read back by the receiving pilot to confirm receipt and understanding.
4. **State when you are done.** Explicitly signal when your transmission is complete so other pilots know the channel is free (e.g., ending with your identifier or a clear closing statement).
5. **Keep transmissions concise.** Use clear, direct language. Avoid ambiguity. Favor standard phraseology over casual phrasing.

**Example exchange:**

```
[FO-2 → Captain]: Captain, First Officer 2, working in src/api/routes —
  requesting controls for the auth middleware refactor. Over.

[Captain → FO-2]: First Officer 2, Captain — your controls for
  src/api/routes and auth middleware. I'll hold on the database layer. Over.

[FO-2 → Captain]: Copy, my controls for src/api/routes and auth
  middleware. Captain retains database layer. Over.
```

### 2.3 Tower

The **tower** is a centralized agent responsible for merge coordination. Its responsibilities are:

- Maintaining and sequencing the merge queue.
- Granting or denying landing clearance to crafts requesting to merge.
- Executing the merge of a craft's branch into the main branch upon clearance.

There is one tower per repository.

### 2.4 Vector

A **vector** is a defined milestone that a craft must pass through during its flight. Vectors are the building blocks of a craft's **flight plan** — an ordered sequence of checkpoints that fully describes the path from takeoff to landing.

Each vector has:

| Property            | Description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| Name                | A short, descriptive identifier for the milestone.                             |
| Acceptance Criteria | Specific, verifiable conditions that must be met for the vector to be cleared. |
| Status              | `pending`, `passed`, or `failed`.                                              |

**Key rules:**

1. A craft's flight plan is assigned at creation (during Taxiing) and defines all vectors it must pass through.
2. Vectors are passed through **in order**. A pilot may not skip ahead to a later vector.
3. When a craft passes through a vector, the pilot **must report it to ATC (the tower)**. This report includes the vector name, the acceptance criteria that were satisfied, and any relevant evidence (e.g., test results, artifacts).
4. A craft **cannot enter the Landing Checklist phase** until all vectors in its flight plan have been passed and reported.
5. If a vector's acceptance criteria cannot be met, the pilot may declare an emergency (see Section 5).

### 2.5 Origin Airport

The **origin airport** represents the spec/implementation design stage. Crafts that cannot be landed after repeated attempts are sent back here for re-evaluation.

## 3. Craft Lifecycle

A craft progresses through the following phases:

```
                              ┌──────────────────────────────────┐
                              │           In-Flight              │
                              │                                  │
┌─────────┐     ┌─────────┐  │  ┌────┐   ┌────┐       ┌────┐   │  ┌───────────────────┐
│ Taxiing │────>│ Takeoff │──┼─>│ V1 │──>│ V2 │─ ─ ─ >│ Vn │───┼─>│ Landing Checklist │
└─────────┘     └─────────┘  │  └────┘   └────┘       └────┘   │  └───────────────────┘
                              │    │report   │report     │report │     │       ▲
                              │    ▼         ▼           ▼       │     │       │
                              │          [ ATC Tower ]           │     ▼       │
                              └──────────────────────────────────┘┌───────────┐
                                                                  │ Go-Around │
                              ┌───────────────────┐               └───────────┘
                              │ Cleared to Land   │                    │
                              └───────┬───────────┘                    │ (repeated failures)
                                      │                                ▼
                                      ▼                          ┌────────────┐
                                ┌────────┐                       │ Emergency  │
                                │ Landed │                       └─────┬──────┘
                                └────────┘                             │
                                                                       ▼
                                                               ┌─────────────────┐
                                                               │ Return to Origin│
                                                               └─────────────────┘
```

### 3.1 Phase Definitions

| Phase             | Description                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Taxiing           | Craft is initialized — branch created, pilot(s) assigned, cargo and flight plan defined.                                             |
| In-Flight         | Pilot(s) are actively implementing the change, navigating through assigned vectors in order. Each vector passage is reported to ATC. |
| Landing Checklist | All vectors passed. Pilot runs validation checks (tests, lint, docs, etc.).                                                          |
| Go-Around         | Landing checklist failed. Pilot resumes work to address failures, then re-attempts the checklist.                                    |
| Cleared to Land   | Checklist passed. Tower has granted merge clearance; craft is in the merge queue.                                                    |
| Landed            | Branch has been successfully merged into main. Terminal state.                                                                       |
| Emergency         | Pilot has declared an emergency after repeated go-around failures.                                                                   |
| Return to Origin  | Craft is sent back to the design stage for re-evaluation. Terminal state for the current lifecycle.                                  |

### 3.2 State Transitions

| From              | To                 | Trigger                                                 |
| ----------------- | ------------------ | ------------------------------------------------------- |
| Taxiing           | In-Flight          | Pilot begins implementation.                            |
| In-Flight         | In-Flight (next V) | Pilot passes a vector and reports to ATC.               |
| In-Flight         | Landing Checklist  | All vectors passed and reported; pilot begins checks.   |
| Landing Checklist | Cleared to Land    | All checks pass; tower grants clearance.                |
| Landing Checklist | Go-Around          | One or more checks fail.                                |
| Go-Around         | Landing Checklist  | Pilot re-attempts after addressing failures.            |
| Go-Around         | Emergency          | Repeated failures exceed threshold or pilot escalates.  |
| Cleared to Land   | Landed             | Tower merges branch into main.                          |
| Emergency         | Return to Origin   | Craft is sent back to design stage with failure report. |

## 4. Landing Checklist

The landing checklist is a configurable set of validation steps that must all pass before a craft can request landing clearance. Default checks include:

- **Tests** — All test suites pass.
- **Lint** — No lint errors or warnings.
- **Documentation** — Required docs are present and up to date.
- **Build** — Project builds successfully.

The checklist is executed by the pilot. Failures trigger a go-around.

## 5. Vector Reporting Protocol

Each time a craft passes through a vector, the pilot **must** file a vector report with ATC. This is not optional — unreported vectors are not considered passed.

A vector report contains:

| Field               | Description                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Craft Callsign      | The craft that passed the vector.                                                         |
| Vector Name         | The vector that was passed.                                                               |
| Acceptance Evidence | Proof that the acceptance criteria were met (test output, artifacts, summary of changes). |
| Timestamp           | When the vector was passed.                                                               |

ATC records the report and updates the craft's flight plan status. The tower uses this information to determine whether a craft is eligible for landing clearance — a craft missing any vector report will be denied.

## 6. Emergency Declaration

When a pilot determines that a craft cannot be landed — after repeated go-around failures or an unresolvable vector — the captain **declares an emergency**. The captain records a final `Emergency Declaration` entry in the black box summarizing the issues and attempted remediations, then the craft is returned to the origin airport.

The origin airport receives:

- The craft's callsign, cargo description, and flight plan.
- The **complete black box** — the primary artifact for investigation. It contains the full history of decisions, events, and failures that led to the emergency.

The origin airport uses the black box to diagnose the root cause and determine whether the craft should be re-planned, re-scoped, or abandoned.

## 7. Tower Merge Protocol

When a craft passes its landing checklist, the pilot requests landing clearance from the tower. The tower:

1. Verifies all vectors in the craft's flight plan have been reported as passed.
2. Adds the craft to the merge queue.
3. Sequences merges to avoid conflicts (first-come, first-served by default).
4. Verifies the branch is up to date with main before merging.
5. Executes the merge.
6. Marks the craft as landed.

If a merge conflict arises during the merge attempt, the tower may send the craft on a go-around to rebase/resolve before re-entering the queue.
