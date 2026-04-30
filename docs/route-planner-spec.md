# Route Planner Feature Specification

> **Status:** Revised — steering committee feedback incorporated
> **Author:** Steering Lead (AIR-349)
> **Version:** 0.3.0
> **Date:** 2026-04-29
> **Reviewers:** AI Futurist (AIR-350), Platform Engineer (AIR-351), UX Designer (AIR-352)

## 1. Overview

The **Route Planner** is an AI-powered interactive interview feature that guides a user through a structured conversation to produce a complete, implementation-ready craft spec document. It replaces the current blank-page approach to spec authoring with a guided discovery process that front-loads all decisions pilots need to implement autonomously.

### 1.1 Design Philosophy

The Route Planner operates under two core principles:

1. **Front-load all ambiguity.** Every question a pilot would need to ask mid-flight should be asked and answered during the interview, before the craft launches. A well-planned route means pilots never need to stop and ask for clarification.

2. **Show, don't tell.** For any feature with a user-facing surface, the Route Planner generates visual mockups so the user can approve the direction before a single line of code is written. Alignment on visuals prevents mid-flight course corrections.

### 1.2 Scope Boundary

The Route Planner **ONLY produces a skill document** — a structured artifact containing the gathered requirements, acceptance criteria, UI mockups, and implementation guidance. It does **not** write code, create branches, or modify the codebase. Its output feeds into the existing craft creation API to create a craft.

### 1.3 ATC Terminology Mapping

| Route Planner Concept | ATC Domain Term | Description |
|---|---|---|
| Route | Flight Plan | The ordered sequence of implementation milestones |
| Waypoint | Vector | A single milestone with acceptance criteria |
| Route Map | Spec Document | The complete artifact produced by the interview |
| Ground Briefing | Interview | The structured Q&A session with the user |
| Terrain Survey | UI Prototyping | Visual mockup generation for user-facing features |

## 2. Interview Protocol

### 2.1 Interview Structure

The interview follows a phased approach, moving from broad intent to precise specification. Each phase must complete before the next begins.

```
Phase 1: Intent Discovery
    "What are you trying to build and why?"

Phase 2: Scope Framing
    "What's in scope, what's explicitly out?"

Phase 3: Domain Decomposition
    "What are the moving parts?"

Phase 4: Acceptance Criteria
    "How will we know each part is done?"

Phase 5: Visual Alignment (conditional)
    "Does this look right to you?"

Phase 6: Risk & Constraint Surface (skippable)
    "What could go wrong or constrain the approach?"

Phase 7: Review & Confirmation
    "Here's the complete route — approve for filing?"
```

### 2.2 Question Taxonomy

Questions are categorized into domains. The Route Planner selects questions from each domain based on the project type and user responses.

#### 2.2.1 Intent Questions (Phase 1)

These establish the "why" and high-level "what."

| ID | Question | Purpose |
|---|---|---|
| INT-1 | What problem does this solve, or what capability does it add? | Establishes motivation — becomes the `cargo` preamble |
| INT-2 | Who is the primary user or consumer of this change? | Identifies the audience — shapes acceptance criteria language |
| INT-3 | What does success look like when this is complete? | Defines the north star — validates final spec completeness |
| INT-4 | Is there an existing feature this replaces, extends, or depends on? | Identifies dependencies and migration concerns |
| INT-5 | What is the desired priority level? (low / medium / high / critical) | Maps directly to spec document `priority` field |

#### 2.2.2 Scope Questions (Phase 2)

These draw the boundary of the work.

| ID | Question | Purpose |
|---|---|---|
| SCP-1 | Beyond your success definition, are there additional specific artifacts or deliverables? | Enumerates concrete outputs beyond the north star from INT-3 |
| SCP-2 | What is explicitly NOT included in this work? | Prevents scope creep — captured in spec `notes` |
| SCP-3 | Are there related changes that should be separate crafts, or is this scope large enough to warrant splitting into multiple crafts? | Identifies follow-up work and decomposition needs |
| SCP-4 | What is the craft category? (or describe the nature of the work) | Maps to `category` field — must match project-configured categories |
| SCP-5 | Are there specific pilots or certifications needed for this work? | Maps to `pilots` field in spec |

#### 2.2.3 Domain Decomposition Questions (Phase 3)

These break the work into implementable vectors.

| ID | Question | Purpose |
|---|---|---|
| DOM-1 | What are the major functional areas of this change? | Seeds vector generation |
| DOM-2 | What is the natural implementation order? Are there dependencies between areas? | Establishes vector ordering |
| DOM-3 | For each area: what files, modules, or layers are affected? | Helps pilots scope each vector |
| DOM-4 | Are there data model or schema changes? | Surfaces migration vectors |
| DOM-5 | Are there API surface changes (new endpoints, modified contracts)? | Surfaces contract-first vectors |
| DOM-6 | Are there user-facing UI changes? | Triggers the Visual Alignment phase |

#### 2.2.4 Acceptance Criteria Questions (Phase 4)

These produce the specific, binary, testable criteria for each vector.

| ID | Required | Question | Purpose |
|---|---|---|---|
| ACC-1 | Yes | For [vector N]: what must be true when this milestone is complete? | Direct input to vector `criteria` |
| ACC-2 | Yes | For [vector N]: how would you verify this works? | Ensures criteria are testable |
| ACC-3 | Yes | For [vector N]: are there edge cases or error conditions to handle? | Captures non-happy-path criteria |
| ACC-4 | No | For [vector N]: are there performance or quality requirements? (default: none) | Surfaces non-functional requirements |
| ACC-5 | No | Should the craft include specific test expectations? (default: none) | Enriches implementation guidance |

ACC-4 and ACC-5 are optional. The Route Planner offers them but the user may skip with a default of "no specific requirements." This reduces cognitive load for Phase 4, which scales with vector count.

#### 2.2.5 Visual Alignment Questions (Phase 5 — Conditional)

Triggered only when DOM-6 indicates user-facing UI changes.

| ID | Question | Purpose |
|---|---|---|
| VIS-1 | What is the entry point for this UI? (new page, modal, panel, inline element) | Establishes component hierarchy |
| VIS-2 | What information needs to be displayed? | Defines content requirements |
| VIS-3 | What actions can the user take? | Defines interaction requirements |
| VIS-4 | Are there existing UI patterns in the project that this should match? | Ensures visual consistency |
| VIS-5 | [Presents generated mockup] Does this layout match your expectation? | Visual approval gate |
| VIS-6 | [If rejected] What should change about this layout? | Iterative refinement |

#### 2.2.6 Risk & Constraint Questions (Phase 6 — Skippable)

These surface implementation constraints and potential blockers. The user may skip this phase, in which case `context.risks` is present but marked "Not reviewed."

| ID | Question | Purpose |
|---|---|---|
| RSK-1 | Are there backward compatibility requirements? | Constrains implementation approach |
| RSK-2 | Are there security considerations (auth, input validation, data exposure)? | Ensures security requirements are explicit |
| RSK-3 | Are there performance constraints (latency, throughput, memory)? | Surfaces non-functional requirements |
| RSK-4 | Are there existing tests that this change might break? | Identifies regression risk |
| RSK-5 | Is there specific documentation that must be updated? | Captures doc-update vectors |

#### 2.2.7 Review & Confirmation Questions (Phase 7)

The review phase presents the complete skill document for user inspection before filing.

| ID | Question | Purpose |
|---|---|---|
| REV-1 | [Presents rendered skill document summary] Does this spec accurately capture what you want built? | Final approval gate |
| REV-2 | [If issues found] Which section needs revision? | Routes user back to the relevant phase |
| REV-3 | Would you like to submit this to ATC for craft creation, or save as a filed spec? | Determines post-filing action |

The review phase renders a structured summary — not a raw YAML dump. The summary presents: title, cargo, vector list with criteria, decisions made, risks identified, and approved mockups (if any). The user can approve, go back to any phase to revise, or discard the session.

### 2.3 Adaptive Question Selection

Not every question is asked in every interview. The Route Planner uses an adaptive selection model:

1. **Phase 1 (Intent)** — Always fully asked. These are the minimum viable questions.
2. **Phase 2 (Scope)** — Always asked. SCP-4 determines the craft category. SCP-5 (pilot requirements) is asked after the category is established.
3. **Phase 3 (Domain)** — DOM-6 conditionally gates Phase 5. DOM-4 and DOM-5 are skipped if the work is purely documentation or configuration.
4. **Phase 4 (Acceptance)** — ACC-1 through ACC-3 asked per vector. ACC-4 and ACC-5 offered but skippable.
5. **Phase 5 (Visual)** — Only entered if DOM-6 confirms UI changes. Loops on VIS-5/VIS-6 until approval.
6. **Phase 6 (Risk)** — Skippable at user request. If entered, all RSK questions are asked.
7. **Phase 7 (Review)** — Always entered. REV-1 is the final gate.

### 2.4 Interview Behavior Rules

- **RULE-RPLAN-1:** The Route Planner MUST ask exactly one question at a time. It MUST NOT bundle multiple questions into a single prompt.
- **RULE-RPLAN-2:** The Route Planner MUST offer multiple-choice options when the answer space is bounded (e.g., priority, category, yes/no). Open-ended questions are used only when the answer space is unbounded.
- **RULE-RPLAN-3:** The Route Planner MUST surface a progress indicator that satisfies all of: (a) all seven phases are visible at all times, (b) the current phase is highlighted or otherwise visually distinguished, (c) Phase 5 renders conditionally — ghosted or visually muted until DOM-6 triggers it, at which point it activates, (d) within the active phase, the current question position is shown (e.g., "Question 2 of 5"). The user must always know where they are at both the phase and question level.
- **RULE-RPLAN-4:** The Route Planner MUST allow the user to revisit and amend answers from any previous phase at any point during the interview. Changing an earlier answer may invalidate later answers — the Route Planner MUST flag affected downstream answers and re-ask only the invalidated questions.
- **RULE-RPLAN-5:** The Route Planner MUST support session persistence. If the user exits mid-interview, the session state MUST be recoverable on the next invocation. Resuming a session in the `Filed` state creates an amendment session (see §6.4), not a re-opened in-progress session.
- **RULE-RPLAN-6:** The Route Planner MUST NOT generate any code, create any branches, modify any files outside its own session state, or interact with the craft creation endpoint. Its sole output is a skill document.
- **RULE-RPLAN-21:** When a user's answer contradicts a prior phase gate decision (e.g., Phase 4 criteria imply UI changes when DOM-6 was answered "no"), the Route Planner MUST flag the conflict, state both the conflicting answers, explain which earlier decision is affected, and ask the user to resolve the contradiction before continuing. The Route Planner MUST NOT silently include contradictory requirements in the skill document.
- **RULE-RPLAN-22:** Phases 1–4 and 7 are mandatory and MUST NOT be skipped. Phase 5 is conditional — it is entered only when DOM-6 indicates user-facing UI changes (see §2.3). Phase 6 is skippable — the user may decline to identify risks, in which case the `context.risks` section is present but marked "Not reviewed."

## 3. UI Prototyping Subsystem

### 3.1 Purpose

When a craft involves user-facing UI changes, the Route Planner generates simple visual mockups during Phase 5 to align the user's mental model with the planned implementation before any code is written.

### 3.2 Mockup Generation

Mockups are generated as simplified wireframe-style layouts. They are NOT high-fidelity designs — they represent structure, content placement, and interaction flow.

#### 3.2.1 Mockup Content

Each mockup includes:

- **Layout structure** — Component hierarchy, panels, sections
- **Content placeholders** — Labels, data fields, lists with representative sample data
- **Interaction points** — Buttons, inputs, toggles, navigation elements with annotations
- **State variations** — Empty state, loaded state, error state (when applicable)

#### 3.2.2 Mockup Format

Mockups are rendered as either:

1. **ASCII wireframes** — For terminal/CLI contexts. Simple box-drawing layouts.
2. **HTML/CSS snapshots** — For browser contexts. Static pages using a minimal wireframe stylesheet, viewable in any browser. No JavaScript, no build step.

The Route Planner selects the format based on the execution context (CLI vs. browser).

#### 3.2.3 Mockup Feedback

Mockup annotation (drawing on or marking up mockups directly) is **out of scope for v1**. The approved feedback mechanism for mockup iteration is the VIS-6 text description — the user describes the desired changes in words, and the Route Planner regenerates the mockup accordingly.

#### 3.2.4 Mockup Presentation

In the web UI, mockups are presented in a **split panel** layout:

- **Desktop (≥ 1024px):** Left panel shows the interview chat; right panel shows the current mockup. The user can see the question alongside the visual. The mockup panel is expandable to full-screen for detailed review.
- **Mobile:** Bottom sheet that slides up when a mockup is presented, overlaying the lower portion of the chat.

#### 3.2.5 Mockup Iteration

- **RULE-RPLAN-7:** Each mockup MUST be presented to the user with an explicit approval prompt: "Does this layout match your expectation? (approve / request changes)"
- **RULE-RPLAN-8:** If the user requests changes, the Route Planner MUST generate a revised mockup incorporating the feedback and re-present for approval. This loop continues until the user approves.
- **RULE-RPLAN-9:** Approved mockups MUST be included in the final skill document as reference artifacts. They serve as visual acceptance criteria for the implementing pilots.

### 3.3 Mockup Scope

The Route Planner generates mockups for:

- New pages or routes
- New modals or dialogs
- Significant layout changes to existing views
- New interactive components (forms, wizards, panels)

It does NOT generate mockups for:

- Backend-only changes
- Configuration changes
- Minor text or style tweaks
- Internal refactoring

### 3.4 Accessibility Requirements

The Route Planner's web UI MUST meet the following accessibility requirements:

- **Progress indicator:** Each phase element MUST carry `aria-current="step"` when active and `aria-label` describing phase name and status (e.g., `aria-label="Phase 3: Domain Decomposition — complete"`).
- **Mockup container:** MUST use `aria-live="polite"` so screen readers announce mockup updates without interrupting the user.
- **HTML mockups:** MUST have `role="img"` and an `aria-label` summarizing the layout (sourced from the `alt_description` field — see §4.2).
- **Chat inputs:** All input fields MUST have an explicit `<label>` element associated via `for`/`id` pairing. Placeholder text alone is not sufficient.
- **Session resume summary:** When a session is resumed (RULE-RPLAN-19), the state summary MUST be rendered with `aria-live="assertive"` so it is announced immediately to screen reader users.

## 4. Skill Document Output

### 4.1 Purpose

The Route Planner's sole output is a **skill document** — a comprehensive, structured artifact that contains everything a pilot needs to implement the described work autonomously, without asking further questions.

### 4.2 Skill Document Structure

```yaml
# Route Planner Skill Document
version: "1.0"
metadata:
  generated_by: route-planner
  generated_at: "2026-04-28T12:00:00Z"
  session_id: "rplan-a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  interview_duration_minutes: 15
  corpus_eligible: true

# === Spec Fields (used for craft creation) ===
spec:
  title: "Add user profile settings page"
  cargo: |
    Users need the ability to view and edit their profile information
    (display name, email, notification preferences) from a dedicated
    settings page accessible from the main navigation sidebar.
  category: "frontend"
  priority: "medium"
  vectors:
    - id: "vec-001"
      name: "Profile data model"
      criteria:
        - "UserProfile interface defined with fields: displayName, email, notificationPrefs"
        - "GET /api/v1/profile returns current user profile"
        - "PATCH /api/v1/profile updates profile fields with validation"
    - id: "vec-002"
      name: "Settings page UI"
      criteria:
        - "New route /settings/profile renders a form with profile fields"
        - "Form pre-fills with current profile data on load"
        - "Save button submits PATCH and shows success toast"
        - "Validation errors display inline next to affected fields"
    - id: "vec-003"
      name: "Navigation integration"
      criteria:
        - "Sidebar includes 'Settings' link under user section"
        - "Active state highlights correctly when on /settings/*"
  pilots:
    requireCertifications: ["frontend", "backend"]
  notes: |
    Out of scope: avatar upload, password change, account deletion.
    These are planned as separate crafts.
  autoLaunch: false

# === Extended Context (beyond craft API fields) ===
context:
  motivation: |
    Users currently have no way to change their display name or notification
    preferences after initial setup. Support tickets for name changes are
    the #3 most common request.

  constraints:
    - "Must match existing settings page patterns (see /settings/general)"
    - "Profile endpoint must not expose sensitive fields (password hash, tokens)"
    - "Notification preferences use the existing NotificationChannel enum"

  risks:
    - risk: "Email change could break existing notification subscriptions"
      mitigation: "Require email re-verification flow (out of scope, add guard)"
    - risk: "Profile endpoint is unauthenticated in current codebase"
      mitigation: "Add auth middleware check — new vector if not already present"

  decisions:
    - question: "Should profile changes require password confirmation?"
      answer: "No — only email changes will require re-verification (future craft)"
      rationale: "Low-risk fields (display name, prefs) don't warrant friction"

  related_work:
    - "Avatar upload (separate craft, depends on file storage)"
    - "Account deletion (separate craft, requires legal review)"

# === Visual Artifacts ===
mockups:
  - id: "profile-settings-page"
    description: "Profile settings form layout"
    alt_description: "Profile settings form with display name, email, and notification preference fields."
    approved: true
    format: "ascii"
    content: |
      +--------------------------------------------------+
      | Settings > Profile                          [Save] |
      +--------------------------------------------------+
      |                                                    |
      |  Display Name                                      |
      |  +----------------------------------------------+  |
      |  | Atlas Foulks                                 |  |
      |  +----------------------------------------------+  |
      |                                                    |
      |  Email                                             |
      |  +----------------------------------------------+  |
      |  | atlas@example.com                            |  |
      |  +----------------------------------------------+  |
      |                                                    |
      |  Notifications                                     |
      |  +----------------------------------------------+  |
      |  | [x] Email    [ ] Slack    [x] In-app         |  |
      |  +----------------------------------------------+  |
      |                                                    |
      +--------------------------------------------------+

  - id: "profile-settings-error"
    description: "Validation error state"
    alt_description: "Profile settings form showing a validation error on the empty display name field."
    approved: true
    format: "ascii"
    content: |
      +--------------------------------------------------+
      | Settings > Profile                          [Save] |
      +--------------------------------------------------+
      |                                                    |
      |  Display Name                                      |
      |  +----------------------------------------------+  |
      |  |                                              |  |
      |  +----------------------------------------------+  |
      |  ! Display name is required                        |
      |                                                    |
      +--------------------------------------------------+

# === Amendments (post-filing additions — see §6.4) ===
amendments: []
```

### 4.3 Spec Field Mapping

The `spec` section maps to the daemon's existing craft creation API (`POST /api/v1/projects/:name/crafts`). The SDD `/crafts/from-spec` endpoint is specified but not yet implemented; v1 submission uses the existing endpoint with field translation:

| Skill Document Field | Daemon API Field | Notes |
|---|---|---|
| `spec.title` | (callsign auto-generated) | Used for callsign generation; not a direct API field |
| `spec.cargo` | `cargo` | Direct mapping |
| `spec.category` | `category` | Direct mapping |
| `spec.vectors[].name` | `flightPlan[].name` | Direct mapping |
| `spec.vectors[].criteria[]` | `flightPlan[].acceptanceCriteria` | Criteria joined as string per entry |
| `spec.priority` | (skill doc metadata) | Stored in skill document; carried as context |
| `spec.pilots.captain` | `captain` | Explicit pilot ID if provided |
| `spec.pilots.firstOfficers` | `firstOfficers` | Explicit pilot IDs if provided |
| `spec.pilots.jumpseaters` | `jumpseaters` | Explicit pilot IDs if provided |
| `spec.pilots.requireCertifications` | (advisory) | Used for pilot selection guidance |
| `spec.notes` | (appended to cargo) | Included as additional context |
| `spec.autoLaunch` | (post-creation transition) | If true and guards pass, transition to InFlight |

The `context`, `decisions`, `risks`, and `mockups` sections are extensions that provide implementation guidance beyond what the craft API captures. These travel with the skill document and are available to pilots in their operating context.

**Future:** When `POST /api/v1/projects/:name/crafts/from-spec` is implemented, field mapping simplifies to direct SDD SpecDocument fields.

### 4.4 Skill Document Rules

- **RULE-RPLAN-10:** The skill document MUST include a valid `spec` section that satisfies all mandatory fields for craft creation (title, cargo, category, at least one vector with criteria). If validation fails at filing time, the Route Planner MUST display each failing field with an explanation and re-enter the affected phase(s) to collect the missing information. The Route Planner MUST NOT present bare error messages without a recovery path.
- **RULE-RPLAN-11:** The `context.decisions` section MUST include every significant design decision made during the interview, with the question asked, the answer chosen, and the rationale. Pilots MUST NOT need to re-derive these decisions.
- **RULE-RPLAN-12:** The `context.risks` section MUST include every risk surfaced during Phase 6, with a mitigation strategy or explicit acknowledgment.
- **RULE-RPLAN-13:** The `mockups` section MUST include all approved mockups from Phase 5. Each mockup MUST be marked with `approved: true` and include an `alt_description` field (see §3.4). Unapproved mockups MUST NOT appear in the final document.
- **RULE-RPLAN-14:** The skill document MUST be self-contained. A pilot reading only this document — with no access to the interview transcript — must have all information needed to implement the work.

### 4.5 Vector Identity

Each vector carries a stable semantic `id` field (e.g., `vec-001`). These IDs are generated at vector creation time and are immutable once assigned. They enable:

- Cross-referencing vectors in amendments (§6.4)
- Correlating vectors across decomposed crafts
- Future learning corpus queries (§10)
- Backwards-compatible criteria format evolution

The `id` field is required in the skill document but is stripped during craft API submission (the daemon does not use it).

**Future extensibility:** The `criteria` field is currently `string[]`. A future `criteriaV2` field may add structured criteria (type, command, threshold) as a backwards-compatible extension alongside `criteria`, not a replacement.

## 5. Craft Decomposition

### 5.1 Multi-Craft Detection

Some interviews reveal work that should be decomposed into multiple crafts. The Route Planner detects this when:

- The user identifies clearly independent functional areas in Phase 3
- Vector count exceeds a configurable threshold (default: 8)
- The work spans multiple craft categories
- The user explicitly requests decomposition in Phase 2 (SCP-3)

Decomposition detection fires at the **Phase 3→4 transition boundary** — after all domain decomposition questions are answered but before acceptance criteria are collected.

### 5.2 Decomposition Behavior

- **RULE-RPLAN-15:** When decomposition is warranted, the Route Planner MUST present the proposed craft boundaries to the user for approval before generating multiple skill documents.
- **RULE-RPLAN-16:** Each decomposed skill document MUST be independently valid — no circular dependencies between the generated specs. Implementation order MUST be stated in each document's `context.related_work` section.
- **RULE-RPLAN-17:** The Route Planner MUST identify shared vectors (e.g., "update shared types") that appear in multiple decomposed crafts and consolidate them into a single prerequisite craft.

## 6. Session Management

### 6.1 Session Lifecycle

```
Created → In Progress → Review → Filed → (optional) Submitted
                                   ↓
                            Filed (Amended) → (optional) Submitted
```

| State | Description |
|---|---|
| Created | Session initialized, no questions asked yet |
| In Progress | Interview underway, questions being asked and answered |
| Review | All phases complete, user reviewing final skill document |
| Filed | Skill document finalized and saved. Interview complete. |
| Filed (Amended) | Filed spec with one or more amendments appended (see §6.4) |
| Submitted | Skill document submitted for craft creation (optional, user-initiated) |

### 6.2 Session Persistence

- **RULE-RPLAN-18:** Session state MUST be persisted after each question-answer exchange using atomic writes (write to temp file, then `rename()`). The persistence format MUST include: all answered questions with responses, current phase and question index, generated vectors, approved mockups, and any decisions logged.
- **RULE-RPLAN-19:** When a user resumes a session, the Route Planner MUST summarize the current state (phase, vectors so far, outstanding questions) before continuing.

### 6.3 Session Storage

Sessions are stored as JSON files following the daemon's established storage conventions:

```
<profileDir>/state/projects/<project>/route-planner/sessions/<session-id>/session.json
```

Session IDs use UUID v4 format with a `rplan-` prefix (e.g., `rplan-a1b2c3d4-e5f6-7890-abcd-ef1234567890`), generated at session creation time.

This path mirrors the existing craft store pattern (`<profileDir>/state/projects/<project>/crafts/<callsign>/craft.json`). Per-exchange persistence (RULE-RPLAN-18) calls `atomicWriteJson()` directly rather than using the `FlushScheduler`, since immediate durability is required.

### 6.4 Amendment Sessions

Once a skill document is filed, the original spec is treated as immutable. However, real-world implementation may surface new requirements — a pilot discovers an undocumented dependency, a vector's scope needs expansion, or a new constraint emerges mid-flight.

An **amendment session** provides a controlled evolution path:

1. **Triggered by** resuming a session in the `Filed` state (RULE-RPLAN-5)
2. **Starts with** the filed skill document as immutable read-only context
3. **Runs a lightweight interview** scoped to the delta only: new vectors, revised constraints, new risks, new decisions
4. **Produces an addendum** appended to the skill document under the `amendments[]` key

Each amendment is structured as:

```yaml
amendments:
  - id: "amend-001"
    created_at: "2026-04-30T10:00:00Z"
    reason: "Pilot discovered undocumented auth dependency"
    new_vectors:
      - id: "vec-004"
        name: "Auth middleware setup"
        criteria:
          - "Auth middleware applied to /api/v1/profile endpoints"
          - "Unauthenticated requests return 401"
    revised_constraints:
      - "Profile endpoint requires authentication (previously unauthenticated)"
    affected_vectors: ["vec-001"]
    new_risks: []
    new_decisions:
      - question: "Should auth be a prerequisite vector?"
        answer: "Yes — new vec-004 added before vec-001 in flight plan"
        rationale: "Cannot implement profile data model without auth in place"
```

**Amendment rules:**
- **RULE-RPLAN-23:** The original `spec.vectors` array MUST NOT be mutated by an amendment. Amendments add new vectors or annotate existing ones — they never modify the original entries.
- **RULE-RPLAN-24:** Each amendment MUST record which original vectors it affects via the `affected_vectors` field, using stable vector IDs (§4.5).
- **RULE-RPLAN-25:** Amendment sessions persist as part of the same session file. The filed skill document is updated in place with the new `amendments[]` entry appended.

**v2 path:** A diff/merge interface that rebases amendments onto the original and produces a new canonical version, with the original preserved as `versions[0]`.

## 7. Integration Points

### 7.1 Craft Submission (Optional)

After the skill document is filed, the user may optionally submit the `spec` section for craft creation using the existing daemon API:

```
POST /api/v1/projects/{project}/crafts
```

The Route Planner translates skill document fields to the craft creation API shape (see §4.3). It does not submit automatically — the user must explicitly choose to submit.

- **RULE-RPLAN-20:** The Route Planner MUST support a dry-run preview before submission. The preview shows the translated API payload and resulting craft shape (callsign, flight plan, crew assignment). When the SDD `/crafts/from-spec` endpoint is implemented, this rule extends to use SDD dry-run mode (RULE-SDD-15).

### 7.2 Project Context

The Route Planner reads project configuration to:

- Populate craft category options (for SCP-4)
- List available pilots and certifications (for SCP-5)
- Identify existing UI patterns for mockup consistency (for VIS-4)
- Validate the `spec` section against craft creation requirements before filing

### 7.3 Web UI Integration

The Route Planner is accessible from the ATC web dashboard as an alternative to manual craft creation and raw spec import:

```
/projects/{project}/crafts/plan    — New route for Route Planner
```

The web UI uses a **hybrid phase-strip + conversational** layout:

- **Outer shell:** A persistent phase strip (horizontal bar on desktop, top strip on mobile) showing 7 phase chips. Each chip shows: phase name, completion state (empty/in-progress/complete), and phase number. Completed phases are clickable to re-enter (satisfying RULE-RPLAN-4). Phase 5 renders with a dashed border until DOM-6 triggers it, then becomes solid.
- **Inner loop:** Within each phase, questions arrive one at a time in a chat-style interface (satisfying RULE-RPLAN-1). Responses are displayed below questions in the conversation flow.
- **Mockup panel:** When Phase 5 is active, a split panel appears (see §3.2.4).
- **Review panel:** Phase 7 renders a structured summary in a review panel (see §2.2.7).

### 7.4 CLI Integration

The Route Planner is also accessible as a CLI skill, invoked by a pilot agent or human operator:

```
/route-planner [--project <name>] [--resume <session-id>]
```

In CLI mode, questions are presented one at a time in the terminal. ASCII mockups are used for visual alignment. The skill document is written to disk on filing.

## 8. Implementation as a Skill

### 8.1 Skill Registration

The Route Planner is implemented as an ATC skill — a structured prompt document that an AI agent executes conversationally. It is NOT implemented as daemon code, web components, or a standalone application.

The skill file lives at:

```
skills/route-planner/route-planner.md
```

### 8.2 Skill Content

The skill document contains:

1. **Interview script** — The phased question protocol from §2
2. **Adaptive logic** — Rules for question selection based on prior answers
3. **Mockup generation prompts** — Instructions for producing wireframe mockups
4. **Output template** — The skill document YAML structure from §4
5. **Validation rules** — Craft creation field requirements for the `spec` section

### 8.3 Skill Dependencies

The Route Planner skill depends on:

- Access to the project's ATC daemon API (for category list, pilot list, existing craft list)
- File system access (for session persistence and skill document output)
- Visual rendering capability (for mockup generation — context-dependent)

## 9. Rules Index

| Rule ID | Summary | Section |
|---|---|---|
| RULE-RPLAN-1 | One question at a time | 2.4 |
| RULE-RPLAN-2 | Multiple-choice when answer space is bounded | 2.4 |
| RULE-RPLAN-3 | Progress indicator with phase visibility and question position | 2.4 |
| RULE-RPLAN-4 | Allow revisiting previous answers | 2.4 |
| RULE-RPLAN-5 | Session persistence; filed sessions resume as amendments | 2.4 |
| RULE-RPLAN-6 | No code generation, no branch creation, no file mutation | 2.4 |
| RULE-RPLAN-7 | Mockup approval prompt required | 3.2.5 |
| RULE-RPLAN-8 | Mockup revision loop until approved | 3.2.5 |
| RULE-RPLAN-9 | Approved mockups included in skill document | 3.2.5 |
| RULE-RPLAN-10 | Spec section must pass validation with recovery path | 4.4 |
| RULE-RPLAN-11 | All design decisions recorded with rationale | 4.4 |
| RULE-RPLAN-12 | All risks recorded with mitigation | 4.4 |
| RULE-RPLAN-13 | Only approved mockups with alt_description in final document | 4.4 |
| RULE-RPLAN-14 | Skill document must be self-contained | 4.4 |
| RULE-RPLAN-15 | Multi-craft decomposition requires user approval | 5.2 |
| RULE-RPLAN-16 | Decomposed specs must be independently valid | 5.2 |
| RULE-RPLAN-17 | Shared vectors consolidated into prerequisite craft | 5.2 |
| RULE-RPLAN-18 | Session state persisted per exchange via atomic writes | 6.2 |
| RULE-RPLAN-19 | Resume summarizes state before continuing | 6.2 |
| RULE-RPLAN-20 | Dry-run preview before craft submission | 7.1 |
| RULE-RPLAN-21 | Contradiction detection and resolution | 2.4 |
| RULE-RPLAN-22 | Mandatory vs skippable phases | 2.4 |
| RULE-RPLAN-23 | Amendments must not mutate original vectors | 6.4 |
| RULE-RPLAN-24 | Amendments must reference affected vectors by ID | 6.4 |
| RULE-RPLAN-25 | Amendment sessions linked by session_id | 6.4 |

## 10. Learning Architecture

### 10.1 Design Principle

The Route Planner collects interview data that can accelerate future interviews. The learning system follows a deliberate two-phase approach: **v1 collects silently; v2 suggests patterns.**

### 10.2 v1: Corpus Collection

Every filed skill document is written to a structured corpus alongside the session store:

```
<profileDir>/state/projects/<project>/route-planner/corpus/<session-id>.json
```

Each corpus entry is a copy of the filed skill document, tagged with:
- `spec.category` — for pattern matching by craft type
- Vector count — for complexity bucketing
- `filedAt` timestamp
- `craftOutcome` — null until the linked craft reaches a terminal state (Landed, Diverted, Crashed); updated by the daemon when the craft's lifecycle completes

A corpus manifest maintains a queryable index:

```
<profileDir>/state/projects/<project>/route-planner/corpus/index.json
```

The manifest contains one entry per session: `sessionId`, `category`, `vectorCount`, `filedAt`, `craftOutcome`. This avoids full-directory scans when the learning system queries the corpus.

Users can opt individual sessions out of corpus inclusion by setting `metadata.corpus_eligible: false` during the interview. The default is `true`.

### 10.3 v2: Pattern Suggestions (Future)

After the corpus has ≥ 3 sessions in a given category, the Route Planner may optionally surface pattern suggestions **after Phase 3 completes** (not before — surfacing templates before decomposition would anchor the user's thinking and undermine the front-load-ambiguity design philosophy).

The suggestion flow:
1. After Phase 3 completes, query the corpus for sessions with matching `category`
2. If ≥ 3 matches exist, present: "I've seen N similar crafts in this category. Here are common vector patterns — use any, none, or all."
3. The user must explicitly opt in per session via: `LRN-1: "Would you like suggestions from past similar crafts?"`
4. Suggestions pre-populate but do not auto-accept. The user approves each suggested vector individually.

### 10.4 Outcome Correlation (Future)

The `session_id` field in skill document metadata (§4.2) enables future outcome correlation. When a craft reaches a terminal state, the corpus entry's `craftOutcome` is updated, enabling analysis of which interview patterns produce successful landings vs. emergencies or diversions.

## 11. Resolved Design Decisions

| # | Question | Decision | Decided By |
|---|---|---|---|
| 1 | Should filed specs support post-filing amendment? | Yes — amendment sessions (§6.4) append to `amendments[]` without mutating the original | AI Futurist |
| 2 | Should the Route Planner learn from past interviews? | v1 collects corpus silently; v2 suggests patterns after Phase 3 with opt-in | AI Futurist |
| 3 | Where should session state be persisted? | Daemon's `<profileDir>/state/` tree using `atomicWriteJson()` | Platform Engineer |
| 4 | How should the Route Planner authenticate to the daemon API? | No new auth model needed — daemon is currently unauthenticated | Platform Engineer |
| 5 | Should the skill document be a formal ATC spec entity? | No — it remains a skill-layer artifact, not a daemon entity | Platform Engineer |
| 6 | What interview UX pattern should the web UI use? | Hybrid phase-strip + conversational inner loop | UX Designer |
| 7 | How should mockups be presented in the web UI? | Split panel (desktop) / bottom sheet (mobile); annotation out of scope for v1 | UX Designer |
| 8 | How should the progress indicator be designed? | Phase chips with in-phase question count; Phase 5 ghosted until triggered | UX Designer |
