# @airtrafficcontrol/core Changelog

## Unreleased

### Added

- `createTfr(params: CreateTfrParams): TemporaryFlightRestriction` — creates a new TFR with validation. Rejects global TFRs from the tower (RULE-TFR-4) and enforces scope/target invariants (RULE-TFR-2). Throws `TfrError`.
- `liftTfr(tfr: TemporaryFlightRestriction): TemporaryFlightRestriction` — returns a copy with `liftedAt` set. Throws `TfrError` if already lifted. @see RULE-TFRP-3
- `isAffectedByTfr(tfr, projectName, callsign): boolean` — returns true if the TFR is active and its scope applies to the given project/craft. @see RULE-TFR-7
- `getActiveTfrs(tfrs): TemporaryFlightRestriction[]` — filters a list to only the TFRs where `liftedAt` is null.
- `applyHoldingPattern(craft: Craft): Craft` — returns a copy with `holdingPattern: true` without altering lifecycle state. @see RULE-TFR-5
- `clearHoldingPattern(craft: Craft): Craft` — returns a copy with `holdingPattern: false`. @see RULE-TFR-8
- `CreateTfrParams` interface — parameters accepted by `createTfr`.

### Changed

- `createCraft` now stamps `createdAt: new Date()` on every craft it returns, per RULE-CRAFT-6.
- `createCraft` now initializes `holdingPattern: false` on every craft it returns, per RULE-TFR-5.
