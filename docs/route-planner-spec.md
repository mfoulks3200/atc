# Route Planner Feature Specification

> **Status:** Draft — awaiting steering committee review
> **Author:** Steering Lead (AIR-349)
> **Version:** 0.1.0
> **Date:** 2026-04-28

## 1. Overview

The **Route Planner** is an AI-powered interactive interview feature that guides a user through a structured conversation to produce a complete, implementation-ready craft spec document. It replaces the current blank-page approach to spec authoring with a guided discovery process that front-loads all decisions pilots need to implement autonomously.

### 1.1 Design Philosophy

The Route Planner operates under two core principles:

1. **Front-load all ambiguity.** Every question a pilot would need to ask mid-flight should be asked and answered during the interview, before the craft launches. A well-planned route means pilots never need to stop and ask for clarification.

2. **Show, don't tell.** For any feature with a user-facing surface, the Route Planner generates visual mockups so the user can approve the direction before a single line of code is written. Alignment on visuals prevents mid-flight course corrections.

### 1.2 Scope Boundary

The Route Planner **ONLY produces a skill document** — a structured artifact containing the gathered requirements, acceptance criteria, UI mockups, and implementation guidance. It does **not** write code, create branches, or modify the codebase. Its output feeds into the existing SDD protocol (§4.6 of the ATC specification) to create a craft.

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

Phase 6: Risk & Constraint Surface
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
| SCP-1 | What are the explicit deliverables? | Enumerates concrete outputs |
| SCP-2 | What is explicitly NOT included in this work? | Prevents scope creep — captured in spec `notes` |
| SCP-3 | Are there related changes that should be separate crafts? | Identifies follow-up work without bloating this spec |
| SCP-4 | What is the craft category? (or describe the nature of the work) | Maps to `category` field — must match project-configured categories |
| SCP-5 | Should this work be decomposed into multiple crafts? | If yes, the Route Planner produces multiple specs |

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

| ID | Question | Purpose |
|---|---|---|
| ACC-1 | For [vector N]: what must be true when this milestone is complete? | Direct input to vector `criteria` |
| ACC-2 | For [vector N]: how would you verify this works? | Ensures criteria are testable |
| ACC-3 | For [vector N]: are there edge cases or error conditions to handle? | Captures non-happy-path criteria |
| ACC-4 | For [vector N]: are there performance or quality requirements? | Surfaces non-functional requirements |
| ACC-5 | Should the craft include specific test expectations (unit, integration, e2e)? | Enriches implementation guidance |

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

#### 2.2.6 Risk & Constraint Questions (Phase 6)

These surface implementation constraints and potential blockers.

| ID | Question | Purpose |
|---|---|---|
| RSK-1 | Are there backward compatibility requirements? | Constrains implementation approach |
| RSK-2 | Are there security considerations (auth, input validation, data exposure)? | Ensures security requirements are explicit |
| RSK-3 | Are there performance constraints (latency, throughput, memory)? | Surfaces non-functional requirements |
| RSK-4 | Are there existing tests that this change might break? | Identifies regression risk |
| RSK-5 | Is there specific documentation that must be updated? | Captures doc-update vectors |
| RSK-6 | Are there specific pilots or certifications needed for this work? | Maps to `pilots` field in spec |

### 2.3 Adaptive Question Selection

Not every question is asked in every interview. The Route Planner uses an adaptive selection model:

1. **Phase 1 (Intent)** — Always fully asked. These are the minimum viable questions.
2. **Phase 2 (Scope)** — Always asked. SCP-4 determines the craft category.
3. **Phase 3 (Domain)** — DOM-6 conditionally gates Phase 5. DOM-4 and DOM-5 are skipped if the user indicates the work is purely documentation or configuration.
4. **Phase 4 (Acceptance)** — Asked per vector generated from Phase 3 answers.
5. **Phase 5 (Visual)** — Only asked if DOM-6 confirms UI changes. Loops on VIS-5/VIS-6 until approval.
6. **Phase 6 (Risk)** — RSK-6 is only asked if the user wants to specify pilots explicitly.

### 2.4 Interview Behavior Rules

- **RULE-RPLAN-1:** The Route Planner MUST ask exactly one question at a time. It MUST NOT bundle multiple questions into a single prompt.
- **RULE-RPLAN-2:** The Route Planner MUST offer multiple-choice options when the answer space is bounded (e.g., priority, category, yes/no). Open-ended questions are used only when the answer space is unbounded.
- **RULE-RPLAN-3:** The Route Planner MUST surface a progress indicator showing the current phase, completed phases, and remaining phases. The user must always know where they are in the process.
- **RULE-RPLAN-4:** The Route Planner MUST allow the user to revisit and amend answers from any previous phase at any point during the interview. Changing an earlier answer may invalidate later answers — the Route Planner MUST flag affected downstream answers and re-ask only the invalidated questions.
- **RULE-RPLAN-5:** The Route Planner MUST support session persistence. If the user exits mid-interview, the session state MUST be recoverable on the next invocation.
- **RULE-RPLAN-6:** The Route Planner MUST NOT generate any code, create any branches, modify any files outside its own session state, or interact with the SDD submission endpoint. Its sole output is a skill document.

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

#### 3.2.3 Mockup Iteration

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
  session_id: "rplan-abc123"
  interview_duration_minutes: 15

# === Spec Fields (map directly to SDD SpecDocument) ===
spec:
  title: "Add user profile settings page"
  cargo: |
    Users need the ability to view and edit their profile information
    (display name, email, notification preferences) from a dedicated
    settings page accessible from the main navigation sidebar.
  category: "frontend"
  priority: "medium"
  vectors:
    - name: "Profile data model"
      criteria:
        - "UserProfile interface defined with fields: displayName, email, notificationPrefs"
        - "GET /api/v1/profile returns current user profile"
        - "PATCH /api/v1/profile updates profile fields with validation"
    - name: "Settings page UI"
      criteria:
        - "New route /settings/profile renders a form with profile fields"
        - "Form pre-fills with current profile data on load"
        - "Save button submits PATCH and shows success toast"
        - "Validation errors display inline next to affected fields"
    - name: "Navigation integration"
      criteria:
        - "Sidebar includes 'Settings' link under user section"
        - "Active state highlights correctly when on /settings/*"
  pilots:
    requireCertifications: ["frontend", "backend"]
  notes: |
    Out of scope: avatar upload, password change, account deletion.
    These are planned as separate crafts.
  autoLaunch: false

# === Extended Context (beyond SDD spec) ===
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
```

### 4.3 Spec Field Mapping

The `spec` section of the skill document maps directly to the SDD SpecDocument (§2.7):

| Skill Document Field | SDD SpecDocument Field | Notes |
|---|---|---|
| `spec.title` | `title` | Direct mapping |
| `spec.cargo` | `cargo` | Direct mapping — enriched with interview context |
| `spec.category` | `category` | Validated against project categories during interview |
| `spec.vectors[].name` | `vectors[].name` | Direct mapping |
| `spec.vectors[].criteria` | `vectors[].criteria` | Enriched with edge cases from Phase 4 |
| `spec.priority` | `priority` | Direct mapping |
| `spec.pilots` | `pilots` | Direct mapping |
| `spec.notes` | `notes` | Includes out-of-scope items, constraints |
| `spec.autoLaunch` | `autoLaunch` | Default false |

The `context`, `decisions`, `risks`, and `mockups` sections are extensions that provide implementation guidance beyond what the bare SDD spec captures. These sections travel with the skill document and are available to pilots in their operating context.

### 4.4 Skill Document Rules

- **RULE-RPLAN-10:** The skill document MUST include a valid `spec` section that passes SDD validation (RULE-SDD-1 through RULE-SDD-7) without modification.
- **RULE-RPLAN-11:** The `context.decisions` section MUST include every significant design decision made during the interview, with the question asked, the answer chosen, and the rationale. Pilots MUST NOT need to re-derive these decisions.
- **RULE-RPLAN-12:** The `context.risks` section MUST include every risk surfaced during Phase 6, with a mitigation strategy or explicit acknowledgment.
- **RULE-RPLAN-13:** The `mockups` section MUST include all approved mockups from Phase 5. Each mockup MUST be marked with `approved: true`. Unapproved mockups MUST NOT appear in the final document.
- **RULE-RPLAN-14:** The skill document MUST be self-contained. A pilot reading only this document — with no access to the interview transcript — must have all information needed to implement the work.

## 5. Craft Decomposition

### 5.1 Multi-Craft Detection

Some interviews reveal work that should be decomposed into multiple crafts. The Route Planner detects this when:

- The user identifies clearly independent functional areas in Phase 3
- Vector count exceeds a configurable threshold (default: 8)
- The work spans multiple craft categories
- The user explicitly requests decomposition in Phase 2 (SCP-5)

### 5.2 Decomposition Behavior

- **RULE-RPLAN-15:** When decomposition is warranted, the Route Planner MUST present the proposed craft boundaries to the user for approval before generating multiple skill documents.
- **RULE-RPLAN-16:** Each decomposed skill document MUST be independently valid — no circular dependencies between the generated specs. Implementation order MUST be stated in each document's `context.related_work` section.
- **RULE-RPLAN-17:** The Route Planner MUST identify shared vectors (e.g., "update shared types") that appear in multiple decomposed crafts and consolidate them into a single prerequisite craft.

## 6. Session Management

### 6.1 Session Lifecycle

```
Created → In Progress → Review → Filed → (optional) Submitted
```

| State | Description |
|---|---|
| Created | Session initialized, no questions asked yet |
| In Progress | Interview underway, questions being asked and answered |
| Review | All phases complete, user reviewing final skill document |
| Filed | Skill document finalized and saved. Interview complete. |
| Submitted | Skill document submitted to SDD (optional, user-initiated) |

### 6.2 Session Persistence

- **RULE-RPLAN-18:** Session state MUST be persisted after each question-answer exchange. The persistence format MUST include: all answered questions with responses, current phase and question index, generated vectors, approved mockups, and any decisions logged.
- **RULE-RPLAN-19:** When a user resumes a session, the Route Planner MUST summarize the current state (phase, vectors so far, outstanding questions) before continuing.

### 6.3 Session Storage

Sessions are stored as JSON files in the project's ATC data directory:

```
.atc/route-planner/sessions/{session-id}.json
```

## 7. Integration Points

### 7.1 SDD Submission (Optional)

After the skill document is filed, the user may optionally submit the `spec` section to the SDD endpoint:

```
POST /api/v1/projects/{project}/crafts/from-spec
```

The Route Planner offers this as a convenience but does not perform it automatically. The user must explicitly choose to submit.

- **RULE-RPLAN-20:** The Route Planner MUST support a dry-run preview before submission, using the existing SDD dry-run mode (RULE-SDD-15). The preview shows the computed callsign, assigned pilots, and flight plan.

### 7.2 Project Context

The Route Planner reads project configuration to:

- Populate craft category options (for SCP-4)
- List available pilots and certifications (for RSK-6)
- Identify existing UI patterns for mockup consistency (for VIS-4)
- Validate the `spec` section against SDD rules before filing

### 7.3 Web UI Integration

The Route Planner is accessible from the ATC web dashboard as an alternative to manual craft creation and raw spec import:

```
/projects/{project}/crafts/plan    — New route for Route Planner
```

The web UI renders the interview as a conversational interface within the existing dashboard shell. Mockups render inline. The final skill document is presented in a review panel before filing.

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
5. **Validation rules** — SDD field requirements for the `spec` section

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
| RULE-RPLAN-3 | Progress indicator required | 2.4 |
| RULE-RPLAN-4 | Allow revisiting previous answers | 2.4 |
| RULE-RPLAN-5 | Session persistence required | 2.4 |
| RULE-RPLAN-6 | No code generation, no branch creation, no file mutation | 2.4 |
| RULE-RPLAN-7 | Mockup approval prompt required | 3.2.3 |
| RULE-RPLAN-8 | Mockup revision loop until approved | 3.2.3 |
| RULE-RPLAN-9 | Approved mockups included in skill document | 3.2.3 |
| RULE-RPLAN-10 | Spec section must pass SDD validation | 4.4 |
| RULE-RPLAN-11 | All design decisions recorded with rationale | 4.4 |
| RULE-RPLAN-12 | All risks recorded with mitigation | 4.4 |
| RULE-RPLAN-13 | Only approved mockups in final document | 4.4 |
| RULE-RPLAN-14 | Skill document must be self-contained | 4.4 |
| RULE-RPLAN-15 | Multi-craft decomposition requires user approval | 5.2 |
| RULE-RPLAN-16 | Decomposed specs must be independently valid | 5.2 |
| RULE-RPLAN-17 | Shared vectors consolidated into prerequisite craft | 5.2 |
| RULE-RPLAN-18 | Session state persisted after each exchange | 6.2 |
| RULE-RPLAN-19 | Resume summarizes state before continuing | 6.2 |
| RULE-RPLAN-20 | Dry-run preview before SDD submission | 7.1 |

## 10. Open Questions for Team Review

The following questions require input from the steering committee before this spec is finalized:

1. **AI Futurist:** Should the Route Planner support iterative refinement after filing — e.g., re-opening a filed session to add vectors based on pilot feedback mid-flight? How should this interact with the immutability expectations of filed specs?

2. **AI Futurist:** What is the long-term vision for learning from past interviews? Should the Route Planner build a knowledge base of common patterns (e.g., "frontend feature" → typical vector set) to accelerate future interviews?

3. **Platform Engineer:** Where should session state be persisted — in the daemon's existing JSON store infrastructure, in the file system, or in a new persistence layer? What are the implications for multi-user concurrent sessions?

4. **Platform Engineer:** How should the Route Planner authenticate and access the daemon API when running as a CLI skill vs. when embedded in the web UI? Should it use the existing API key model or a new session-based model?

5. **Platform Engineer:** Does the skill document output format need to be formally added to the ATC specification as a new entity type, or should it remain an extension of the existing SpecDocument?

6. **UX Designer:** What is the optimal interview UX for the web dashboard — a chat-style interface, a wizard/stepper, or a structured form that reveals progressively? Each has trade-offs for user cognitive load.

7. **UX Designer:** How should mockup presentation work in the web UI — inline in the chat, in a side panel, or as a full-screen overlay? Should users be able to annotate mockups?

8. **UX Designer:** How should the progress indicator (RULE-RPLAN-3) be designed — a progress bar, phase dots, a collapsible outline of all phases, or something else?
