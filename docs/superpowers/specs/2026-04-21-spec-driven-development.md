# Spec-Driven Development — Design

**Date:** 2026-04-21
**Status:** Draft — Pending Team Review
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
5. **Auto-launch support** — optionally launch the craft immediately after creation.

### 1.3 Non-Goals

- **Natural language spec parsing.** SDD requires structured input. An LLM pre-processing layer may transform freeform text into a valid spec document, but that transformation is outside the scope of this protocol. See Section 8 (Future Work) for discussion.
- **Multi-craft spec expansion.** A single spec maps to exactly one craft. Splitting a large spec into sub-crafts is a future extension.
- **Pilot workload capacity enforcement.** SDD selects the least-loaded eligible pilot but does not enforce hard limits. Scheduling constraints are left to the operator.

---

## 2. Spec Document Format

A spec document is a YAML document with an optional Markdown `notes` section. JSON is also accepted; the daemon detects format from content type or file extension.

### 2.1 Schema

```yaml
# Required fields
title: string           # Short name for the work; used in callsign generation and search.
cargo: string           # Full description of the change and its scope.
category: string        # Craft category — must match a project-configured category.
vectors:                # Ordered list of flight-plan milestones.
  - name: string        # Short, descriptive milestone name.
    criteria:           # One or more acceptance criteria; each must be verifiable.
      - string

# Optional fields
priority: low | medium | high | critical   # Default: medium.
autoLaunch: boolean                        # Default: false. If true, craft launches immediately after creation.
callsign: string                           # Explicit callsign override; must be unique. If absent, auto-generated.
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

### 2.2 Example

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
      - "GitHub and Google OAuth2 app credentials are stored securely in project config."
      - "The daemon reads provider credentials at startup and fails loudly if absent."
  - name: "Token exchange endpoint"
    criteria:
      - "POST /auth/token accepts an authorization code and returns access + refresh tokens."
      - "Tokens are signed JWTs with a 15-minute access TTL and 7-day refresh TTL."
      - "Unit tests cover the happy path, invalid code, and expired code cases."
  - name: "Token refresh and revocation"
    criteria:
      - "POST /auth/refresh accepts a valid refresh token and returns new access + refresh tokens."
      - "POST /auth/revoke invalidates the given refresh token."
      - "Integration tests cover full token lifecycle."
  - name: "Passing landing checklist"
    criteria:
      - "All tests pass."
      - "Lint and build are clean."
      - "OpenAPI spec updated to reflect new endpoints."

pilots:
  requireCertifications:
    - "Backend Engineering"

notes: |
  ## Background

  The basic-auth approach does not support SSO and is a blocker for enterprise customers.
  See the product brief in Notion for the full requirements.
```

### 2.3 Validation Rules

- **RULE-SDD-1:** A spec document MUST include `title`, `cargo`, `category`, and at least one entry in `vectors`. Submissions missing any required field MUST be rejected with `SPEC_VALIDATION_ERROR`.
- **RULE-SDD-2:** Each vector entry MUST include a `name` and at least one non-empty string in `criteria`. A vector with no criteria MUST be rejected.
- **RULE-SDD-3:** The `category` field MUST match one of the project-configured craft categories. An unknown category MUST be rejected with `UNKNOWN_CATEGORY`.
- **RULE-SDD-4:** The `vectors` array MUST contain at least one entry. An empty flight plan MUST be rejected.
- **RULE-SDD-5:** If an explicit `callsign` is provided, it MUST be unique across all crafts in the project. A collision MUST be rejected with `CALLSIGN_CONFLICT`.
- **RULE-SDD-6:** If explicit `pilots.captain` is provided, that pilot MUST hold a certification for the spec's `category`. A mismatch MUST be rejected with `PILOT_NOT_CERTIFIED`.
- **RULE-SDD-7:** If explicit `pilots.firstOfficers` are provided, each listed pilot MUST hold a certification for the spec's `category`. A mismatch MUST be rejected with `PILOT_NOT_CERTIFIED`.

---

## 3. Craft Creation Procedure

When a spec is submitted, the daemon executes the following procedure atomically:

1. **Parse and validate** the spec document (YAML/JSON). On error, return `SPEC_PARSE_ERROR`.
2. **Validate fields** against RULE-SDD-1 through RULE-SDD-7.
3. **Generate callsign** — if not provided, derive from `title` using slug normalization + a monotonic per-project counter (e.g., `oauth2-login-01`).
4. **Generate flight plan** — convert `vectors` entries to `Vector` objects in declaration order, each with status `pending`.
5. **Select pilots** — apply the pilot selection strategy (Section 4) to fill unspecified seats.
6. **Create git branch** — create a worktree branch named `<callsign>` off the project's main branch.
7. **Initialize craft** in Taxiing state with the generated callsign, branch, cargo, category, flight plan, and crew.
8. **Record black box entry** — append a `Decision` entry: `"Craft created from spec. Title: <title>. Notes: <notes>. Metadata: <metadata>."` The raw spec document is attached as a JSON blob.
9. **Auto-launch** — if `autoLaunch: true`, immediately transition the craft to InFlight and start the captain's agent process.
10. **Return** the created craft object (callsign, branch, status, crew, flight plan).

### 3.1 Atomicity

Steps 1–8 MUST succeed or the entire operation MUST be rolled back. A partially-created craft — one with a branch but no database record, or vice versa — is not acceptable. The daemon MUST use transactional semantics on the craft store and catch git errors to perform cleanup before returning an error.

---

## 4. Pilot Selection Strategy

When no explicit captain is specified, the daemon runs the following algorithm:

1. **Filter by certification:** Collect all project pilots certified for `spec.category`.
2. **Apply exclusions:** Remove any pilot IDs listed in `spec.pilots.exclude`.
3. **Apply additional certification requirements:** If `spec.pilots.requireCertifications` is non-empty, further filter to pilots holding all required certifications.
4. **Score by workload:** Count each candidate's active crafts where status is `InFlight` (as captain). Pilots with fewer active captaincies score better.
5. **Break ties alphabetically** by pilot identifier.
6. **Select the top-scoring pilot** as captain.
7. **Reject if empty:** If no candidates remain after filtering, return `NO_CERTIFIED_PILOT`.

First officers: if `pilots.firstOfficers` is empty and the project config defines a minimum crew for the category, the daemon selects the next N certified pilots by the same algorithm (excluding the chosen captain). If no minimum crew is configured, first officers default to none.

### 4.1 Rules

- **RULE-SDD-8:** Auto-selected captains MUST be certified for the craft's category (RULE-PILOT-2 applies).
- **RULE-SDD-9:** If no certified pilot is available, the spec submission MUST fail with `NO_CERTIFIED_PILOT` and include a message listing the category and available pilots' certifications.
- **RULE-SDD-10:** Auto-selection MUST NOT assign the same pilot as both captain and first officer.

---

## 5. Integration Points

### 5.1 REST API

```
POST /api/v1/projects/:name/crafts/from-spec
Content-Type: application/json | application/yaml

Request body: spec document (JSON or YAML)

Response 201: created craft object
Response 400: SPEC_PARSE_ERROR | SPEC_VALIDATION_ERROR | UNKNOWN_CATEGORY | CALLSIGN_CONFLICT
Response 422: NO_CERTIFIED_PILOT | PILOT_NOT_CERTIFIED
Response 500: branch creation failure (rolled back)
```

The endpoint is idempotent on `callsign` — if the same explicit callsign is submitted twice, the second request returns `CALLSIGN_CONFLICT` rather than creating a duplicate.

### 5.2 Spec Inbox (File Watch)

When a project is configured with a `specInbox` directory path, the daemon watches it. Any `.spec.yaml` or `.spec.json` file dropped into the directory is automatically submitted as if via the REST endpoint.

- On success, the source file is moved to `specInbox/.processed/<timestamp>-<filename>`.
- On error, the source file is moved to `specInbox/.failed/<timestamp>-<filename>` and a `<filename>.error` sidecar is written with the error details.
- **RULE-SDD-11:** The file watcher MUST NOT process the same file twice (deduplicate by inode or content hash).

### 5.3 CLI

```bash
atc spec submit --project <name> --file <path>
atc spec submit --project <name> --stdin  # reads YAML/JSON from stdin
```

Returns the created craft's callsign and a link to the craft detail view on success.

### 5.4 External Agent Integration (Paperclip / CI)

The REST API accepts a standard `Authorization: Bearer <token>` header using an ATC API key scoped to a project. External agents (e.g., a Paperclip Steering Lead, a CI step on issue creation) can submit specs programmatically.

Recommended pattern for a project tracker integration:
1. An issue is created/assigned in the tracker.
2. A webhook fires and the tracker's integration agent converts the issue fields to an ATC spec document.
3. The agent POSTs to `/api/v1/projects/:name/crafts/from-spec`.
4. The ATC craft callsign is written back to the tracker issue for cross-referencing.

---

## 6. Callsign Generation

When no explicit callsign is provided:

1. Slugify `title`: lowercase, replace spaces and special chars with hyphens, collapse consecutive hyphens, trim.
2. Truncate slug to 40 characters at a word boundary.
3. Append a zero-padded monotonic counter: `<slug>-<NN>` where NN starts at `01` per project and increments per spec-created craft.
4. If the resulting callsign collides with an existing craft, increment NN until unique.

Example: `"Add OAuth2 login to user API"` → `add-oauth2-login-to-user-api-01`.

---

## 7. Error Reference

| Code | HTTP | Meaning |
|------|------|---------|
| `SPEC_PARSE_ERROR` | 400 | Spec document is malformed YAML/JSON |
| `SPEC_VALIDATION_ERROR` | 400 | Required field missing or invalid |
| `UNKNOWN_CATEGORY` | 400 | `category` does not match project config |
| `CALLSIGN_CONFLICT` | 400 | Explicit callsign already in use |
| `NO_CERTIFIED_PILOT` | 422 | No pilots certified for the category after filtering |
| `PILOT_NOT_CERTIFIED` | 422 | Explicitly named pilot lacks required certification |
| `BRANCH_CREATION_FAILED` | 500 | Git branch could not be created (rolled back) |

---

## 8. Future Work

These items are out of scope for the initial implementation but are worth tracking:

- **LLM-assisted spec generation.** A natural language description (e.g., a Paperclip issue body) is passed to an LLM that returns a valid spec document. This is a pre-processing layer that lives outside the daemon.
- **Multi-craft spec expansion.** A spec that describes a large feature is split into sub-crafts, each covering one aspect. Requires a DAG-based dependency system in vectors.
- **Vector dependency graph.** Today vectors are strictly ordered. A future extension would allow a vector to declare dependencies on other vectors, enabling parallel vector progress.
- **Spec templates.** A project-configured library of spec templates for common change types (bugfix, feature, infrastructure) that pre-populate vectors and category.
- **Spec revision and re-planning.** When an emergency causes return-to-origin, the original spec is surfaced to the re-planner who can amend it and resubmit.
- **Capacity-aware scheduling.** Reject or queue spec submissions when all eligible pilots are over a workload threshold.

---

## 9. Open Questions for Team Review

The following questions are raised for team evaluation. Each is marked with the role best positioned to evaluate it.

**Q1 (AI Engineer, AI Futurist):** Should the spec `criteria` field accept natural language strings that are later verified by an LLM judge, or should criteria be machine-executable (shell commands, test selectors)? What is the right level of formalism at v1?

**Q2 (Daemon Engineer):** The atomicity requirement in Section 3.1 (craft store + git branch creation) is demanding. What is the right rollback strategy when git branch creation fails after the craft record is written? Should we use a `pending` intermediate state?

**Q3 (Lead, Platform Engineer):** The pilot selection workload metric only counts active InFlight captaincies. Should it also count first officer assignments, or is captain load the right proxy? Are there other fairness concerns with the proposed algorithm?

**Q4 (Frontend Engineer):** What does a spec submission UI look like? Is a form-based builder better than a raw YAML editor for most users? Should we support drag-and-drop `.spec.yaml` file upload?

**Q5 (Steering Lead, CTO):** Where should `specInbox` directory monitoring live — in the daemon as a built-in feature, or as a separate sidecar process? The daemon already has a lot of responsibilities.

**Q6 (All):** Should `autoLaunch: true` be allowed by default, or should it require explicit project-level opt-in to avoid accidental agent launches? What are the blast-radius concerns?
