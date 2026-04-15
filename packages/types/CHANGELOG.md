# @airtrafficcontrol/types Changelog

## Unreleased

### Added

- `Craft.createdAt: Date` — immutable timestamp recorded when a craft enters the Taxiing phase. Required field. @see RULE-CRAFT-6
- `TfrScope` enum (`Global`, `Project`, `Craft`) — scope levels for a Temporary Flight Restriction. @see RULE-TFR-2
- `TfrMode` enum (`Graceful`, `Immediate`) — enforcement mode for a TFR. @see RULE-TFRP-1, RULE-TFRP-2
- `TfrIssuer` type (`"user" | "tower"`) — who issued a TFR. @see RULE-TFR-3, RULE-TFR-4
- `TemporaryFlightRestriction` interface — overlay that pauses agent activity without altering craft lifecycle state. Fields: `identifier`, `scope`, `target`, `mode`, `reason`, `issuedBy`, `issuedAt`, `liftedAt`. @see RULE-TFR-1 through RULE-TFR-8
- `BlackBoxEntryType.TFRIssued` and `BlackBoxEntryType.TFRLifted` — recorded on affected crafts when a TFR takes effect or is lifted. @see RULE-TFRP-5
- `BlackBoxEntryType.CraftCreated`, `Launched`, `VectorFailed`, `ChecklistItem`, `ClearanceRequested`, `TowerEnqueued`, `TowerDequeued`, `StateTransition` — lifecycle event entry types used by the daemon to record a complete audit trail on every craft. @see RULE-BBOX-1
- `Craft.holdingPattern: boolean` — overlay flag set while any active TFR applies to the craft. Non-readonly, mutable during lifecycle. @see RULE-TFR-5, RULE-TFR-6
