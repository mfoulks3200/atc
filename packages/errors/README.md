# @atc/errors

Structured error hierarchy for the ATC domain. Every error class extends `AtcError` and carries the `RULE-*` identifier of the violated specification rule. No external dependencies.

## Installation

```bash
pnpm add @atc/errors
```

This is an internal workspace package (`workspace:*`).

## Error Hierarchy

```
AtcError (base)
  ├── CraftError           RULE-CRAFT-*
  ├── SeatAssignmentError  RULE-SEAT-*
  ├── ControlsError        RULE-CTRL-*
  ├── BlackBoxError         RULE-BBOX-*
  ├── LifecycleError       RULE-LIFE-*
  ├── VectorError          RULE-VEC-*, RULE-VRPT-*
  ├── ChecklistError       RULE-LCHK-*
  ├── EmergencyError       RULE-EMER-*
  └── TowerError           RULE-TOWER-*, RULE-TMRG-*
```

## API Reference

### `AtcError`

Base error class for all ATC rule violations. Extends `Error`.

```typescript
new AtcError(message: string, ruleId: string)
```

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable description of what went wrong |
| `ruleId` | `string` | The `RULE-*` identifier that was violated |
| `name` | `string` | `"AtcError"` (overridden by subclasses) |

### `CraftError`

Thrown when a `RULE-CRAFT-*` invariant is violated. Covers craft creation and property constraints: unique callsign, required cargo, required category, required captain.

### `SeatAssignmentError`

Thrown when a `RULE-SEAT-*` invariant is violated. Covers seat assignment constraints: certification requirements, captain cardinality, jumpseat restrictions.

### `ControlsError`

Thrown when a `RULE-CTRL-*` invariant is violated. Covers control handoff and modification constraints: jumpseat exclusion, modification without controls, control transfer protocol violations.

### `BlackBoxError`

Thrown when a `RULE-BBOX-*` invariant is violated. Covers append-only log constraints: mutating existing entries, missing black box on lifecycle events.

### `LifecycleError`

Thrown when a `RULE-LIFE-*` invariant is violated. Covers lifecycle transition constraints: invalid transitions, transitions from terminal states, missing preconditions.

```typescript
new LifecycleError(message: string, ruleId: string, context?: LifecycleErrorContext)
```

#### `LifecycleErrorContext`

| Property | Type | Description |
|---|---|---|
| `from` | `string?` | The state the craft was transitioning from |
| `to` | `string?` | The state the craft was transitioning to |

### `VectorError`

Thrown when a `RULE-VEC-*` or `RULE-VRPT-*` invariant is violated. Covers vector sequencing, reporting, and flight plan constraints.

### `ChecklistError`

Thrown when a `RULE-LCHK-*` invariant is violated. Covers landing checklist constraints: execution authority, item failures, go-around triggers.

### `EmergencyError`

Thrown when a `RULE-EMER-*` invariant is violated. Covers emergency declaration constraints: captain-only authority, required black box entry, return-to-origin protocol.

### `TowerError`

Thrown when a `RULE-TOWER-*` or `RULE-TMRG-*` invariant is violated. Covers tower merge coordination: vector report verification, branch freshness, merge sequencing.

## Usage

```typescript
import { AtcError, CraftError, LifecycleError } from "@atc/errors";

// Throwing a domain error
throw new CraftError("Craft callsign is required", "RULE-CRAFT-1");

// Catching domain errors by type
try {
  transitionCraft(craft, CraftStatus.InFlight);
} catch (error) {
  if (error instanceof LifecycleError) {
    console.error(`Lifecycle violation: ${error.ruleId} — ${error.message}`);
  }
}

// Catching any ATC error
try {
  someOperation();
} catch (error) {
  if (error instanceof AtcError) {
    console.error(`ATC rule violated: ${error.ruleId}`);
  }
}
```

## Source Files

| File | Contents |
|---|---|
| `src/base.ts` | `AtcError` base class |
| `src/craft.ts` | `CraftError` |
| `src/seat.ts` | `SeatAssignmentError` |
| `src/controls.ts` | `ControlsError` |
| `src/black-box.ts` | `BlackBoxError` |
| `src/lifecycle.ts` | `LifecycleError`, `LifecycleErrorContext` |
| `src/vector.ts` | `VectorError` |
| `src/checklist.ts` | `ChecklistError` |
| `src/emergency.ts` | `EmergencyError` |
| `src/tower.ts` | `TowerError` |

## Related Packages

- [`@atc/types`](../types/) — Domain types referenced in error messages
- [`@atc/core`](../core/) — Throws these errors when rules are violated
- [`@atc/validation`](../validation/) — Throws `SeatAssignmentError` on invalid assignments
- [`@atc/tower`](../tower/) — Throws `TowerError` and `EmergencyError`
