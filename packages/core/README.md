# @atc/core

Runtime implementation of the ATC system. Provides pure functions for craft creation, lifecycle transitions, black box management, controls protocol, and flight plan navigation. All functions are immutable — they return new objects rather than mutating inputs.

## Installation

```bash
pnpm add @atc/core
```

This is an internal workspace package (`workspace:*`).

## API Reference

### Craft Creation

#### `createCraft(params: CreateCraftParams): Craft`

Creates a new craft, validating all `RULE-CRAFT-*` invariants. The craft is initialized in the `Taxiing` state with an empty black box and exclusive controls held by the captain.

Throws `CraftError` if any required field is missing. Throws `SeatAssignmentError` if any crew member lacks the required certification.

See `RULE-CRAFT-1` through `RULE-CRAFT-5`, `RULE-LIFE-1`, `RULE-BBOX-1`, `RULE-CTRL-1`.

#### `CreateCraftParams`

| Property | Type | Required | Description |
|---|---|---|---|
| `callsign` | `string` | yes | Unique, immutable identifier |
| `branch` | `string` | yes | Associated git branch (1:1) |
| `cargo` | `string` | yes | Description of the change and its scope |
| `category` | `string` | yes | Classification of change type |
| `captain` | `Pilot` | yes | Pilot-in-command (must be certified) |
| `firstOfficers` | `readonly Pilot[]` | no | Certified assistant pilots |
| `jumpseaters` | `readonly Pilot[]` | no | Observer/advisor pilots |
| `flightPlan` | `readonly Vector[]` | yes | Ordered milestones for the craft |

### Lifecycle

#### `transitionCraft(craft: Craft, to: CraftStatus): Craft`

Transitions a craft to a new lifecycle state. Validates the transition against the `TRANSITIONS` table and checks preconditions. Returns a new `Craft` with the updated status. See `RULE-LIFE-2` through `RULE-LIFE-8`.

Throws `LifecycleError` if the transition is invalid or preconditions are not met.

#### `canTransition(from: CraftStatus, to: CraftStatus): boolean`

Checks whether a state transition is valid. See `RULE-LIFE-2`.

#### `isTerminalState(status: CraftStatus): boolean`

Checks whether a status is terminal (`Landed` or `ReturnToOrigin`). See `RULE-LIFE-8`.

### Black Box

#### `createBlackBoxEntry(author: string, type: BlackBoxEntryType, content: string): BlackBoxEntry`

Creates a new entry with the current timestamp. See `RULE-BBOX-1`, `RULE-BBOX-3`.

#### `appendToBlackBox(blackBox: readonly BlackBoxEntry[], entry: BlackBoxEntry): readonly BlackBoxEntry[]`

Appends an entry, returning a new array. The original is never mutated. See `RULE-BBOX-2`.

### Controls

#### `createInitialControls(captainId: string): ControlState`

Creates the initial control state (exclusive, held by captain). See `RULE-CTRL-1`.

#### `claimExclusiveControls(current: ControlState, pilotId: string, seat: SeatType): ControlState`

Claims exclusive controls for a pilot. Throws `ControlsError` for Jumpseat pilots. See `RULE-CTRL-2`.

#### `shareControls(areas: SharedControlArea[]): ControlState`

Creates a shared control state with non-overlapping areas. Throws `ControlsError` if areas is empty or contains duplicate pilots. See `RULE-CTRL-5`.

#### `isHoldingControls(controls: ControlState, pilotId: string): boolean`

Checks whether a pilot currently holds controls. See `RULE-CTRL-3`.

### Flight Plan

#### `getNextVector(flightPlan: FlightPlan): Vector | undefined`

Returns the first pending vector. See `RULE-VEC-2`.

#### `reportVector(flightPlan: FlightPlan, vectorName: string): { flightPlan: FlightPlan; report: VectorReport }`

Reports a vector as passed. Validates ordering (no skipping). Returns the updated flight plan and a vector report. Throws `VectorError` if the vector is not found, not next in sequence, or already passed. See `RULE-VEC-2`, `RULE-VEC-3`, `RULE-VRPT-1`.

#### `allVectorsPassed(flightPlan: FlightPlan): boolean`

Checks whether every vector in a flight plan has been passed. See `RULE-VEC-4`.

#### `createVectorReport(craftCallsign: string, vectorName: string, evidence: string): VectorReport`

Creates a vector report with the current timestamp. See `RULE-VRPT-2`.

## Usage

```typescript
import {
  createCraft,
  transitionCraft,
  createBlackBoxEntry,
  appendToBlackBox,
  claimExclusiveControls,
  getNextVector,
  reportVector,
  allVectorsPassed,
} from "@atc/core";
import { CraftStatus, SeatType, BlackBoxEntryType, VectorStatus } from "@atc/types";

// Create a craft
const craft = createCraft({
  callsign: "ALPHA-1",
  branch: "feat/alpha-1",
  cargo: "Add user authentication",
  category: "feature",
  captain: { identifier: "agent-1", certifications: ["feature"] },
  flightPlan: [
    { name: "Design", acceptanceCriteria: "API schema defined", status: VectorStatus.Pending },
    { name: "Implement", acceptanceCriteria: "All endpoints working", status: VectorStatus.Pending },
  ],
});

// Transition to InFlight
const inFlight = transitionCraft(craft, CraftStatus.InFlight);

// Log a decision
const entry = createBlackBoxEntry("agent-1", BlackBoxEntryType.Decision, "Using JWT for auth tokens");
const updated = { ...inFlight, blackBox: appendToBlackBox(inFlight.blackBox, entry) };
```

## Dependencies

| Package | Purpose |
|---|---|
| `@atc/types` | Domain types and enums |
| `@atc/errors` | Error classes for rule violations |
| `@atc/validation` | Crew certification validation |

## Related Packages

- [`@atc/types`](../types/) — Type definitions consumed by this package
- [`@atc/errors`](../errors/) — Error classes thrown by this package
- [`@atc/validation`](../validation/) — Validation functions used during craft creation
- [`@atc/tower`](../tower/) — Merge coordination consuming craft state
- [`@atc/daemon`](../daemon/) — Long-running process that orchestrates core operations
