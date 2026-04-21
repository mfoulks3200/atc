# Spec-Driven Development — Design

**Date:** 2026-04-21
**Revised:** 2026-04-21 (incorporating team review from AIR-15 through AIR-19)
**Status:** Draft — Revised after Team Review
**Issue:** AIR-14
**Author:** Steering Lead

## 1. Overview

**Spec-Driven Development (SDD)** is a protocol that allows crafts to be created automatically from a structured specification document rather than manually through the UI or direct API calls. A developer, manager, or orchestrating system submits a spec document; ATC parses it, generates a flight plan, selects pilots, and produces a fully-initialized craft in the Taxiing state — ready to launch.

This formalizes and extends the "Origin Airport" concept. The Origin Airport is the design/spec stage. SDD gives it a machine-readable input format so that external systems (project trackers, CI pipelines, other AI agents) can drive craft creation without human hand-configuration.

### 1.1 Motivation

Today, creating a craft requires:
1. Manually crafting a POST body with cargo, category, callsign, pilot assignments, and flight plan vectors.
2. Separately assigning pilots with knowledge of who is certified for the category.
3. Ensuring the flight plan covers all required acceptance criteria.

This is error-prone and doesn't scale when many agents need to be directed concurrently. SDD replaces this with a single declarative document that expresses the full intent of a change.

### 1.2 Goals

1. **Automated craft initialization** — one document, one API call, one craft ready to fly.
2. **Structured acceptance criteria** — vectors derived directly from the spec prevent drift between intent and execution.
3. **Intelligent pilot selection** — auto-assignment based on certification and workload frees coordinators from manual scheduling.
4. **External system integration** — REST, file-watch, and CLI entry points allow integration with project trackers (e.g., Paperclip, Linear) and CI pipelines.
5. **Safe auto-launch** — optionally launch the craft immediately after creation, with layered safety controls.

### 1.3 Non-Goals

- **Natural language spec parsing.** SDD requires structured input. An LLM pre-processing layer may transform freeform text into a valid spec document, but that transformation is outside the scope of this protocol. See Section 8 (Future Work) for discussion.
- **Multi-craft spec expansion.** A single spec maps to exactly one craft. Splitting a large spec into sub-crafts is a future extension.
- **Pilot workload capacity enforcement.** SDD selects the least-loaded eligible pilot but does not enforce hard limits. Scheduling constraints are left to the operator.
- **LLM-based criteria verification.** Vector criteria are verified by pilot self-assessment at v1. An LLM judge is deferred; see Section 8.

---

## 2. Spec Document Format

A spec document is a YAML document with an optional Markdown `notes` section. JSON is also accepted; the daemon detects format from content type or file extension (`.spec.yaml`, `.spec.json`).

### 2.1 Schema

```yaml
# Required fields
title: string           # Short name for the work; used in callsign generation and search.
cargo: string           # Full description of the change and its scope.
category: string        # Craft category — must match a project-configured category.
vectors:                # Ordered list of flight-plan milestones.
  - name: string        # Short, descriptive milestone name.
    criteria:           # One or more acceptance criteria; each must be verifiable.
      - string          # Natural language string. See note on writing good criteria.

# Optional fields
priority: low | medium | high | critical   # Default: medium.
autoLaunch: boolean                        # Default: false. Requires project opt-in (RULE-SDD-12).
callsign: string                           # Explicit callsign override; must be unique.
pilots:
  captain: string                          # Explicit pilot ID. If absent, auto-selected (see Section 4).
  firstOfficers:                           # Zero or more explicit first officer pilot IDs.
    - string
  jumpseaters:                             # Zero or more explicit jumpseat pilot IDs.
    - string
  requireCertifications:                   # Additional certifications the auto-selected captain must hold.
    - string
  exclude:                                 # Pilot IDs to exclude from auto-selection.
    - string
notes: string                              # Markdown; stored verbatim in the craft's black box on creation.
metadata:                                  # Arbitrary key-value pairs; stored in the black box.
  key: value
```

### 2.2 Writing Effective Acceptance Criteria

Criteria are natural language strings verified by the pilot through self-assessment. For self-assessment to work reliably, criteria must be:

- **Specific** — names the endpoint, file, state, or behavior ("POST `/auth/token` returns HTTP 200 for a valid authorization code").
- **Binary** — pass or fail without subjective thresholds ("stores token with a 15-minute TTL" rather than "tokens expire quickly").
- **Testable** — the pilot can write a test or run a manual check against it.

Criteria express *what success looks like*; the landing checklist (Tests, Lint, Build, Documentation) enforces *that structural gates were met*. Do not use criteria as a substitute for the checklist.

### 2.3 Example

```yaml
title: "Add OAuth2 login to user API"
cargo: >
  Replace the current basic-auth login endpoint with an OAuth2 PKCE flow.
  Users should be able to log in via GitHub and Google. Token refresh and
  revocation must be supported.
category: "Backend Engineering"
priority: high
autoLaunch: true

vectors:
  - name: "OAuth2 provider configuration"
    criteria:
      - "GitHub and Google OAuth2 app credentials are stored in project config (not hardcoded)."
      - "The daemon reads provider credentials at startup and exits with a clear error if absent."
  - name: "Token exchange endpoint"
    criteria:
      - "POST /auth/token accepts an authorization code and returns access + refresh tokens."
      - "Access tokens are signed JWTs with a 15-minute TTL; refresh tokens have a 7-day TTL."
      - "Unit tests cover the happy path, invalid code, and expired code cases."
  - name: "Token refresh and revocation"
    criteria:
      - "POST /auth/refresh accepts a valid refresh token and returns new access + refresh tokens."
      - "POST /auth/revoke invalidates the given refresh token."
      - "Integration tests cover the full token lifecycle (obtain → refresh → revoke → refresh fails)."
  - name: "Passing landing checklist"
    criteria:
      - "All tests pass."
      - "Lint and build are clean."
      - "OpenAPI spec updated to reflect the three new endpoints."

pilots:
  requireCertifications:
    - "Backend Engineering"

notes: |
  ## Background

  The basic-auth approach does not support SSO and is a blocker for enterprise customers.
  See the product brief in Notion for the full requirements.
```

### 2.4 Validation Rules

- **RULE-SDD-1:** A spec document MUST include `title`, `cargo`, `category`, and at least one entry in `vectors`. Submissions missing any required field MUST be rejected with `SPEC_VALIDATION_ERROR`.
- **RULE-SDD-2:** Each vector entry MUST include a `name` and at least one non-empty string in `criteria`. A vector with no criteria MUST be rejected.
- **RULE-SDD-3:** The `category` field MUST match one of the project-configured craft categories. An unknown category MUST be rejected with `UNKNOWN_CATEGORY`.
- **RULE-SDD-4:** The `vectors` array MUST contain at least one entry. An empty flight plan MUST be rejected.
- **RULE-SDD-5:** If an explicit `callsign` is provided, it MUST be unique across all crafts in the project. A collision MUST be rejected with `CALLSIGN_CONFLICT`.
- **RULE-SDD-6:** If explicit `pilots.captain` is provided, that pilot MUST hold a certification for the spec's `category`. A mismatch MUST be rejected with `PILOT_NOT_CERTIFIED`.
- **RULE-SDD-7:** If explicit `pilots.firstOfficers` are provided, each listed pilot MUST hold a certification for the spec's `category`. A mismatch MUST be rejected with `PILOT_NOT_CERTIFIED`.

---

## 3. Craft Creation Procedure

When a spec is submitted, the daemon executes the following procedure:

1. **Parse and validate** the spec document (YAML/JSON). On error, return `SPEC_PARSE_ERROR`.
2. **Validate fields** against RULE-SDD-1 through RULE-SDD-7.
3. **Dry-run check** — if `?dryRun=true` is present (RULE-SDD-17), validate fully and return the would-be craft object; stop here without creating any records or branches.
4. **Generate callsign** — if not provided, derive from `title` using slug normalization + a monotonic per-project counter persisted in the project's config store (e.g., `add-oauth2-login-01`). See Section 6.
5. **Generate flight plan** — convert `vectors` entries to `Vector` objects in declaration order, each with status `pending`.
6. **Select pilots** — apply the pilot selection strategy (Section 4) to fill unspecified seats.
7. **Create git branch** — create a worktree branch named `<callsign>` off the project's main branch. **This step runs first** (see Section 3.1).
8. **Write craft record** — create the craft in the Taxiing state in the craft store.
9. **Record black box entry** — append a `Decision` entry recording: requester identity, submission source, spec title, notes, metadata, and whether autoLaunch was requested (RULE-SDD-16). The raw spec document is attached as a JSON blob.
10. **Evaluate autoLaunch** — if `autoLaunch: true` is in the spec and all safety guards pass (RULE-SDD-12 through RULE-SDD-15), immediately transition the craft to InFlight and start the captain's agent process. Otherwise record suppression in the black box.
11. **Return** the created craft object (callsign, branch, status, crew, flight plan).

### 3.1 Rollback Strategy (Compensating Transactions)

There is no two-phase commit between the git worktree and the craft store. Instead, the operations are ordered so that the cheaper-to-compensate step happens first:

1. **Create git worktree branch first.** If this fails, no craft record exists — no rollback needed.
2. **Write craft store record second.** If this fails after the branch was created, execute the compensating action: delete the worktree branch. Then return the error.

A startup reconciliation scan runs each time the daemon starts: any worktree branches present on disk with no corresponding craft store entry are flagged and pruned. This handles the narrow crash window between the two writes.

A `pending` intermediate state was considered and rejected: it adds consumer complexity (every API consumer must handle a new status value) and still requires startup reconciliation — it solves the same crash window at a higher cost.

---

## 4. Pilot Selection Strategy

When no explicit captain is specified, the daemon runs the following algorithm:

1. **Filter by certification:** Collect all project pilots certified for `spec.category`.
2. **Apply exclusions:** Remove any pilot IDs listed in `spec.pilots.exclude`.
3. **Apply additional certification requirements:** If `spec.pilots.requireCertifications` is non-empty, further filter to pilots holding all required certifications.
4. **Compute workload score** for each remaining candidate:
   ```
   workload_score = (active captaincies × 1.0) + (active FO assignments × 0.5)
   ```
   where "active" means the craft's status is one of `Taxiing`, `InFlight`, or `LandingClearanceRequested`.
5. **Sort ascending by workload score** — lower score = less loaded = preferred.
6. **Break ties using `selectionCount`** — among equally-scored pilots, prefer the pilot with the lowest `selectionCount` (a monotonic counter persisted in the pilot store and incremented each time the pilot is auto-selected as captain or first officer).
7. **Select the top-scoring pilot** as captain and increment their `selectionCount`.
8. **Reject if empty:** If no candidates remain after filtering, return `NO_CERTIFIED_PILOT`.

First officers: if `pilots.firstOfficers` is empty and the project config defines a minimum crew for the category, the daemon selects the next N certified pilots by the same algorithm (excluding the chosen captain, incrementing `selectionCount` for each selected FO). If no minimum crew is configured, first officers default to none.

The FO weight (currently `0.5`) is configurable via a `pilotSelectionFoWeight` key in project config, defaulting to `0.5`. This allows projects to tune weighting based on how demanding FO work is in practice.

### 4.1 Rules

- **RULE-SDD-8:** Auto-selected captains MUST be certified for the craft's category (RULE-PILOT-2 applies).
- **RULE-SDD-9:** If no certified pilot is available, the spec submission MUST fail with `NO_CERTIFIED_PILOT` and include a message listing the required category, any additional `requireCertifications`, and the certifications held by each available pilot — so the operator knows precisely which filter eliminated each candidate.
- **RULE-SDD-10:** Auto-selection MUST NOT assign the same pilot as both captain and first officer. This MUST be enforced as an explicit pre-condition check before returning the selection, not only as a loop exclusion.

---

## 5. AutoLaunch Safety

`autoLaunch: true` in a spec requests that the craft transition to InFlight immediately after creation. This feature must be approached with layered defences because an accidental or malicious autoLaunch spawns an agent process that can make commits before any human reviews it.

### 5.1 Safety Rules

- **RULE-SDD-11:** `autoLaunch` MUST be suppressed (craft stays in Taxiing) unless the project configuration explicitly sets `allowAutoLaunch: true`. When suppressed, the suppression reason MUST be recorded in the black box.
- **RULE-SDD-12:** An active TFR covering the target project (global or project-scoped) MUST suppress `autoLaunch` regardless of project opt-in. The craft is created in Taxiing with `holdingPattern: true`. This integrates naturally with the existing TFR system (RULE-TFR-6).
- **RULE-SDD-13:** The API key used to submit the spec MUST carry a `spec:autolaunch` permission scope to enable `autoLaunch` behaviour. A key with only `spec:submit` has `autoLaunch` suppressed even if the spec requests it and the project allows it. This allows operators to issue narrow keys to CI pipelines without granting agent spawn authority.
- **RULE-SDD-14:** When a spec is submitted by an agent (identified by `agentId` in the request context), `autoLaunch` MUST be suppressed. Agents may create crafts via SDD but the craft requires human or tower confirmation to transition to InFlight. This prevents runaway spawn chains.
- **RULE-SDD-15:** The spec submission REST endpoint MUST support `?dryRun=true`. In dry-run mode the daemon validates the spec fully and returns the would-be craft object but creates no records, branches, or agents.
- **RULE-SDD-16:** The black box `Decision` entry written at craft creation MUST record: requester identity (`userId`, `apiKeyId`, or `agentId`), submission source (`rest`, `file-watch`, `cli`, `external-agent`), whether `autoLaunch` was requested in the spec, and whether it was executed or suppressed (with the suppression reason).

---

## 6. Integration Points

### 6.1 REST API

```
POST /api/v1/projects/:name/crafts/from-spec
Content-Type: application/json | application/yaml
Authorization: Bearer <api-key>

Query params:
  ?dryRun=true   — validate and return would-be craft; no side effects (RULE-SDD-15)

Request body: spec document (JSON or YAML)

Response 201: created craft object
Response 200: (dry-run only) would-be craft object, not created
Response 400: SPEC_PARSE_ERROR | SPEC_VALIDATION_ERROR | UNKNOWN_CATEGORY | CALLSIGN_CONFLICT
Response 422: NO_CERTIFIED_PILOT | PILOT_NOT_CERTIFIED
Response 500: branch creation failure (no craft record written)
```

> **Note on YAML parsing:** The Fastify app must register a YAML content-type parser (e.g., via `@fastify/multipart` or a body-parser hook) before this route is reachable from YAML clients. JSON is the safe default for CI integrations.

A duplicate `callsign` submission is rejected with `CALLSIGN_CONFLICT` — the endpoint is not idempotent. External callers that need idempotency should check for an existing craft by callsign before submitting.

### 6.2 Spec Inbox (File Watch)

When a project is configured with a `specInbox` directory path, the daemon watches it via a `WatcherManager` class (following the `FlushScheduler` pattern) so watcher errors are isolated and cannot crash the main Fastify process.

- `.spec.yaml` or `.spec.json` files dropped into the directory are submitted as if via the REST endpoint, with submission source `file-watch`.
- On success: source file moved to `specInbox/.processed/<timestamp>-<filename>`.
- On error: source file moved to `specInbox/.failed/<timestamp>-<filename>` and a `<filename>.error` sidecar written with error details.
- **RULE-SDD-17:** The file watcher MUST NOT process the same file twice (deduplicate by inode + modification timestamp, or by content hash).

### 6.3 CLI

```bash
atc spec submit --project <name> --file <path>
atc spec submit --project <name> --stdin   # reads from stdin
atc spec submit --project <name> --file <path> --dry-run
```

Returns the created craft's callsign and a link to the craft detail view on success. Dry-run prints the would-be craft without creating it.

### 6.4 External Agent Integration

The REST API accepts a standard `Authorization: Bearer <token>` header using an ATC API key scoped to a project. External agents (e.g., a Paperclip Steering Lead, a CI step on issue creation) can submit specs programmatically.

Agent callers MUST NOT set `autoLaunch: true` — it is suppressed by RULE-SDD-14. If autoLaunch is required for a use case, a human-operated key with `spec:autolaunch` scope must be used.

Recommended pattern for a project tracker integration:
1. An issue is created/assigned in the tracker.
2. A webhook fires and the tracker's integration agent converts the issue fields to an ATC spec document.
3. The agent POSTs to `/api/v1/projects/:name/crafts/from-spec`.
4. The ATC craft callsign is written back to the tracker issue for cross-referencing.

---

## 7. Callsign Generation

When no explicit callsign is provided:

1. Slugify `title`: lowercase, replace spaces and special chars with hyphens, collapse consecutive hyphens, trim.
2. Truncate slug to 40 characters at a word boundary.
3. Append a zero-padded monotonic counter persisted in the project config store: `<slug>-<NN>` where NN starts at `01` per project and increments per spec-created craft.
4. If the resulting callsign collides with an existing craft (e.g., due to duplicate titles), increment NN until unique.

The counter MUST be persisted to the project config store before the branch is created, so daemon restarts do not produce duplicate callsigns.

Example: `"Add OAuth2 login to user API"` → `add-oauth2-login-to-user-api-01`.

---

## 8. UI — Spec Submission (Web)

Spec submission is integrated into the existing `/projects/:name/crafts/new` page as an alternative input mode. No new route is needed.

**Implementation:**
- Add a tab toggle: `Manual` | `Spec File` on the craft creation page.
- In `Spec File` mode: drag-and-drop zone + `<input type="file" accept=".yaml,.yml,.json">`.
- On file select/drop: parse YAML/JSON with `js-yaml` (~20 KB, no editor bundle needed) → validate fields → populate existing form state.
- Field-level validation errors map to inline messages on the corresponding form fields.
- `autoLaunch` is surfaced as a checkbox in the "Basic Info" section with an amber warning notice. Default: unchecked, even if the uploaded spec has `autoLaunch: true`. When a spec with `autoLaunch: true` is imported, the checkbox is pre-checked and an inline banner appears.
- On submit, the same `POST /api/v1/projects/:name/crafts/from-spec` endpoint is called (not the manual craft creation endpoint).

A read-only YAML preview toggle (`View as YAML`) is a Phase 2 addition once the import path is stable.

---

## 9. Error Reference

| Code | HTTP | Meaning |
|------|------|---------|
| `SPEC_PARSE_ERROR` | 400 | Spec document is malformed YAML/JSON |
| `SPEC_VALIDATION_ERROR` | 400 | Required field missing or invalid |
| `UNKNOWN_CATEGORY` | 400 | `category` does not match project config |
| `CALLSIGN_CONFLICT` | 400 | Explicit callsign already in use |
| `NO_CERTIFIED_PILOT` | 422 | No pilots certified for the category after filtering |
| `PILOT_NOT_CERTIFIED` | 422 | Explicitly named pilot lacks required certification |
| `BRANCH_CREATION_FAILED` | 500 | Git branch could not be created (no craft record written) |

---

## 10. Future Work

- **LLM-assisted spec generation.** A natural language description is passed to an LLM that returns a valid spec document. Pre-processing layer; lives outside the daemon.
- **Optional machine-executable criteria.** An optional `command` field per criterion (`{description: "...", command: "pnpm test -- --testPathPattern=auth"}`). When present, exit code is authoritative. When absent, pilot self-assessment applies. Backwards-compatible.
- **Multi-craft spec expansion.** A spec that describes a large feature is split into sub-crafts with explicit dependencies.
- **Vector dependency graph.** Allow vectors to declare dependencies on other vectors, enabling parallel vector progress within a flight plan.
- **Spec templates.** Project-configured templates for common change types that pre-populate vectors and category.
- **Spec revision and re-planning.** When an emergency causes return-to-origin, the original spec is surfaced to the re-planner who can amend and resubmit.
- **`maxAutoLaunchConcurrency`.** Per-project cap on concurrent auto-launched crafts to bound burst token cost.
- **AutoLaunch review queue.** When autoLaunch is suppressed, queue the craft for human review rather than silently staying in Taxiing.

---

## Appendix: Rule Index

| Rule | Section | Summary |
|------|---------|---------|
| RULE-SDD-1 | 2.4 | Spec must include title, cargo, category, and at least one vector |
| RULE-SDD-2 | 2.4 | Each vector must have a name and at least one non-empty criterion |
| RULE-SDD-3 | 2.4 | Category must match a project-configured category |
| RULE-SDD-4 | 2.4 | Vectors array must be non-empty |
| RULE-SDD-5 | 2.4 | Explicit callsign must be unique |
| RULE-SDD-6 | 2.4 | Explicit captain must be certified for the category |
| RULE-SDD-7 | 2.4 | Explicit first officers must be certified for the category |
| RULE-SDD-8 | 4.1 | Auto-selected captains must be certified |
| RULE-SDD-9 | 4.1 | No certified pilot available → fail with NO_CERTIFIED_PILOT |
| RULE-SDD-10 | 4.1 | Same pilot cannot be both captain and first officer |
| RULE-SDD-11 | 5.1 | autoLaunch suppressed unless project sets allowAutoLaunch: true |
| RULE-SDD-12 | 5.1 | Active TFR suppresses autoLaunch; craft created with holdingPattern: true |
| RULE-SDD-13 | 5.1 | API key must carry spec:autolaunch scope to enable autoLaunch |
| RULE-SDD-14 | 5.1 | Agent-submitted specs cannot autoLaunch |
| RULE-SDD-15 | 5.1 | Endpoint supports ?dryRun=true; no side effects in dry-run |
| RULE-SDD-16 | 5.1 | Black box entry records requester identity, source, and autoLaunch outcome |
| RULE-SDD-17 | 6.2 | File watcher must not process the same file twice |
