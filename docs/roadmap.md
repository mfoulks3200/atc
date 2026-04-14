# Roadmap

Upcoming work for ATC, organized by workstream. Items are unordered within each section. Dependencies are noted where they exist.

## Pilot Management

- [x] **Wire up pilot creation modal** — The `CreatePilotModal` component exists but is not accessible from the pilots list view. Add a trigger button to the list page that opens it. _Packages: web_

- [x] **Add pilot delete endpoint** — The daemon has create, read, and update routes for pilots but no DELETE. Add `DELETE /api/v1/projects/:name/pilots/:id`. _Packages: daemon_

- [x] **Add pilot delete action to UI** — Expose the delete endpoint in the pilot detail view with a confirmation step. _Depends on: pilot delete endpoint. Packages: web_

- [x] **Build pilot detail edit interface** — The pilot detail view (`routes/pilots/detail.tsx`) is read-only, showing agent runtime info (status, PID, usage). Add an editable section for the pilot record: identifier (read-only), certifications (toggle chips like the creation modal), and MCP servers. _Packages: web_

- [x] **Persist pilot records to disk** — Pilot records are stored in an in-memory `Map` and lost on daemon restart. Back them with an atomic JSON store like crafts and agents already use. _Packages: daemon_

- [x] **Decouple pilot records from agent runtime** — The web UI currently fetches pilot data through the agents API (`useAgents`, `useAgent`), conflating the reusable pilot template with the running agent instance. The pilots list should query the pilot CRUD routes, with the agent runtime info shown as a linked section on the detail view. _Packages: web_

## Configuration

- [x] **Add project config REST routes** — The daemon now wraps each project in a `LayeredConfigStore<ProjectMetadataConfig>` and exposes CRUD routes under `/api/v1/projects/:name/config` with the same pattern as global config. _Packages: daemon_

- [x] **Add pilot config REST routes** — Per-pilot configuration (certifications, MCP servers, skills) is exposed under `/api/v1/projects/:name/pilots/:id/config`. Currently backed by an in-memory `PilotConfigStore` — see the pilot config persistence item below. _Packages: daemon_

- [x] **Build global settings UI** — Settings screens at `/settings/general` (default profile) and `/settings/profile` (port, host, log level, auto-recover, heartbeat/flush intervals, read-only). Adapter config is intentionally excluded from the UI for now. _Packages: web_

- [x] **Build project settings UI** — Project settings screens at `/settings/project/:name/general` (categories, checklist) and `/settings/project/:name/mcp-servers`, accessible from the project detail view. _Packages: web_

- [x] **Build pilot settings UI** — Pilot settings screens at `/settings/pilot/:id/general` (certifications toggle chips) and `/settings/pilot/:id/mcp-servers`. Skills UI is deferred to the Skills roadmap. _Packages: web_

- [x] **About page in global settings** — `/settings/about` with version and changelog baked in at build time via a Vite `define` block reading the web package's `package.json` and `CHANGELOG.md`. A companion `GET /api/v1/about` endpoint was added on the daemon for other consumers. _Packages: web, daemon_

- [x] **WebSocket broadcasting for project and pilot config changes** — Project config changes broadcast on `config:project:<name>` and pilot config changes on `config:pilot:<id>`. The WebSocket client message type supports `scope: "project"` and `scope: "pilot"` for mutations. The web UI subscribes to these channels from the settings pages. _Packages: daemon, web_

- [ ] **Upgrade pilot config routes to LayeredConfigStore** — The pilot config routes are initially backed by an in-memory store since pilot-config persistence has not been implemented. Once pilot records are extended to carry durable per-pilot configuration, upgrade the pilot config backing store to a `LayeredConfigStore<PilotConfig>` per pilot, bringing file-watching, sparse diffs, and durable persistence. _Packages: daemon_

## Skills

- [ ] **Define skills data model** — Add an `AgentSkill` type representing a skill entry: a reference to a SKILL.md directory on disk, its parsed metadata (name, description), and its assignment scope (global, project, or pilot). Store global skills in the daemon's global config directory and project skills in the project's config directory. _Packages: types, daemon_

- [ ] **Build skill discovery and parsing** — Implement discovery of AgentSkills-format directories (containing `SKILL.md` with YAML frontmatter). Parse and validate the `name`, `description`, and optional fields per the AgentSkills specification. Scan configured skill paths at startup and on config change. _Packages: daemon_

- [ ] **Add skill REST routes** — CRUD endpoints for managing skill registrations. Global skills under `/api/v1/config/global/skills`, project skills under `/api/v1/projects/:name/skills`. Endpoints should support adding a skill by disk path, listing available skills, and removing a skill registration. _Packages: daemon_

- [ ] **Skill assignment API** — Endpoints for assigning skills to pilots. A pilot's effective skills are the union of global skills, their project's skills, and their directly assigned skills. Project-scoped skills must not be assignable to pilots in other projects. _Depends on: skill REST routes, pilot config routes. Packages: daemon_

- [ ] **Skills management UI** — A UI for browsing and managing skills at each scope level. In global settings: manage global skill paths. In project settings: manage project skill paths. In pilot settings: toggle which available skills (global + project) are assigned to the pilot, with the ability to add pilot-specific skill paths. _Depends on: skill REST routes, skill assignment API, global/project/pilot settings UI. Packages: web_

- [ ] **Skill content viewer** — Allow viewing and editing SKILL.md contents from the UI. Show parsed metadata (name, description, compatibility) and the instruction body. Support browsing referenced files (scripts/, references/, assets/). _Depends on: skills management UI. Packages: web, daemon_

- [ ] **Inject skills into agent context** — When launching a pilot as an agent, resolve their effective skill set and include skill metadata in the system prompt. The adapter's `buildSystemPrompt` should list available skills so the agent can activate them on demand following the AgentSkills progressive disclosure model. _Depends on: skill discovery and parsing, skill assignment API. Packages: adapter-claude-agent-sdk, daemon_

## UI / UX

- [ ] **Glossary & rules reference modal** — Add a reference modal accessible from a persistent icon in the global navigation bar. The modal has two tabs: (1) **Glossary** — all notable terms from `docs/specification.md` (Craft, Pilot, Captain, First Officer, Jumpseat, Vector, Flight Plan, Black Box, Tower, Controls, Clearance, Emergency, Intercom, Checklist, etc.) with their formal definitions and how they relate to other terms (e.g. a Pilot occupies a Seat on a Craft; a Flight Plan is an ordered sequence of Vectors), with a lightweight client-side search/filter. (2) **Rules** — a browsable list of all `RULE-*` identifiers from the spec with their descriptions, grouped by prefix (CRAFT, CTRL, LIFE, SEAT, VEC, LCHK, TOWER, TMRG, EMER, etc.), also with a lightweight search/filter. _Packages: web_

## Rule Enforcement

- [x] **Type `CraftCategory` enum** — The `category` field on `Craft` is a plain `string`. Define a `CraftCategory` enum or const object in `@airtrafficcontrol/types` with the known categories so downstream code gets type-safe narrowing instead of arbitrary strings. _Packages: types, core, daemon_

- [x] **Enforce RULE-EMER-1 in core `transitionCraft`** — The captain-only check for emergency declarations is only enforced in the daemon route handler and `Tower.declareEmergency`, not in `transitionCraft()`. Add a pilot/seat-type parameter to the core transition path so RULE-EMER-1 is enforced at the library level, not just the HTTP layer. _Packages: core, tower_

- [x] **Reconcile checklist runner early-exit behavior** — The daemon's shell-based checklist runner exits on the first `required` failure, while the core `runChecklist` in `@airtrafficcontrol/checklist` runs all items regardless of severity. Decide on one behavior and align both implementations. _Packages: checklist, daemon_

- [x] **Add pilot authorization to `runChecklist`** — RULE-LCHK-1 requires the executing pilot to hold controls, but `runChecklist()` accepts no pilot or craft context. Add parameters so the authorization check can be enforced at the library level. _Packages: checklist, core_

- [x] **Enforce remaining lifecycle preconditions in core** — `transitionCraft()` only checks RULE-LIFE-4 (all vectors passed) and RULE-LIFE-7 (emergency in bbox). RULE-LIFE-3 (checklist pass), RULE-LIFE-5 (clearance), and RULE-LIFE-6 (queue position) are daemon-only. Move these checks into core so library consumers get the same guarantees. _Packages: core, types_

- [x] **Validate seat type in `shareControls`** — `shareControls()` does not verify that the pilot IDs passed for shared areas belong to Captain or FirstOfficer seats, allowing a Jumpseat pilot to be granted shared controls in violation of RULE-CTRL-2. Add seat-type validation. _Packages: core, validation_

## Temporary Flight Restrictions

The TFR domain model, core logic, persistence, REST routes, and spec are all in place (see `docs/specification.md` §2.6 and §4.5). The remaining items require integration with the agent runtime and WebSocket layer.

- [ ] **Enforce `holdingPattern` across daemon action handlers (RULE-TFR-6)** — All daemon mutation routes (vectors, controls, intercom, blackbox, checklist, transitions) must reject actions on a craft whose `holdingPattern` flag is `true`. The flag is set today but not checked. Return 409 with a reference to the active TFR. _Packages: daemon_

- [ ] **Graceful-mode wind-down window (RULE-TFRP-1)** — In graceful mode, affected agents need a brief wind-down window to reach a safe stopping point and record state as an `Observation` entry before the `holdingPattern` flag takes effect. Today, graceful mode sets the flag immediately like immediate mode. Implement the delay, the notification signal to agents, and the mandatory state-recording step. _Packages: daemon, adapter-claude-agent-sdk_

- [ ] **Agent auto-resume on TFR lift (RULE-TFRP-4)** — When a TFR is lifted, affected agents must automatically resume from their prior state. This requires the daemon to notify agents (via WebSocket or adapter hook) and the adapter to re-engage paused sessions. _Packages: daemon, adapter-claude-agent-sdk_

- [ ] **Intercom notifications for TFR events (RULE-TFRP-6)** — `TFRIssued` and `TFRLifted` events must be posted as system notifications on each affected craft's intercom, not just recorded in the black box. The route helpers currently record the black box entries but do not publish intercom messages or broadcast `craft:<callsign>` WebSocket events. _Packages: daemon_

- [ ] **Tower-initiated TFR gating via project config (RULE-TFR-4)** — The spec allows the tower to issue project- or craft-scoped TFRs only if enabled in project configuration. The route currently accepts any tower-issued non-global TFR. Add a `towerInitiatedTfrsEnabled` boolean to `ProjectMetadata` and reject tower TFRs when the flag is unset. _Packages: daemon, types_

- [ ] **Global-scope TFR craft discovery** — When a `global` TFR is issued without a `projectName`, the daemon does not iterate every project to set `holdingPattern` and record black box entries. Implement a cross-project fan-out so global TFRs actually reach every active craft. _Packages: daemon_

- [ ] **TFR management UI** — Surface active and historical TFRs in the web dashboard. Allow the user to issue a TFR at any scope, view affected crafts, and lift active TFRs. A persistent indicator should show when any TFR is active. _Depends on: TFR REST routes (done). Packages: web_
