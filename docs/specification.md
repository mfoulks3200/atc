# ATC (Air Traffic Control) — Formal Specification

**Version:** 0.5.2
**Status:** Draft
**Date:** 2026-05-04
**Brief:** [`docs/overview.md`](overview.md)

**Changelog:**
- 0.5.2 (2026-05-04): Add repo-resident configuration (.atc/ directory) entity (§2.9, RULE-RCFG-1 through RULE-RCFG-11) and configuration validation protocol (§4.9, RULE-CVAL-1 through RULE-CVAL-6). Defines four-layer config precedence hierarchy, conflict detection and UI, config source indicator API (§4.9.4), CLI validation command, and conflicts REST API (AIR-763).
- 0.5.1 (2026-05-04): Require machine-parseable vector name prefix in `VectorPassed` and `VectorFailed` black box entry `content` fields (RULE-VRPT-11, AIR-770).
- 0.5.0 (2026-05-04): Add CraftLandedMetrics entity (§2.10, RULE-METR-1 through RULE-METR-8) and Dashboard Quality Panel protocol (§4.8, RULE-DASH-1 through RULE-DASH-8). Defines per-craft metrics captured at landing and project-level aggregation for the "From PRs to Production" quality narrative (AIR-764).
- 0.4.0 (2026-04-30): Add Inspector seat type (RULE-SEAT-5/6), UnderReview lifecycle state (RULE-LIFE-9/10), adversarial review protocol §4.8 (RULE-ARVW-1 through RULE-ARVW-5), challenge finding and builder flag schemas §2.8, and five new black box entry types (AIR-265).
- 0.3.2 (2026-04-30): Add constraint dry-run API and structured constraint failure response shape — `?dryRun=true` on `reportVector`, `ConstraintCheckResult`, `ConstraintFailure`, `ConstraintCheckFailed` black box entry, captain override with justification (RULE-VRPT-5 through RULE-VRPT-10, §4.1.1, AIR-324).
- 0.3.1 (2026-04-28): Define integrity bar live-update strategy — triggered poll via `craft.blackbox.appended` (RULE-BBOX-5a, AIR-342).
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
| Inspector        | A seat type for adversarial review. An Inspector can read full craft state, submit challenge findings, and cast a pass/fail verdict gating vector progression. Cannot hold controls or commit changes. |
| Under Review     | A craft lifecycle state entered when an adversarial review vector is active. Builders cannot modify the craft while in this state. |
| Adversarial Review | A structured inspection of a specific vector by an Inspector, gating vector progression before the vector may be reported as passed. |
| Challenge Finding | A structured finding logged by an Inspector during an adversarial review (see §2.8.1). |
| Builder Flag     | A critical issue surfaced by the builder (captain or first officer) during an active adversarial review window, without modifying the evaluated craft state (see §2.8.2). |
| Repo-Resident Configuration | A version-controlled `.atc/` directory at the repository root that provides project-level settings: categories, checklists, and project policies. See §2.9. |
| Config Conflict | A state where repo config (`.atc/config.yaml`) and daemon project config define different values for the same field. Detected eagerly and surfaced, never silently resolved. See §2.9.4. |
| Config Source Indicator | A UI annotation showing which configuration layer (daemon global, repo config, daemon project config, or default) is the current source of a displayed config value. See §2.9.6. |
| Craft Landed Metrics | A per-craft metrics snapshot computed and recorded when a craft transitions to the Landed terminal state. Captures timing, quality, and coordination data for the craft's complete lifecycle. See §2.10. |
| Dashboard Quality Panel | A project-scoped aggregation view that summarizes craft landed metrics as trend lines and indicators, supporting the "From PRs to Production" quality narrative. See §4.8. |
| Go-Around Rate   | The ratio of total go-around events to total landed crafts within a time window. The headline quality metric — lower is better. |
| First-Pass Rate  | The percentage of crafts that land without any go-around. A leading quality indicator. |

## 2. Domain Model

### 2.1 Craft

A **craft** is the fundamental unit of work in ATC. Each craft represents a single discrete change to the codebase.

#### Properties

| Property       | Type                | Constraints                        |
| -------------- | ------------------- | ---------------------------------- |
| Callsign       | `string`            | Unique, immutable after creation.  |
| Created At     | `Date`              | Required. Timestamp when the craft entered the Taxiing phase. |
| Landed At      | `Date`              | Optional. Timestamp when the craft transitioned to the Landed state. Absent until landing. |
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
- **RULE-CRAFT-7:** Every craft MUST record a `landedAt` timestamp at the moment it transitions to the `Landed` state. This timestamp is set exactly once and is immutable thereafter.

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
| `VectorPassed`          | A vector's acceptance criteria were met (alongside ATC vector report). Content MUST use the `[<vectorName>]: passed with evidence: …` prefix format (RULE-VRPT-11). |
| `GoAround`              | A checklist failed and a go-around was initiated.                         |
| `Conflict`              | A disagreement between pilots on approach, and how it was resolved.       |
| `Observation`           | Any other noteworthy event, risk, or context worth preserving.            |
| `EmergencyDeclaration`  | The captain has declared an emergency (final entry before origin handoff).|
| `ChecklistRun`          | A checklist was executed. Contains full `ChecklistRunResult` metadata (see 4.2). |
| `TFRIssued`             | A TFR has taken effect on this craft. Records scope, mode, reason, and issuer.   |
| `TFRLifted`             | A TFR affecting this craft has been lifted. Records duration and issuer.          |
| `CraftCreated`          | The craft was created (flight plan opened, craft enters Taxiing).                 |
| `Launched`              | The craft was launched from Taxiing into InFlight.                                |
| `VectorFailed`          | A vector was reported as failed (reserved for the failing-vector protocol). When emitted, content MUST use the `[<vectorName>]: failed — …` prefix format (RULE-VRPT-11). |
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
| `KeyRotated`            | A pilot's cryptographic signing key was rotated. Records pilot ID, old key fingerprint, new key fingerprint, and rotation timestamp. The payload MUST conform to `KeyRotatedPayload`. See RULE-BBOX-8. |
| `ConstraintCheckFailed`      | One or more ADR constraints on a vector failed at report time. Records the vector name, per-constraint results (see `ConstraintCheckResult`), and any captain-provided override justifications. Not recorded for dry-run attempts. |
| `AdversarialReviewStarted`   | Fired when an Inspector is assigned to an adversarial review vector. Records Inspector pilot ID, vector name, and assignment timestamp. |
| `AdversarialReviewPassed`    | Fired when the Inspector submits a passing verdict on an adversarial review vector. Records Inspector pilot ID, vector name, and optional summary. |
| `AdversarialReviewFailed`    | Fired when the Inspector submits a failing verdict on an adversarial review vector. Records Inspector pilot ID, vector name, and required summary of failure rationale. |
| `ChallengeFindingSubmitted`  | Fired for each finding logged by the Inspector during an active adversarial review. Content is serialized `ChallengeFinding` (see §2.8.1). |
| `BuilderIssueFlagged`        | Fired when the builder submits a flag during an active adversarial review. Content is serialized `BuilderFlag` (see §2.8.2). |

##### Rules

- **RULE-BBOX-1:** The black box MUST be created when the craft enters the Taxiing phase and MUST persist for the craft's entire lifecycle.
- **RULE-BBOX-2:** Black box entries are append-only. No entry may be modified or deleted once recorded.
- **RULE-BBOX-3:** All crew members (captain, first officers, jumpseaters, and inspectors) MAY write to the black box.
- **RULE-BBOX-4:** In the event of an emergency declaration, the complete black box MUST be provided to the origin airport as the primary artifact for investigation.
- **RULE-BBOX-5:** `GET /api/v1/projects/:name/crafts/:callsign/blackbox/verify` MUST return an integrity summary object with the following fields:

  | Field      | Type     | Description |
  | ---------- | -------- | ----------- |
  | `total`    | `number` | Total number of entries in the black box. |
  | `verified` | `number` | Entries whose cryptographic signature was present and passed verification against the authoring pilot's public key. |
  | `unsigned` | `number` | Entries with no signature field (valid for Phase 1 where signing is not yet enforced; see RULE-BBOX-7). |
  | `failed`   | `number` | Entries whose signature was present but failed verification (tampered or key mismatch). |

  The invariant `total = verified + unsigned + failed` MUST hold. In Phase 1 (before RULE-BBOX-7 is enforced), all entries have no signature, so `unsigned === total` and `verified === failed === 0`. The response MUST be 404 if the craft does not exist.

  > **See also:** [AIR-337] integrity bar UI component; [AIR-339] spec definition.

- **RULE-BBOX-5a:** Integrity bar live updates MUST use a triggered-poll strategy — no dedicated verification-failure WebSocket event is defined. Clients SHOULD call `GET /blackbox/verify` after receiving each `craft.blackbox.appended` event on the craft's WebSocket channel (`craft:<callsign>`). Clients that do not subscribe to WebSocket events SHOULD poll the endpoint at 5-second intervals while the integrity bar is visible.

  **Rationale:** Verification is a derived query over current black box state, not a domain event. Emitting a push event on every append would require synchronous verification on the write path — premature before cryptographic signing is enforced (RULE-BBOX-7). The `craft.blackbox.appended` event is already published by the daemon on every write and provides a free trigger that achieves equivalent UI responsiveness without new event types.

  > **See also:** [AIR-342] decision record for this rule; [AIR-337] integrity bar implementation.

- **RULE-BBOX-6:** Trace context fields (`traceId`, `spanId`, `parentSpanId`) are for export/OTel consumption. Implementations are NOT required to render them in primary feed views. They MAY be rendered in detail/inspector views (e.g., the expandable raw key-value table in the entry inspector UI).

- **RULE-BBOX-8:** Whenever a pilot's cryptographic signing key is rotated, a `KeyRotated` black box entry MUST be recorded on every craft where that pilot holds or has held a seat. The entry's `content` field MUST be serialized JSON conforming to `KeyRotatedPayload` (see `@airtrafficcontrol/types`), containing:

  | Field                | Type     | Description                                    |
  | -------------------- | -------- | ---------------------------------------------- |
  | `pilotIdentifier`    | `string` | The pilot whose key was rotated.               |
  | `oldKeyFingerprint`  | `string` | Fingerprint of the replaced key (e.g. `SHA256:…`). |
  | `newKeyFingerprint`  | `string` | Fingerprint of the new active key.             |
  | `rotatedAt`          | `Date`   | When the rotation took effect.                 |

  This entry enables the historical key indicator tooltip (e.g., "Key rotated {date}") to display an accurate rotation date and allows verifiers to determine which key was authoritative at any point in the audit trail. See also RULE-BBOX-7 (future: signing enforcement).

  > **See also:** [AIR-341] `KeyRotated` entry type; [AIR-337] Q3 open question.

### 2.2 Pilot

A **pilot** is an autonomous agent that can be assigned to a craft. Each pilot has a set of properties and a role-based seat assignment that determines their authority on any given craft.

#### 2.2.1 Properties

| Property           | Type       | Constraints                                              |
| ------------------ | ---------- | -------------------------------------------------------- |
| Identifier         | `string`   | Unique across the system.                                |
| Certifications     | `string[]` | List of craft categories the pilot is certified to fly.  |
| Selection Count    | `number`   | Monotonic counter; incremented each time this pilot is auto-selected as captain or first officer via SDD. Persisted; used for equitable scheduling. Default: 0. |
| Public Key         | `string \| null` | Ed25519 public key (base64url-encoded). Optional. When present, used to verify black box entries authored by this pilot. Phase 1: nullable, no enforcement. |
| Public Key History | `Array<{ publicKey: string; activeSince: string; rotatedAt: string }>` | Previous public keys retained after rotation, newest first. Retained indefinitely; see RULE-PILOT-3a. Default: `[]`. |

##### Rules

- **RULE-PILOT-1:** Every pilot MUST have a unique identifier.
- **RULE-PILOT-2:** A pilot's certifications determine which crafts they may serve as captain or first officer on.
- **RULE-PILOT-3:** A pilot MAY carry an optional `publicKey` field (Ed25519, base64url-encoded). When present, the daemon MUST use it — along with all entries in `publicKeyHistory` — when verifying that pilot's black box entry signatures via `GET /blackbox/verify`. Phase 1 adds the field as nullable with no enforcement; verification is optional until RULE-BBOX-7 is enforced.
- **RULE-PILOT-3a:** When a pilot's `publicKey` is rotated, the outgoing key MUST be appended to `publicKeyHistory` as `{ publicKey, activeSince, rotatedAt }` where `activeSince` is when that key was first recorded and `rotatedAt` is the rotation timestamp. `publicKeyHistory` MUST be retained indefinitely — implementations MUST NOT prune archived keys. The verify endpoint MUST search `publicKey` and all `publicKeyHistory` entries when resolving a signature against a black box entry, to preserve verifiability of entries signed before the rotation.

> **Key management path (enterprise v2).** A companion rule RULE-BBOX-7 will make Black Box entries optionally signed at write time. For enterprise deployments, daemon-managed private keys (stored via OS keyring, e.g. `node-keytar`) are the named v1 key management path. The named v2 enterprise path is HSM/KMS delegation: AWS KMS (customer-managed key / CMK), HashiCorp Vault (Transit secrets engine), or Azure Key Vault (managed HSM). In HSM/KMS mode, the daemon holds only a key reference; raw private key material never leaves the provider. This is a named requirement, not an optional consideration, for any implementation of RULE-PILOT-3 targeting enterprise customers.
>
> See `docs/agent/operating-manual.md §9` for operator-facing guidance on this integration path.

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

### 2.9 Repository Configuration

The `.atc/` directory provides version-controlled, repo-resident configuration that travels with the codebase. It is the canonical authoring surface for project-specific settings: craft categories, checklist templates, flight plan templates, and project-level policies.

#### 2.9.1 Directory Structure

```
<repo-root>/
└── .atc/
    └── config.yaml           # Project configuration
```

The `.atc/` directory MUST be located in the repository root. The daemon discovers it by resolving the repository root from the project's configured working directory.

#### 2.9.2 Config File Schema

`.atc/config.yaml` contains project-level configuration fields. All fields are optional; omitted fields inherit from the daemon project config or built-in defaults.

| Field                    | Type                                  | Description                                                              |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------------ |
| `categories`             | `string[]`                            | Project craft categories.                                                |
| `checklist`              | `ChecklistItemConfig[]`               | Project checklist items (same schema as daemon project config).          |
| `allowAutoLaunch`        | `boolean`                             | Whether SDD autoLaunch is permitted (see RULE-SDD-11).                  |
| `pilotSelectionFoWeight` | `number`                              | FO weight for pilot auto-selection workload scoring (see §4.6.4).       |
| `mcpServers`             | `Record<string, McpServerConfig>`     | MCP server definitions available to pilots on this project.             |

The schema is a subset of the daemon project config schema (`ProjectMetadataConfig`). Fields that are daemon-internal (e.g., `name`, `remoteUrl`) are NOT valid in `.atc/config.yaml` and MUST be rejected on parse.

#### 2.9.3 Config Precedence Hierarchy

ATC resolves configuration through four ordered layers. Higher layers take precedence over lower layers for the same field.

| Priority | Layer                  | Source                                          | Mutability            |
| -------- | ---------------------- | ----------------------------------------------- | --------------------- |
| 1 (highest) | Daemon global config | `~/.atc/config.json`                            | API / file edit       |
| 2        | Repo config            | `<repo-root>/.atc/config.yaml`                  | Git commit / file edit |
| 3        | Daemon project config  | `<profileDir>/projects/<name>/metadata.json`    | API / file edit       |
| 4 (lowest) | Built-in defaults    | Compiled into the daemon                        | Immutable             |

The effective value for any field is the value from the highest-priority layer that defines it.

**Rationale:**

- **Daemon global config (Layer 1)** represents operator-enforced policy across all projects. The daemon operator controls the infrastructure and must be able to enforce constraints (e.g., disabling `autoLaunch` globally). This is an intentional override and does not generate conflicts.
- **Repo config (Layer 2)** represents the project team's committed intent. It is version-controlled, reviewable, and travels with the codebase. It takes precedence over daemon project config because committed configuration should not be silently overridden by runtime state.
- **Daemon project config (Layer 3)** provides runtime supplements — values not committed to the repo, such as daemon-specific connection settings or temporary overrides applied through the web UI.
- **Built-in defaults (Layer 4)** provide baseline values when no layer defines a field.

#### 2.9.4 Config Conflict Detection

When Layer 2 (repo config) and Layer 3 (daemon project config) both define a value for the same field and the values differ, this is a **config conflict**. Conflicts MUST be detected and surfaced — silent last-write-wins resolution is not acceptable.

Config conflicts do not block daemon operation. The daemon starts normally and resolves the effective value using the precedence hierarchy. But the conflict MUST be:

1. Logged as a warning at daemon startup and on every file reload that introduces a conflict.
2. Exposed via the conflicts REST API endpoint (see §4.9.3).
3. Visible in the web UI project settings page (see §2.9.6).

Layer 1 (daemon global config) overrides by design and does not generate conflicts. An operator who sets a global value has intentionally chosen to enforce it.

**Conflict Schema:**

| Field                | Type                          | Description                                                     |
| -------------------- | ----------------------------- | --------------------------------------------------------------- |
| `field`              | `string`                      | Dot-path of the conflicting field (e.g., `"categories"`).       |
| `repoValue`          | `unknown`                     | Value from `.atc/config.yaml`.                                  |
| `daemonProjectValue` | `unknown`                     | Value from daemon project config.                               |
| `resolvedValue`      | `unknown`                     | Effective value after precedence resolution.                    |
| `resolvedFrom`       | `"repo" \| "daemon_global"`  | Which layer supplied the resolved value.                        |

#### 2.9.5 File Loading and Staleness

The daemon loads `.atc/config.yaml` at project registration time and watches the file for changes using the same content-hash + mtime fingerprinting strategy as other `LayeredConfigStore` instances.

- On file change detection, the daemon reloads the file, recomputes the merged config, and re-evaluates conflicts.
- On file deletion, the daemon falls back to daemon project config + defaults. Any previously detected conflicts for this project are cleared.
- On parse or validation failure of a changed file, the daemon MUST retain the last valid config and emit an `invalid_external_edit` event on the project's config channel. The daemon MUST NOT crash or revert to defaults on a bad file edit.
- Config changes from file reload MUST be broadcast via the `config:project:<name>` WebSocket channel with source `"file"`.

#### 2.9.6 Web UI Behavior

**When `.atc/config.yaml` is present and valid:**

- The web UI project settings page MUST display the **effective (merged) value** for each field, not the raw daemon project config value.
- Fields whose effective value comes from `.atc/config.yaml` MUST be visually distinguished from daemon-only fields. The indicator MUST include the source layer name (e.g., "from .atc/config.yaml").
- Fields whose effective value comes from daemon global config MUST also be distinguished with their source (e.g., "enforced by daemon global config").
- If a user attempts to edit a field whose effective value is sourced from `.atc/config.yaml` or daemon global config, the web UI MUST display a warning explaining that the field is controlled by a higher-precedence layer and cannot be overridden from the UI. The edit MUST be rejected — the UI MUST NOT write a daemon project config value for a field that would be immediately overridden by a higher layer.
- Fields with active config conflicts MUST display both the `.atc/` value and the daemon project config value, with a visual indicator showing the conflict and which value is in effect.

**Edit-rejection warning message templates (RULE-RCFG-10):**

The warning message displayed when a user attempts to edit a locked field MUST branch by controlling layer:

- `.atc/` layer: "This field is set in `.atc/config.yaml` and cannot be edited from the UI. To change it, commit a new value to `.atc/config.yaml`."
- Daemon global layer: "This field is enforced by daemon global config and cannot be overridden from the UI. Contact your daemon operator to change it."

**When `.atc/config.yaml` is present but invalid** (parse or schema failure after a file edit):

- The project settings page MUST display a persistent banner: "Repo config (.atc/config.yaml) has errors and is not loaded. Showing last valid configuration."
- The banner is triggered by the `invalid_external_edit` event on the `config:project:<name>` WebSocket channel.
- The banner MUST clear when a valid file is subsequently reloaded.

**When `.atc/config.yaml` is absent:**

- The UI renders without source indicators or conflict indicators — this is the same behavior as before repo config was introduced.
- Implementors MUST NOT add empty-state banners or placeholder indicators when the file is absent. The absence of the file is a normal state, not an error.

#### Rules

- **RULE-RCFG-1:** The `.atc/` directory MUST be located in the repository root. The daemon MUST discover it by resolving the repository root from the project's configured working directory.
- **RULE-RCFG-2:** `.atc/config.yaml` MUST be validated against the project config schema on load. Parse failures MUST be reported as `CONFIG_PARSE_ERROR`. Schema validation failures MUST be reported as `CONFIG_VALIDATION_ERROR`. Daemon-internal fields (`name`, `remoteUrl`) MUST be rejected.
- **RULE-RCFG-3:** Config precedence MUST follow the four-layer hierarchy defined in §2.9.3: daemon global > repo config > daemon project config > built-in defaults. The effective value for any field is the value from the highest-priority layer that defines it.
- **RULE-RCFG-4:** When repo config (Layer 2) and daemon project config (Layer 3) define different values for the same field, a config conflict MUST be detected and surfaced. Conflicts MUST NOT be silently resolved without warning.
- **RULE-RCFG-5:** Config conflicts MUST be logged as warnings at daemon startup and on every file reload that introduces or resolves a conflict.
- **RULE-RCFG-6:** The daemon MUST watch `.atc/config.yaml` for external changes and reload automatically using content-hash + mtime fingerprinting. On reload, the merged config MUST be recomputed and conflicts re-evaluated.
- **RULE-RCFG-7:** On parse or validation failure of a changed `.atc/config.yaml`, the daemon MUST retain the last valid config and emit an `invalid_external_edit` event on the `config:project:<name>` channel. The daemon MUST NOT crash or revert to defaults.
- **RULE-RCFG-8:** The web UI MUST display effective (merged) config values, not raw daemon project config values, when `.atc/config.yaml` is present.
- **RULE-RCFG-9:** Fields sourced from `.atc/config.yaml` or daemon global config MUST be visually distinguished in the web UI, including the source layer name.
- **RULE-RCFG-10:** The web UI MUST NOT allow edits to fields controlled by a higher-precedence config layer (`.atc/` or daemon global). Attempting to edit such a field MUST display a warning naming the controlling layer and reject the edit.
- **RULE-RCFG-11:** Fields with active config conflicts MUST display both values and a conflict indicator in the web UI.

### 2.10 Craft Landed Metrics

**Craft landed metrics** are a per-craft metrics snapshot computed and persisted when a craft transitions to the `Landed` terminal state. They capture the quantitative record of the craft's complete lifecycle — timing through each state, quality signals (go-arounds, checklist failures, merge conflicts), and coordination costs (crew size, control transfers, queue wait time).

Landed metrics are the atomic input to the Dashboard Quality Panel (§4.8). They are never modified after creation.

#### Properties

| Property              | Type              | Description                                                                                     |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `callsign`            | `string`          | The craft this metric record belongs to. Immutable reference.                                   |
| `category`            | `CraftCategory`   | The craft's category at landing. Enables per-category aggregation.                              |
| `landedAt`            | `Date`            | Timestamp when the craft entered the `Landed` state.                                            |
| `totalDuration`       | `number`          | Wall-clock milliseconds from `Taxiing` entry (`createdAt`) to `Landed`.                         |
| `taxiingDuration`     | `number`          | Milliseconds spent in `Taxiing`.                                                                |
| `inFlightDuration`    | `number`          | Milliseconds spent in `InFlight`.                                                               |
| `checklistDuration`   | `number`          | Cumulative milliseconds spent in `LandingChecklist` (across all attempts including go-arounds). |
| `queueDuration`       | `number`          | Milliseconds from `ClearedToLand` entry to `Landed` (merge queue wait).                        |
| `goAroundCount`       | `number`          | Number of `GoAround` state transitions recorded in the craft's lifecycle.                       |
| `vectorCount`         | `number`          | Total vectors in the craft's flight plan.                                                       |
| `vectorFailedCount`   | `number`          | Number of `VectorFailed` black box entries. Zero means every vector passed on first attempt.    |
| `checklistRunCount`   | `number`          | Total number of `ChecklistRun` black box entries (includes all attempts).                       |
| `checklistFailCount`  | `number`          | Number of `ChecklistRun` entries whose result was a failure.                                    |
| `mergeConflictCount`  | `number`          | Number of `MergeConflict` black box entries recorded during the craft's lifecycle.               |
| `crewSize`            | `number`          | Total pilots aboard at landing (captain + first officers + jumpseaters).                        |
| `controlTransferCount`| `number`          | Number of control transfer events (black box entries recording control handoffs).               |
| `blackBoxEntryCount`  | `number`          | Total entries in the craft's black box at landing.                                              |

#### Computation

Metrics are computed from two sources at the moment the craft transitions to `Landed`:

1. **State durations** are derived from `StateTransition` black box entries. The duration of each state is the difference between consecutive transition timestamps. If multiple visits to a state occur (e.g., `LandingChecklist` → `GoAround` → `LandingChecklist`), durations are summed.
2. **Event counts** are derived by counting black box entries of the relevant `BlackBoxEntryType` (e.g., `GoAround`, `VectorFailed`, `ChecklistRun`, `MergeConflict`).

The computation is deterministic: given the same black box, the same metrics MUST be produced.

#### Persistence

Craft landed metrics MUST be persisted alongside craft state. The daemon MUST store metrics in the project's metrics store as a time-series, indexed by `callsign` and `landedAt`. Metrics MUST be queryable by project, category, and time range.

#### Rules

- **RULE-METR-1:** The daemon MUST compute and persist a `CraftLandedMetrics` record at the moment a craft transitions to the `Landed` state. No metrics record is created for crafts that reach `ReturnToOrigin`.
- **RULE-METR-2:** All duration fields MUST be derived from `StateTransition` black box entries. If a craft visited a state multiple times (e.g., multiple `LandingChecklist` entries due to go-arounds), the durations MUST be summed.
- **RULE-METR-3:** All event count fields MUST be derived by counting black box entries of the corresponding `BlackBoxEntryType`. The count MUST include all entries recorded from craft creation through the `Landed` transition, inclusive.
- **RULE-METR-4:** Metrics records are immutable after creation. They MUST NOT be modified, recalculated, or deleted.
- **RULE-METR-5:** The metrics computation MUST be deterministic: given the same black box contents, the same metrics MUST be produced regardless of when or how many times the computation runs.
- **RULE-METR-6:** Metrics MUST be queryable via the REST API by project, category, and time range. The API MUST support both individual metric retrieval (by callsign) and batch retrieval (by project with optional filters).
- **RULE-METR-7:** `vectorFailedCount` MUST be computed by counting `VectorFailed` black box entries whose `content` field matches the structured prefix format defined in RULE-VRPT-11. Entries that do not match the prefix format MUST still be counted but SHOULD be flagged in API responses as `unparseable`.
- **RULE-METR-8:** `goAroundCount` is the headline quality metric. A value of `0` indicates a first-pass landing — the craft completed its lifecycle without any rework cycle.

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

| Field                | Type                        | Required | Description                                                        |
| -------------------- | --------------------------- | -------- | ------------------------------------------------------------------ |
| Craft Callsign       | `string`                    | Yes      | The craft that passed the vector.                                  |
| Vector Name          | `string`                    | Yes      | The vector that was passed.                                        |
| Acceptance Evidence  | `string`                    | Yes      | Proof that acceptance criteria were met (test output, artifacts).  |
| Timestamp            | `Date`                      | Yes      | When the vector was passed.                                        |
| Constraint Overrides | `ConstraintOverride[]`      | No       | Captain-authored justifications for overriding `error` constraints. Each entry references a `constraintId` and carries a free-text `justification`. Only the captain may supply overrides. See §4.1.1. |

#### Rules

- **RULE-VRPT-1:** A vector report MUST be filed each time a craft passes through a vector. This is not optional.
- **RULE-VRPT-2:** A vector report MUST include the craft callsign, vector name, acceptance evidence, and timestamp.
- **RULE-VRPT-3:** ATC MUST record the report and update the craft's flight plan status.
- **RULE-VRPT-4:** A craft missing any vector report MUST be denied landing clearance.
- **RULE-VRPT-5:** Before recording a vector report, the daemon MUST evaluate all ADR constraints bound to the vector (see §4.1.1). Any `error`-severity constraint that fails and is not covered by a valid captain override (see RULE-VRPT-9) MUST block the report. The response MUST be `422 Unprocessable Entity` with a structured `ConstraintFailure` list (see §4.1.1).
- **RULE-VRPT-6:** When a real (non-dry-run) report attempt is blocked by constraint failures, the daemon MUST record a `ConstraintCheckFailed` black box entry containing the vector name, the full `ConstraintCheckResult` (per-constraint pass/fail, severity, failure reason), and any override justifications provided.
- **RULE-VRPT-7:** The `reportVector` endpoint MUST support a `?dryRun=true` query parameter. In dry-run mode, the daemon evaluates all ADR constraints and returns a `ConstraintCheckResult` but does NOT record the report, does NOT write a black box entry, and does NOT mutate any state. The response format is identical to a successful dry-run check even when constraints fail, so pilots can iterate to compliance before committing.
- **RULE-VRPT-8:** Warning-severity constraints (`severity: "warning"`) MUST NOT block a report. Their results MUST be included in the `ConstraintCheckResult` returned on both real and dry-run calls so pilots are informed, but they do not gate the transition.
- **RULE-VRPT-9:** Only the captain of the craft MAY supply constraint overrides in the report payload. A non-captain pilot (first officer, jumpseat) who supplies a `constraintOverrides` array MUST receive `403 Forbidden`. Each override MUST include a non-empty `justification`. An `error` constraint covered by a valid captain override is treated as passing for the purpose of RULE-VRPT-5.
- **RULE-VRPT-10:** The `remediationHint` field in every `ConstraintFailure` MUST carry the ADR rationale — why the constraint exists, not merely how to satisfy it mechanically. Constraint definitions that omit a `remediationHint` MUST fail validation at constraint-creation time.
- **RULE-VRPT-11:** The `content` field of every `VectorPassed` and `VectorFailed` black box entry MUST begin with the vector name enclosed in square brackets, followed by a colon and space: `[<vectorName>]: <description>`. This structured prefix enables machine-parseable correlation of pass and fail events by vector name (e.g., to compute `vectorFirstPassRate`) without fragile free-text parsing. Parsers MUST extract the vector name by matching the pattern `/^\[([^\]]+)\]: /`. The description that follows the prefix is free-text and carries the human-readable context (e.g., `passed with evidence: …` or `failed — <reason>`).

#### 4.1.1 Constraint Failure Response Shape

This section defines the structured types used to communicate ADR constraint results on both dry-run checks and real report failures.

##### ConstraintCheckResult

Returned by `POST /api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/report?dryRun=true`, and embedded in `ConstraintCheckFailed` black box entries.

| Field             | Type                  | Description                                                          |
| ----------------- | --------------------- | -------------------------------------------------------------------- |
| `dryRun`          | `boolean`             | Always `true` when returned from the dry-run path.                   |
| `vectorName`      | `string`              | The vector that was checked.                                         |
| `constraintResults` | `ConstraintResult[]` | Per-constraint evaluation results.                                   |
| `passed`          | `boolean`             | `true` iff no `error`-severity constraints failed (ignoring overrides). |
| `errorCount`      | `number`              | Number of `error`-severity constraint failures.                      |
| `warningCount`    | `number`              | Number of `warning`-severity constraint failures.                    |

##### ConstraintResult

One entry per ADR constraint evaluated against the vector.

| Field             | Type                              | Description                                                          |
| ----------------- | --------------------------------- | -------------------------------------------------------------------- |
| `constraintId`    | `string`                          | Unique identifier for the ADR constraint (e.g., `"ADR-003"`).        |
| `name`            | `string`                          | Human-readable constraint name.                                      |
| `severity`        | `"error"` \| `"warning"`         | Whether failure blocks the report (`error`) or is advisory (`warning`). |
| `passed`          | `boolean`                         | Whether this constraint passed.                                      |
| `failureReason`   | `string \| null`                  | Machine-readable description of why the check failed. `null` if passed. |
| `remediationHint` | `string \| null`                  | ADR rationale plus remediation steps. `null` if passed. See RULE-VRPT-10. |
| `overridden`      | `boolean`                         | `true` if a captain-supplied justification covered this failure. Only applicable on real (non-dry-run) reports. |
| `justification`   | `string \| null`                  | The captain's justification when `overridden` is `true`. `null` otherwise. |

##### ConstraintFailure (error response shape)

The HTTP `422` error body when `POST /api/v1/projects/:name/crafts/:callsign/vectors/:vectorName/report` is blocked by constraint violations. This shape is also returned with each individual `ConstraintResult` when iterating failures.

```json
{
  "error": "CONSTRAINT_VIOLATIONS",
  "message": "1 error-severity constraint(s) failed on vector API-auth",
  "checkResult": {
    "dryRun": false,
    "vectorName": "API-auth",
    "passed": false,
    "errorCount": 1,
    "warningCount": 0,
    "constraintResults": [
      {
        "constraintId": "ADR-003",
        "name": "Zero-Trust Endpoints",
        "severity": "error",
        "passed": false,
        "failureReason": "Route /health missing auth middleware",
        "remediationHint": "Per ADR-003, all API routes must authenticate. This prevents unauthenticated access to internal health endpoints that may expose service topology. To exempt /health, add it to the project's auth-exempt allowlist with a documented justification.",
        "overridden": false,
        "justification": null
      }
    ]
  }
}
```

##### Dry-run response example

`POST /api/v1/projects/myproject/crafts/add-oauth2-login-01/vectors/API-auth/report?dryRun=true`

```json
{
  "dryRun": true,
  "vectorName": "API-auth",
  "passed": false,
  "errorCount": 1,
  "warningCount": 0,
  "constraintResults": [
    {
      "constraintId": "ADR-003",
      "name": "Zero-Trust Endpoints",
      "severity": "error",
      "passed": false,
      "failureReason": "Route /health missing auth middleware",
      "remediationHint": "Per ADR-003, all API routes must authenticate. This prevents unauthenticated access to internal health endpoints that may expose service topology. To exempt /health, add it to the project's auth-exempt allowlist with a documented justification.",
      "overridden": false,
      "justification": null
    }
  ]
}
```

##### Open Question Resolution Record

The following decisions resolve the open questions from [AIR-324](/AIR/issues/AIR-324):

| Question | Decision | Rationale |
| -------- | -------- | --------- |
| Same route or separate `/validate` endpoint? | `?dryRun=true` on the existing report route | Consistent with RULE-SDD-15; avoids surface fragmentation. |
| Partial per-constraint evidence in dry-run? | No — dry-run accepts the full report payload. | Per-constraint evidence isolation is complex and not needed in v1. Pilots iterate the full dry-run. |
| Black box entry for dry-run failures? | No black box entry. | Dry-run is side-effect-free (matching SDD's RULE-SDD-15). Speculative failures must not pollute the audit trail. |
| Does constraint failure block entirely, or allow override? | `error` constraints block by default; captain may override with justification (RULE-VRPT-9). | Models ADR exception processes. Override is recorded in `ConstraintCheckFailed` entry for auditability. |

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

### 4.8 Dashboard Quality Panel

The Dashboard Quality Panel aggregates `CraftLandedMetrics` (§2.10) into a project-scoped view that communicates quality trends over time. It supports the "From PRs to Production" narrative: the measure of an orchestration system is not how many PRs it produces, but how much working software it ships.

#### 4.8.1 Design Principles

The quality panel follows these display principles:

1. **Trend lines, not point-in-time snapshots.** Every metric is displayed as a time-series chart. The downward slope of rework indicators IS the product's proof of value.
2. **No gross PR/craft count.** The panel MUST NOT display total crafts landed as a headline metric. Throughput without quality context is misleading.
3. **Show the project's own improvement.** Comparisons are against the project's own historical baseline, not contested industry benchmarks.
4. **Leading indicators alongside lagging indicators.** Leading indicators predict future quality; lagging indicators confirm past quality. Both are required for actionable insight.
5. **Empty-state preview for new projects.** Projects with no landed crafts MUST display an informative empty state explaining what will appear once crafts begin landing, not a blank panel.

#### 4.8.2 Metrics Taxonomy

**Headline Metric:**

| Metric            | Type     | Formula                                                          | Interpretation                              |
| ----------------- | -------- | ---------------------------------------------------------------- | ------------------------------------------- |
| Go-Around Rate    | Lagging  | `sum(goAroundCount) / count(landed crafts)` over the time window | Lower is better. Zero is first-pass perfect. |

**Leading Indicators:**

| Metric                  | Type    | Formula                                                                            | Interpretation                                                     |
| ----------------------- | ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Vector First-Pass Rate  | Leading | `count(crafts where vectorFailedCount == 0) / count(landed crafts)` × 100          | Percentage of crafts whose vectors all passed on first attempt.    |
| Checklist First-Pass Rate | Leading | `count(crafts where checklistFailCount == 0) / count(landed crafts)` × 100        | Percentage of crafts whose checklists passed without failure.      |
| Mean Crew Size          | Leading | `avg(crewSize)` over the time window                                               | Coordination overhead indicator. Trending up may signal complexity. |

**Lagging Indicators:**

| Metric                | Type    | Formula                                                          | Interpretation                                                     |
| --------------------- | ------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Merge Conflict Rate   | Lagging | `count(crafts where mergeConflictCount > 0) / count(landed crafts)` × 100 | Percentage of crafts that encountered at least one merge conflict. |
| Mean Time to Land     | Lagging | `avg(totalDuration)` over the time window                        | Average wall-clock time from craft creation to landing.            |
| Mean Queue Wait       | Lagging | `avg(queueDuration)` over the time window                        | Average time spent in the merge queue (ClearedToLand → Landed).   |
| Rework Cycle Count    | Lagging | `sum(goAroundCount)` over the time window                        | Total go-around events across all crafts. Absolute rework volume.  |

#### 4.8.3 Time Windows

The quality panel supports configurable time windows for aggregation. The daemon MUST support the following preset windows:

| Window    | Description                  |
| --------- | ---------------------------- |
| `7d`      | Last 7 calendar days.        |
| `30d`     | Last 30 calendar days.       |
| `90d`     | Last 90 calendar days.       |
| `all`     | All time (since first craft landed). |

The default window is `30d`. The selected window applies to all metrics in the panel simultaneously — mixed windows within a single panel view are not permitted.

#### 4.8.4 Category Filtering

All metrics MUST support optional filtering by `CraftCategory`. When a category filter is applied, only `CraftLandedMetrics` records matching that category are included in the aggregation. The unfiltered view includes all categories.

#### 4.8.5 REST API

The daemon MUST expose a metrics aggregation endpoint:

```
GET /api/v1/projects/:projectId/metrics/quality-panel?window=30d&category=feature
```

**Query Parameters:**

| Parameter  | Type     | Required | Default | Description                                    |
| ---------- | -------- | -------- | ------- | ---------------------------------------------- |
| `window`   | `string` | No       | `30d`   | Time window preset: `7d`, `30d`, `90d`, `all`. |
| `category` | `string` | No       | (none)  | Filter by craft category. Omit for all.        |

**Response Shape:**

```json
{
  "window": "30d",
  "category": null,
  "periodStart": "2026-04-04T00:00:00.000Z",
  "periodEnd": "2026-05-04T00:00:00.000Z",
  "craftCount": 42,
  "headline": {
    "goAroundRate": 0.31
  },
  "leading": {
    "vectorFirstPassRate": 85.7,
    "checklistFirstPassRate": 90.5,
    "meanCrewSize": 2.1
  },
  "lagging": {
    "mergeConflictRate": 14.3,
    "meanTimeToLand": 3600000,
    "meanQueueWait": 120000,
    "reworkCycleCount": 13
  },
  "trend": [
    {
      "bucketStart": "2026-04-04T00:00:00.000Z",
      "bucketEnd": "2026-04-11T00:00:00.000Z",
      "craftCount": 10,
      "goAroundRate": 0.5,
      "vectorFirstPassRate": 80.0,
      "mergeConflictRate": 20.0
    }
  ]
}
```

The `trend` array divides the selected window into weekly buckets. Each bucket contains the same metrics computed over that sub-period. Buckets with zero landed crafts MUST be included with `craftCount: 0` and all rate fields set to `null`.

#### 4.8.6 WebSocket Updates

When a new `CraftLandedMetrics` record is persisted, the daemon MUST broadcast a `metrics.quality.updated` event on the project's WebSocket channel. The payload includes the project ID and the callsign of the newly landed craft. Dashboard clients receiving this event SHOULD refresh the quality panel.

#### Rules

- **RULE-DASH-1:** The Dashboard Quality Panel MUST display all metrics as time-series trend lines. Point-in-time snapshots without trend context are not sufficient.
- **RULE-DASH-2:** The Dashboard Quality Panel MUST NOT display total crafts landed as a headline metric. Throughput without quality context is misleading and invites the wrong optimization.
- **RULE-DASH-3:** The go-around rate (§4.8.2) is the headline metric. It MUST be the most visually prominent element of the quality panel.
- **RULE-DASH-4:** The panel MUST display both leading indicators (vector first-pass rate, checklist first-pass rate, mean crew size) and lagging indicators (merge conflict rate, mean time to land, mean queue wait, rework cycle count) simultaneously.
- **RULE-DASH-5:** The panel MUST support time window selection from the preset list in §4.8.3. The selected window MUST apply to all metrics uniformly.
- **RULE-DASH-6:** The panel MUST support optional category filtering. When applied, all metrics MUST be recomputed using only `CraftLandedMetrics` records matching the selected category.
- **RULE-DASH-7:** Projects with no landed crafts MUST display an informative empty state explaining what metrics will appear once crafts begin landing. The empty state MUST NOT be a blank panel or a generic "no data" message.
- **RULE-DASH-8:** The metrics aggregation API (§4.8.5) MUST return weekly trend buckets within the selected time window. Buckets with zero landed crafts MUST be included with `craftCount: 0` and rate fields set to `null`, not omitted.

### 4.9 Configuration Validation Protocol

This protocol defines how ATC validates `.atc/config.yaml` at daemon startup, exposes config conflicts via the REST API, and provides a standalone CLI validation command for CI/CD use.

#### 4.9.1 Daemon Startup Validation

When the daemon starts and discovers a `.atc/config.yaml` for a registered project:

1. **Parse** the file as YAML. On parse failure, log `CONFIG_PARSE_ERROR` with the file path and error detail. Skip repo config for this project (fall back to daemon project config + defaults).
2. **Validate** the parsed content against the project config schema. On validation failure, log `CONFIG_VALIDATION_ERROR` with field-level details. Skip repo config for this project.
3. **Merge** the validated repo config with daemon global config and daemon project config using the four-layer precedence hierarchy (§2.9.3).
4. **Detect conflicts** between repo config (Layer 2) and daemon project config (Layer 3). Log each conflict as a structured warning naming both sources, the conflicting values, and the resolved effective value.
5. **Expose conflicts** via `GET /api/v1/projects/:name/config/conflicts` (see §4.9.3).

Validation failures at startup are warnings, not fatal errors. The daemon MUST start normally using daemon project config + defaults when `.atc/config.yaml` is invalid.

#### 4.9.2 CLI Validation Command

```bash
atc config validate [--project <name>] [--format json|text]
```

The `atc config validate` command performs the full validation pipeline against the current `.atc/config.yaml` without requiring a running daemon. It is designed for use in CI/CD pipelines and pre-commit hooks.

**Validation steps:**

1. Locate `.atc/config.yaml` in the current working directory (or the project root if `--project` is given and the daemon is reachable).
2. Parse the file as YAML.
3. Validate against the project config schema.
4. If the daemon is running and reachable, check for conflicts with daemon project config.
5. Report results.

**Exit codes:**

| Code | Meaning                                                                         |
| ---- | ------------------------------------------------------------------------------- |
| 0    | Valid — no parse errors, no schema violations, no conflicts.                    |
| 1    | Parse error — `.atc/config.yaml` is malformed YAML.                            |
| 2    | Validation error — one or more fields fail schema validation.                   |
| 3    | Conflict detected — repo config conflicts with daemon project config. Non-fatal for CI/CD: the config is valid and will load, but a human should resolve the ambiguity. |
| 4    | File not found — no `.atc/config.yaml` in the resolved directory.              |

When the daemon is not reachable, conflict detection (exit code 3) is skipped and the command validates parse + schema only.

When both parse/schema errors (codes 1 or 2) and conflicts (code 3) exist, the command MUST exit with the lowest (highest-severity) code. For example, a file with a parse error AND a conflict exits 1, not 3.

**JSON output format (`--format json`):**

Each entry in `errors` includes an optional `fixHint` field with a short human-readable suggestion for how to resolve the error:

```json
{
  "valid": false,
  "filePath": ".atc/config.yaml",
  "errors": [
    {
      "code": "CONFIG_VALIDATION_ERROR",
      "field": "categories",
      "message": "Expected array, received string",
      "fixHint": "Change 'categories' to a list of category name strings, e.g. [\"Backend\", \"Frontend\"]."
    }
  ],
  "conflicts": [
    {
      "field": "checklist",
      "repoValue": [{"name": "Tests", "command": "pnpm test"}],
      "daemonProjectValue": [{"name": "Tests", "command": "npm test"}],
      "resolvedValue": [{"name": "Tests", "command": "pnpm test"}],
      "resolvedFrom": "repo"
    }
  ]
}
```

**Text output format (default):**

Success case:

```
✓ .atc/config.yaml is valid
```

Error and conflict case:

```
✗ .atc/config.yaml:categories — Expected array, received string (CONFIG_VALIDATION_ERROR)
  Fix: Change 'categories' to a list of category name strings, e.g. ["Backend", "Frontend"].

✗ .atc/config.yaml — Malformed YAML near line 4 (CONFIG_PARSE_ERROR)

⚠ .atc/config.yaml:checklist conflicts with daemon project config 'checklist'. Repo config takes precedence.

1 error, 1 conflict
```

(The `Fix:` line is omitted when `fixHint` is not available for an error.)

#### 4.9.3 Conflicts REST API

```
GET /api/v1/projects/:name/config/conflicts
```

Returns the current list of config conflicts for a project. Returns an empty conflict list when `.atc/config.yaml` is not present or not valid.

**Response schema:**

| Field                | Type                | Description                                                          |
| -------------------- | ------------------- | -------------------------------------------------------------------- |
| `projectName`        | `string`            | The project name.                                                    |
| `conflicts`          | `ConfigConflict[]`  | Current conflicts (see §2.9.4 for `ConfigConflict` schema).         |
| `repoConfigPresent`  | `boolean`           | Whether `.atc/config.yaml` was found for this project.               |
| `repoConfigValid`    | `boolean`           | Whether the file parsed and validated successfully. `false` if not present. |
| `lastRepoConfigLoad` | `string \| null`    | ISO 8601 timestamp of the last successful load. `null` if never loaded. |

**Example response:**

```json
{
  "projectName": "my-project",
  "conflicts": [
    {
      "field": "categories",
      "repoValue": ["Backend", "Frontend", "DevOps"],
      "daemonProjectValue": ["Backend", "Frontend"],
      "resolvedValue": ["Backend", "Frontend", "DevOps"],
      "resolvedFrom": "repo"
    }
  ],
  "repoConfigPresent": true,
  "repoConfigValid": true,
  "lastRepoConfigLoad": "2026-05-04T12:00:00.000Z"
}
```

#### 4.9.4 Config Source Indicator API

The existing project config GET endpoint MUST be extended to include per-field source metadata when `.atc/config.yaml` is present. This enables the web UI to render config source indicators (see RULE-RCFG-9).

```
GET /api/v1/projects/:name/config
```

The response MUST include a `sources` map alongside the config values:

| Field     | Type                                  | Description                                                       |
| --------- | ------------------------------------- | ----------------------------------------------------------------- |
| `config`  | `ProjectMetadataConfig`               | The effective (merged) config.                                    |
| `sources` | `Record<string, ConfigSourceInfo>`    | Per-field source metadata. Only present when `.atc/` is loaded.   |

**ConfigSourceInfo schema:**

| Field          | Type                                                          | Description                                              |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `layer`        | `"daemon_global" \| "repo" \| "daemon_project" \| "default"` | Which layer supplied the effective value.                |
| `hasConflict`  | `boolean`                                                     | Whether this field has a conflict between layers.        |

When `.atc/config.yaml` is not present, the `sources` field MAY be omitted entirely — existing API clients that do not use source indicators are unaffected.

#### 4.9.5 Error Reference

| Code                       | HTTP | Description                                                                 |
| -------------------------- | ---- | --------------------------------------------------------------------------- |
| `CONFIG_PARSE_ERROR`       | 400  | `.atc/config.yaml` is malformed YAML.                                       |
| `CONFIG_VALIDATION_ERROR`  | 422  | One or more fields in `.atc/config.yaml` fail schema validation.            |
| `CONFIG_CONFLICT`          | —    | Repo config value conflicts with daemon project config value. Not an HTTP error; surfaced via the conflicts endpoint (§4.9.3) and daemon logs. |

**`resolvedFrom` display-name mapping:**

The `resolvedFrom` field in conflict objects uses internal enum values. When surfacing conflicts in user-visible messages, logs, or UI, implementations MUST translate these values to their human-readable display names:

| `resolvedFrom` enum value | Human-readable display name              |
| ------------------------- | ---------------------------------------- |
| `"repo"`                  | `"Repo config (.atc/config.yaml)"`       |
| `"daemon_global"`         | `"Daemon global config"`                 |

**Error message template for `CONFIG_CONFLICT`:**

```
".atc/config.yaml:{field} conflicts with daemon project config '{field}'. {resolvedFromDisplayName} takes precedence. Repo value: {repoValue}. Daemon value: {daemonProjectValue}. Effective value: {resolvedValue}."
```

Where `{resolvedFromDisplayName}` is the human-readable display name from the table above (e.g., `"Repo config (.atc/config.yaml)"` or `"Daemon global config"`), not the raw enum value.

Both sources MUST be named in every conflict message. The resolved effective value and the layer that supplied it MUST be included.

#### Rules

- **RULE-CVAL-1:** Config conflicts MUST be detected eagerly at daemon startup and on every `.atc/config.yaml` file reload — not lazily at request time.
- **RULE-CVAL-2:** Config conflict warnings MUST name both the `.atc/config.yaml` field path and the daemon project config key that conflicts, the conflicting values from both sources, the resolved effective value, and which layer supplied it.
- **RULE-CVAL-3:** The `atc config validate` command MUST perform parse and schema validation without requiring a running daemon. When the daemon is reachable, it MUST also check for conflicts. It MUST exit with distinct codes: 0 (valid), 1 (parse error), 2 (validation error), 3 (conflict), 4 (file not found).
- **RULE-CVAL-4:** `atc config validate` MUST support `--format json` for machine-readable output in CI/CD pipelines. The JSON output MUST include `valid`, `filePath`, `errors`, and `conflicts` fields.
- **RULE-CVAL-5:** `GET /api/v1/projects/:name/config/conflicts` MUST return the current conflict list, repo config presence and validity status, and the last successful load timestamp.
- **RULE-CVAL-6:** `GET /api/v1/projects/:name/config` MUST include a `sources` map with per-field `ConfigSourceInfo` when `.atc/config.yaml` is loaded. The web UI uses this map to render config source indicators (see RULE-RCFG-9).

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
| RULE-CRAFT-7   | Craft must record a landedAt timestamp when transitioning to Landed. | 2.1     |
| RULE-BBOX-1    | Black box created at Taxiing, persists for lifecycle.                | 2.1.1   |
| RULE-BBOX-2    | Black box entries are append-only, immutable.                        | 2.1.1   |
| RULE-BBOX-3    | All pilots (including jumpseaters) may write to black box.           | 2.1.1   |
| RULE-BBOX-4    | Complete black box provided to origin on emergency.                  | 2.1.1   |
| RULE-BBOX-5    | GET /blackbox/verify returns integrity summary: total, verified, unsigned, failed. | 2.1.1 |
| RULE-BBOX-5a   | Integrity bar uses triggered-poll via `craft.blackbox.appended`; poll at 5s if no WS. | 2.1.1 |
| RULE-BBOX-6    | Trace context fields are for export; NOT required in primary feed views; MAY appear in detail/inspector views. | 2.1.1 |
| RULE-BBOX-8    | KeyRotated entry required on every craft when a pilot's signing key is rotated.   | 2.1.1 |
| RULE-PILOT-1   | Pilot identifier must be unique.                                     | 2.2.1   |
| RULE-PILOT-2   | Certifications determine captain/FO eligibility.                     | 2.2.1   |
| RULE-PILOT-3   | Pilot MAY have optional publicKey (Ed25519); daemon uses it + publicKeyHistory for /blackbox/verify. | 2.2.1 |
| RULE-PILOT-3a  | On key rotation, outgoing key MUST be appended to publicKeyHistory with activeSince/rotatedAt; retained indefinitely. | 2.2.1 |
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
| RULE-ICOM-6    | System notifications must include source, summary, and bbox ref.     | 2.2.5   |
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
| RULE-LIFE-5    | LandingChecklist → ClearedToLand requires all required checks pass + tower. | 3.3 |
| RULE-LIFE-6    | ClearedToLand → Landed requires branch up to date + merge.         | 3.3     |
| RULE-LIFE-7    | Emergency → ReturnToOrigin requires EmergencyDeclaration in bbox.   | 3.3     |
| RULE-LIFE-8    | Landed and ReturnToOrigin are terminal; no transitions out.          | 3.3     |
| RULE-VRPT-1    | Vector report must be filed on every vector passage.                 | 4.1     |
| RULE-VRPT-2    | Report must include callsign, vector name, evidence, timestamp.      | 4.1     |
| RULE-VRPT-3    | ATC must record report and update flight plan status.                | 4.1     |
| RULE-VRPT-4    | Missing vector report means landing clearance denied.                | 4.1     |
| RULE-VRPT-5    | Error-severity ADR constraints block report; unoverridden failures return 422 with ConstraintFailure list. | 4.1 |
| RULE-VRPT-6    | Real (non-dry-run) constraint failures must record ConstraintCheckFailed black box entry with full results. | 4.1 |
| RULE-VRPT-7    | reportVector supports ?dryRun=true; evaluates constraints, returns ConstraintCheckResult, no state mutation. | 4.1 |
| RULE-VRPT-8    | Warning-severity constraints never block; results included in ConstraintCheckResult for pilot visibility. | 4.1 |
| RULE-VRPT-9    | Only the captain may supply constraintOverrides; non-captain overrides return 403; justification must be non-empty. | 4.1 |
| RULE-VRPT-10   | remediationHint must carry ADR rationale (why), not just mechanical fix (how); omitting it fails constraint creation. | 4.1.1 |
| RULE-VRPT-11   | VectorPassed and VectorFailed content MUST begin with `[<vectorName>]: ` for machine-parseable vector name extraction. | 4.1 |
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
| RULE-RCFG-1    | `.atc/` directory must be in repo root; daemon discovers via working directory. | 2.9     |
| RULE-RCFG-2    | `.atc/config.yaml` validated on load; parse/schema errors reported, daemon-internal fields rejected. | 2.9 |
| RULE-RCFG-3    | Config precedence: daemon global > repo config > daemon project config > defaults. | 2.9.3 |
| RULE-RCFG-4    | Repo/daemon project config conflicts must be detected and surfaced, not silently resolved. | 2.9.4 |
| RULE-RCFG-5    | Config conflicts logged as warnings at startup and on every reload.  | 2.9.4   |
| RULE-RCFG-6    | Daemon watches `.atc/config.yaml` for changes via content-hash + mtime fingerprinting. | 2.9.5 |
| RULE-RCFG-7    | Invalid `.atc/` file change retains last valid config; emits `invalid_external_edit`. | 2.9.5 |
| RULE-RCFG-8    | Web UI displays effective (merged) config, not raw daemon project config. | 2.9.6 |
| RULE-RCFG-9    | Fields sourced from `.atc/` or daemon global must show source indicator in web UI. | 2.9.6 |
| RULE-RCFG-10   | Web UI rejects edits to fields controlled by higher-precedence config layers. | 2.9.6 |
| RULE-RCFG-11   | Fields with active config conflicts display both values and conflict indicator. | 2.9.6 |
| RULE-METR-1    | Daemon must compute and persist CraftLandedMetrics at Landed transition; no record for ReturnToOrigin. | 2.10 |
| RULE-METR-2    | Duration fields derived from StateTransition black box entries; multi-visit states summed. | 2.10 |
| RULE-METR-3    | Event count fields derived from black box entry counts, inclusive of all entries through landing. | 2.10 |
| RULE-METR-4    | Metrics records are immutable after creation; no modification, recalculation, or deletion. | 2.10 |
| RULE-METR-5    | Metrics computation must be deterministic: same black box → same metrics. | 2.10 |
| RULE-METR-6    | Metrics queryable via REST API by project, category, and time range; individual and batch retrieval. | 2.10 |
| RULE-METR-7    | vectorFailedCount uses RULE-VRPT-11 prefix format; unparseable entries counted but flagged. | 2.10 |
| RULE-METR-8    | goAroundCount is the headline quality metric; zero indicates first-pass landing. | 2.10 |
| RULE-DASH-1    | Quality panel must display all metrics as time-series trend lines, not point-in-time snapshots. | 4.8 |
| RULE-DASH-2    | Quality panel must not display total crafts landed as a headline metric. | 4.8 |
| RULE-DASH-3    | Go-around rate is the headline metric; must be most visually prominent. | 4.8 |
| RULE-DASH-4    | Panel must display leading and lagging indicators simultaneously. | 4.8 |
| RULE-DASH-5    | Panel must support time window selection from preset list; uniform across all metrics. | 4.8.3 |
| RULE-DASH-6    | Panel must support optional category filtering; recomputes all metrics for selected category. | 4.8.4 |
| RULE-DASH-7    | Projects with no landed crafts must show informative empty state, not blank panel. | 4.8 |
| RULE-DASH-8    | Metrics API must return weekly trend buckets; zero-craft buckets included with null rates. | 4.8.5 |
| RULE-CVAL-1    | Config conflicts detected eagerly at daemon startup and file reload, not lazily at request time. | 4.9.1 |
| RULE-CVAL-2    | Conflict warnings name both source paths, both values, resolved value, and resolving layer. | 4.9.1 |
| RULE-CVAL-3    | `atc config validate` CLI validates without daemon; exits 0/1/2/3/4 for valid/parse/schema/conflict/missing. | 4.9.2 |
| RULE-CVAL-4    | `atc config validate --format json` provides machine-readable output for CI/CD. | 4.9.2 |
| RULE-CVAL-5    | `GET /config/conflicts` returns conflict list, repo config presence/validity, and last load timestamp. | 4.9.3 |
| RULE-CVAL-6    | `GET /config` includes per-field `sources` map with layer and conflict metadata when `.atc/` is loaded. | 4.9.4 |
