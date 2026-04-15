# @airtrafficcontrol/web Changelog

## Unreleased

### Added

- `<LaunchButton />` hero action on the craft detail page: enabled only when the craft is in `Taxiing` with captain, cargo, and a non-empty flight plan. Clicking opens a confirmation dialog listing the captain, flight plan length, and branch; confirming POSTs `/api/v1/projects/:name/crafts/:callsign/launch` to transition the craft to `InFlight`, after which the existing `<ActivityFeed />` begins streaming. Missing-captain, empty-flight-plan, wrong-state, and generic 4xx/5xx errors surface as a non-dismissable inline alert inside the dialog so the user can correct and retry. `useLaunchCraft` mutation hook wires the POST with TanStack Query cache invalidation for craft detail, list, and black box.
- `<ActivityFeed />` live craft activity view on the craft detail page: subscribes to the `craft:<callsign>` WebSocket channel, merges `craft.blackbox.appended` events with the seeded black box, renders lifecycle entries and `AgentOutput` stdout/stderr lines inline with distinct styling, and offers a follow-tail toggle with a "jump to latest" affordance when the user scrolls up.
- `BlackBoxEntryType` mirrors the new daemon enum values (`CraftCreated`, `Launched`, `VectorFailed`, `ChecklistItem`, `ClearanceRequested`, `TowerEnqueued`, `TowerDequeued`, `StateTransition`, `AgentOutput`, `Merge`, `MergeStale`, `MergeConflict`, `TFRIssued`, `TFRLifted`).
- `CraftState.createdAt: string` mirror of the daemon API type.
- `<FlightRadar />` dashboard hero widget rendering every active craft as a deterministic SVG radar with click-through to craft detail.
- `FlightPlanHero` component on the craft detail page: a tactical-HUD arc visualization of the flight plan with segment lengths proportional to actual/estimated durations, equally-spaced label callouts, state-aware plane glyph, and four corner readouts (ELAPSED / ETA / PROGRESS / STATUS).
- `TermHint` component: inline `?` icon that shows a hover/focus tooltip with the definition of a domain term (`term="Craft"`) or rule (`rule="RULE-CTRL-2"`).
- `GlossaryModal` component: reference dialog reachable from a persistent `?` button in the global header, with Glossary and Rules tabs and a shared client-side filter. Glossary and rule data are parsed from `docs/specification.md` at Vite build time and exposed via `__ATC_GLOSSARY__` / `__ATC_RULES__` so the spec stays the single source of truth.
