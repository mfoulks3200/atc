# @atc/types

Pure TypeScript type definitions for the ATC domain model. No runtime logic, no external dependencies. This package is the single source of truth for every enum, interface, type alias, and const that other ATC packages import.

## Installation

```bash
pnpm add @atc/types
```

This is an internal workspace package (`workspace:*`).

## API Reference

### Enums

#### `CraftStatus`

All possible lifecycle states for a craft. See `RULE-LIFE-1` through `RULE-LIFE-8`.

| Value | Description |
|---|---|
| `Taxiing` | Craft initialized — branch created, pilots assigned, cargo and flight plan defined |
| `InFlight` | Pilots actively implementing, navigating vectors in order |
| `LandingChecklist` | All vectors passed; pilot runs validation checks |
| `GoAround` | Landing checklist failed; pilot addresses failures before re-attempt |
| `ClearedToLand` | Checklist passed, tower granted clearance; craft is in merge queue |
| `Landed` | Branch merged into main (terminal state) |
| `Emergency` | Pilot declared an emergency after repeated failures |
| `ReturnToOrigin` | Craft sent back to design stage for re-evaluation (terminal state) |

#### `SeatType`

Seat types available on a craft. See `RULE-SEAT-1` through `RULE-SEAT-4`.

| Value | Description |
|---|---|
| `Captain` | Pilot-in-command. Exactly one per craft |
| `FirstOfficer` | Certified assistant pilot. Zero or more per craft |
| `Jumpseat` | Observer/advisor. No code modification rights |

#### `ControlMode`

Control modes governing concurrent code modification. See `RULE-CTRL-1` through `RULE-CTRL-7`.

| Value | Description |
|---|---|
| `Exclusive` | A single pilot holds the controls |
| `Shared` | Two or more pilots hold controls with non-overlapping areas |

#### `VectorStatus`

Status of a vector in a craft's flight plan. See `RULE-VEC-1` through `RULE-VEC-5`.

| Value | Description |
|---|---|
| `Pending` | Vector has not been attempted yet |
| `Passed` | Vector's acceptance criteria have been met |
| `Failed` | Vector's acceptance criteria could not be met |

#### `BlackBoxEntryType`

Types of black box log entries. See `RULE-BBOX-1` through `RULE-BBOX-4`.

| Value | Description |
|---|---|
| `Decision` | An implementation decision (algorithm, library, approach choice) |
| `VectorPassed` | A vector's acceptance criteria were met |
| `GoAround` | The landing checklist failed and a go-around was initiated |
| `Conflict` | A disagreement between pilots, and how it was resolved |
| `Observation` | Any other noteworthy event, risk, or context |
| `EmergencyDeclaration` | The captain has declared an emergency |

### Interfaces

#### `Craft`

The fundamental unit of work in ATC. See `RULE-CRAFT-1` through `RULE-CRAFT-5`.

| Property | Type | Description |
|---|---|---|
| `callsign` | `string` | Unique, immutable identifier |
| `branch` | `string` | Associated git branch (1:1) |
| `cargo` | `string` | Description of the change and its scope |
| `category` | `string` | Determines pilot eligibility |
| `captain` | `Pilot` | Pilot-in-command |
| `firstOfficers` | `readonly Pilot[]` | Certified assistant pilots |
| `jumpseaters` | `readonly Pilot[]` | Observer/advisor pilots |
| `flightPlan` | `FlightPlan` | Ordered milestones |
| `blackBox` | `readonly BlackBoxEntry[]` | Append-only event log |
| `controls` | `ControlState` | Current control state |
| `status` | `CraftStatus` | Current lifecycle phase |

#### `Pilot`

An autonomous agent that can be assigned to a craft. See `RULE-PILOT-1`, `RULE-PILOT-2`.

| Property | Type | Description |
|---|---|---|
| `identifier` | `string` | Unique identifier for the pilot agent |
| `certifications` | `readonly string[]` | Craft categories this pilot is certified to fly |

#### `Vector`

A milestone in a craft's flight plan. See `RULE-VEC-1` through `RULE-VEC-5`.

| Property | Type | Description |
|---|---|---|
| `name` | `string` | Short, descriptive identifier |
| `acceptanceCriteria` | `string` | Specific, verifiable conditions that must be met |
| `status` | `VectorStatus` | Current status of this vector |

#### `VectorReport`

A report filed when a craft passes through a vector. See `RULE-VRPT-1` through `RULE-VRPT-4`.

| Property | Type | Description |
|---|---|---|
| `craftCallsign` | `string` | The craft that passed the vector |
| `vectorName` | `string` | The vector that was passed |
| `acceptanceEvidence` | `string` | Proof that acceptance criteria were met |
| `timestamp` | `Date` | When the vector was passed |

#### `BlackBoxEntry`

A single entry in a craft's black box log. See `RULE-BBOX-1` through `RULE-BBOX-4`.

| Property | Type | Description |
|---|---|---|
| `timestamp` | `Date` | When the entry was recorded |
| `author` | `string` | Identifier of the pilot who recorded the entry |
| `type` | `BlackBoxEntryType` | The kind of event |
| `content` | `string` | Description of the decision, event, or observation |

#### `SeatAssignment`

A pilot's assignment to a specific craft.

| Property | Type | Description |
|---|---|---|
| `pilot` | `Pilot` | The assigned pilot |
| `seat` | `SeatType` | The seat occupied on this craft |

#### `ControlState`

The current state of a craft's controls. See `RULE-CTRL-1` through `RULE-CTRL-7`.

| Property | Type | Description |
|---|---|---|
| `mode` | `ControlMode` | Current control mode |
| `holder` | `string?` | In Exclusive mode: the single pilot holding controls |
| `sharedAreas` | `readonly SharedControlArea[]?` | In Shared mode: the non-overlapping areas |

#### `SharedControlArea`

Describes a shared control area assignment.

| Property | Type | Description |
|---|---|---|
| `pilotIdentifier` | `string` | The pilot holding this area |
| `area` | `string` | Description of the area of responsibility |

### Type Aliases

| Type | Definition | Description |
|---|---|---|
| `FlightPlan` | `readonly Vector[]` | Ordered sequence of vectors assigned to a craft |
| `CraftTransition` | interface | A valid state transition (from, to, trigger, preconditions) |
| `PilotAction` | string union | Actions a pilot can perform (`modifyCode`, `holdControls`, `writeBlackBox`, `fileVectorReport`, `declareEmergency`, `requestLandingClearance`) |
| `SeatPermissions` | `Readonly<Record<PilotAction, boolean>>` | Permission flags for a given seat type |

### Runtime Constants

#### `TRANSITIONS`

All valid state transitions in the craft lifecycle (`readonly CraftTransition[]`). Any transition not listed is illegal. See `RULE-LIFE-2`.

Contains 9 transitions covering the full lifecycle: Taxiing -> InFlight -> LandingChecklist -> ClearedToLand -> Landed, with GoAround and Emergency branches.

#### `TERMINAL_STATES`

`ReadonlySet<CraftStatus>` containing `Landed` and `ReturnToOrigin`. No transitions out are permitted. See `RULE-LIFE-8`.

#### `PERMISSIONS`

`Readonly<Record<SeatType, SeatPermissions>>` mapping each seat type to its allowed actions. See `RULE-SEAT-1` through `RULE-SEAT-4`.

| Action | Captain | First Officer | Jumpseat |
|---|---|---|---|
| `modifyCode` | yes | yes | no |
| `holdControls` | yes | yes | no |
| `writeBlackBox` | yes | yes | yes |
| `fileVectorReport` | yes | yes | no |
| `declareEmergency` | yes | no | no |
| `requestLandingClearance` | yes | yes | no |

## Usage

```typescript
import {
  CraftStatus,
  SeatType,
  ControlMode,
  VectorStatus,
  BlackBoxEntryType,
  TRANSITIONS,
  TERMINAL_STATES,
  PERMISSIONS,
} from "@atc/types";

import type {
  Craft,
  Pilot,
  Vector,
  FlightPlan,
  BlackBoxEntry,
  VectorReport,
  ControlState,
  SeatAssignment,
  SharedControlArea,
  CraftTransition,
  PilotAction,
  SeatPermissions,
} from "@atc/types";
```

## Source Files

| File | Contents |
|---|---|
| `src/enums.ts` | All 5 enums |
| `src/entities.ts` | All entity interfaces |
| `src/lifecycle.ts` | `CraftTransition`, `TRANSITIONS`, `TERMINAL_STATES` |
| `src/permissions.ts` | `PilotAction`, `SeatPermissions`, `PERMISSIONS` |

## Related Packages

- [`@atc/core`](../core/) — Runtime implementation consuming these types
- [`@atc/errors`](../errors/) — Error classes for rule violations
- [`@atc/validation`](../validation/) — Validation functions using these types
