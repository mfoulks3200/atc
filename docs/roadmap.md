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

- [ ] **Add project config REST routes** — The daemon serves global config via `/api/v1/config/global` (GET, PUT, PATCH, DELETE key) but project-level config (`ProjectMetadata`: categories, checklist, MCP servers) is read-only at boot. Add CRUD routes under `/api/v1/projects/:name/config` with the same pattern as global config. _Packages: daemon_

- [ ] **Add pilot config REST routes** — Expose per-pilot configuration (certifications, MCP servers, skills) through dedicated config endpoints, separate from the existing pilot CRUD routes which handle identity. _Depends on: project config routes (for consistency). Packages: daemon_

- [ ] **Build global settings UI** — A settings screen for global daemon configuration: default profile, and profile-level settings (port, host, log level, auto-recover, heartbeat/flush intervals, adapter config). _Packages: web_

- [ ] **Build project settings UI** — A settings screen scoped to a project: categories, checklist items, project-level MCP servers, and project-level skills. Accessible from the project detail view. _Depends on: project config routes. Packages: web_

- [ ] **Build pilot settings UI** — A settings panel on the pilot detail view for per-pilot configuration: certifications, MCP servers, and assigned skills. _Depends on: pilot config routes, pilot detail edit interface. Packages: web_

- [ ] **About page in global settings** — Add an "About" section to the global settings area showing the current ATC version, recent changelog entries, and a list of contributors. Version and changelog can be derived from package.json and CHANGELOG.md at build time; contributors from git history or a maintained list. _Packages: web, daemon_

- [ ] **WebSocket broadcasting for project and pilot config changes** — Global config changes already broadcast on `config:global`. Extend this pattern to project and pilot config so the UI can react in real time. _Depends on: project and pilot config routes. Packages: daemon_

## Skills

- [ ] **Define skills data model** — Add an `AgentSkill` type representing a skill entry: a reference to a SKILL.md directory on disk, its parsed metadata (name, description), and its assignment scope (global, project, or pilot). Store global skills in the daemon's global config directory and project skills in the project's config directory. _Packages: types, daemon_

- [ ] **Build skill discovery and parsing** — Implement discovery of AgentSkills-format directories (containing `SKILL.md` with YAML frontmatter). Parse and validate the `name`, `description`, and optional fields per the AgentSkills specification. Scan configured skill paths at startup and on config change. _Packages: daemon_

- [ ] **Add skill REST routes** — CRUD endpoints for managing skill registrations. Global skills under `/api/v1/config/global/skills`, project skills under `/api/v1/projects/:name/skills`. Endpoints should support adding a skill by disk path, listing available skills, and removing a skill registration. _Packages: daemon_

- [ ] **Skill assignment API** — Endpoints for assigning skills to pilots. A pilot's effective skills are the union of global skills, their project's skills, and their directly assigned skills. Project-scoped skills must not be assignable to pilots in other projects. _Depends on: skill REST routes, pilot config routes. Packages: daemon_

- [ ] **Skills management UI** — A UI for browsing and managing skills at each scope level. In global settings: manage global skill paths. In project settings: manage project skill paths. In pilot settings: toggle which available skills (global + project) are assigned to the pilot, with the ability to add pilot-specific skill paths. _Depends on: skill REST routes, skill assignment API, global/project/pilot settings UI. Packages: web_

- [ ] **Skill content viewer** — Allow viewing and editing SKILL.md contents from the UI. Show parsed metadata (name, description, compatibility) and the instruction body. Support browsing referenced files (scripts/, references/, assets/). _Depends on: skills management UI. Packages: web, daemon_

- [ ] **Inject skills into agent context** — When launching a pilot as an agent, resolve their effective skill set and include skill metadata in the system prompt. The adapter's `buildSystemPrompt` should list available skills so the agent can activate them on demand following the AgentSkills progressive disclosure model. _Depends on: skill discovery and parsing, skill assignment API. Packages: adapter-claude-agent-sdk, daemon_

## UI / UX

- [ ] **Glossary modal with search** — Add a glossary modal accessible from a persistent icon in the global navigation bar. The glossary should contain all notable terms from `docs/specification.md` (Craft, Pilot, Captain, First Officer, Jumpseat, Vector, Flight Plan, Black Box, Tower, Controls, Clearance, Emergency, Intercom, Checklist, etc.) with their formal definitions and how they relate to other terms (e.g. a Pilot occupies a Seat on a Craft; a Flight Plan is an ordered sequence of Vectors). Include a lightweight client-side search/filter so users can quickly find terms by keyword. _Packages: web_

## Rule Enforcement

- [x] **Type `CraftCategory` enum** — The `category` field on `Craft` is a plain `string`. Define a `CraftCategory` enum or const object in `@airtrafficcontrol/types` with the known categories so downstream code gets type-safe narrowing instead of arbitrary strings. _Packages: types, core, daemon_

- [x] **Enforce RULE-EMER-1 in core `transitionCraft`** — The captain-only check for emergency declarations is only enforced in the daemon route handler and `Tower.declareEmergency`, not in `transitionCraft()`. Add a pilot/seat-type parameter to the core transition path so RULE-EMER-1 is enforced at the library level, not just the HTTP layer. _Packages: core, tower_

- [x] **Reconcile checklist runner early-exit behavior** — The daemon's shell-based checklist runner exits on the first `required` failure, while the core `runChecklist` in `@airtrafficcontrol/checklist` runs all items regardless of severity. Decide on one behavior and align both implementations. _Packages: checklist, daemon_

- [x] **Add pilot authorization to `runChecklist`** — RULE-LCHK-1 requires the executing pilot to hold controls, but `runChecklist()` accepts no pilot or craft context. Add parameters so the authorization check can be enforced at the library level. _Packages: checklist, core_

- [x] **Enforce remaining lifecycle preconditions in core** — `transitionCraft()` only checks RULE-LIFE-4 (all vectors passed) and RULE-LIFE-7 (emergency in bbox). RULE-LIFE-3 (checklist pass), RULE-LIFE-5 (clearance), and RULE-LIFE-6 (queue position) are daemon-only. Move these checks into core so library consumers get the same guarantees. _Packages: core, types_

- [x] **Validate seat type in `shareControls`** — `shareControls()` does not verify that the pilot IDs passed for shared areas belong to Captain or FirstOfficer seats, allowing a Jumpseat pilot to be granted shared controls in violation of RULE-CTRL-2. Add seat-type validation. _Packages: core, validation_
