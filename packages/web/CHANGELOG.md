# @airtrafficcontrol/web Changelog

## Unreleased

### Added

- `CraftState.createdAt: string` mirror of the daemon API type.
- `<FlightRadar />` dashboard hero widget rendering every active craft as a deterministic SVG radar with click-through to craft detail.
- `FlightPlanHero` component on the craft detail page: a tactical-HUD arc visualization of the flight plan with segment lengths proportional to actual/estimated durations, equally-spaced label callouts, state-aware plane glyph, and four corner readouts (ELAPSED / ETA / PROGRESS / STATUS).
- `TermHint` component: inline `?` icon that shows a hover/focus tooltip with the definition of a domain term (`term="Craft"`) or rule (`rule="RULE-CTRL-2"`).
- `GlossaryModal` component: reference dialog reachable from a persistent `?` button in the global header, with Glossary and Rules tabs and a shared client-side filter. Glossary and rule data are parsed from `docs/specification.md` at Vite build time and exposed via `__ATC_GLOSSARY__` / `__ATC_RULES__` so the spec stays the single source of truth.
