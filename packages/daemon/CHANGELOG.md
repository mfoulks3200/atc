# @airtrafficcontrol/daemon Changelog

## Unreleased

### Added

- `CraftState.createdAt: string` (ISO-8601) — required field set at craft creation and exposed via the REST API.
- `CraftStore.loadProject` backfills missing `createdAt` on legacy `craft.json` files from the earliest black-box entry, falling back to the current time when the log is empty. In-memory migration only; the on-disk file is not rewritten.
