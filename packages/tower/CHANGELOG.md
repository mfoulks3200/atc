# @airtrafficcontrol/tower Changelog

## Unreleased

### Added

- `MergeExecutor` interface and `MergeOutcome` discriminated union (`src/types.ts`) — side-effect-free seam the tower uses to drive real git operations from a host (typically `@airtrafficcontrol/daemon`). The tower package itself contains no git I/O. @see RULE-TMRG-2, RULE-TMRG-3
- `Tower.executeMerge(craft, executor)` — orchestrates steps 4–6 of the tower merge protocol. Verifies the craft branch is up to date with main via the executor (RULE-TOWER-3, RULE-TMRG-2), invokes the executor's merge implementation, and returns a `MergeOutcome` of `landed`, `stale`, or `conflict`. Always dequeues the craft. Throws `TowerError` if the craft is not in the merge queue. @see RULE-TOWER-3, RULE-TMRG-2, RULE-TMRG-3, RULE-TMRG-4
