# @airtrafficcontrol/web Changelog

## Unreleased

### Added

- `CraftState.createdAt: string` mirror of the daemon API type.
- `FlightPlanHero` component on the craft detail page: a tactical-HUD arc visualization of the flight plan with segment lengths proportional to actual/estimated durations, equally-spaced label callouts, state-aware plane glyph, and four corner readouts (ELAPSED / ETA / PROGRESS / STATUS).
