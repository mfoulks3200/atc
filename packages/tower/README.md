# @atc/tower

Merge coordination for the ATC system. The Tower manages landing clearance requests, maintains a first-come-first-served merge queue, and handles emergency declarations. There is exactly one tower per repository.

## Installation

```bash
pnpm add @atc/tower
```

This is an internal workspace package (`workspace:*`).

## API Reference

### Types

#### `QueueEntry`

A craft waiting in the merge queue. See `RULE-TMRG-4`.

| Property | Type | Description |
|---|---|---|
| `craft` | `Craft` | The craft awaiting merge |
| `requestedAt` | `Date` | When the craft was added (used for FCFS ordering) |

#### `ClearanceResult`

Result of a landing clearance request. See `RULE-TOWER-2`, `RULE-TMRG-1`.

| Property | Type | Description |
|---|---|---|
| `granted` | `boolean` | Whether landing clearance was granted |
| `reason` | `string?` | If denied, the reason clearance was not granted |

#### `EmergencyReport`

Data provided to the origin airport when a craft is returned on emergency. See `RULE-ORIG-2`, `RULE-EMER-4`.

| Property | Type | Description |
|---|---|---|
| `callsign` | `string` | The craft's unique identifier |
| `cargo` | `string` | Description of the change and its scope |
| `flightPlan` | `FlightPlan` | The ordered sequence of vectors |
| `blackBox` | `readonly BlackBoxEntry[]` | The complete append-only event log |

### `Tower` Class

The centralized merge coordination agent. See `RULE-TOWER-1`.

#### `requestClearance(craft: Craft): ClearanceResult`

Requests landing clearance. Verifies all vectors in the flight plan have `Passed` status. If granted, the craft is automatically enqueued for merge.

See `RULE-TOWER-2`, `RULE-TMRG-1`, `RULE-TMRG-4`.

#### `enqueue(craft: Craft): void`

Adds a craft to the merge queue. Throws `TowerError` if the craft is already queued.

See `RULE-TMRG-4`.

#### `dequeue(callsign: string): Craft | undefined`

Removes a craft from the queue by callsign. Returns the removed craft, or `undefined` if not found.

#### `peek(): QueueEntry | undefined`

Returns the next craft in the queue without removing it (FCFS ordering).

See `RULE-TMRG-4`.

#### `queueSize: number` (getter)

The number of crafts currently in the merge queue.

#### `declareEmergency(craft: Craft, captainId: string, reason: string): EmergencyReport`

Declares an emergency for a craft. Only the captain may declare. Appends an `EmergencyDeclaration` entry to the black box, removes the craft from the queue if present, and returns an `EmergencyReport` for the origin airport.

Throws `EmergencyError` if `captainId` does not match the craft's captain.

See `RULE-EMER-1` through `RULE-EMER-4`, `RULE-ORIG-2`.

### Factory Function

#### `createTower(): Tower`

Creates a new Tower instance with an empty merge queue. See `RULE-TOWER-1`.

### Utility

#### `createEmergencyReport(craft: Craft): EmergencyReport`

Extracts callsign, cargo, flight plan, and black box into an immutable report for the origin airport.

See `RULE-ORIG-2`, `RULE-EMER-4`, `RULE-BBOX-4`.

## Usage

```typescript
import { createTower } from "@atc/tower";

const tower = createTower();

// Request landing clearance
const result = tower.requestClearance(craft);
if (result.granted) {
  console.log(`Craft ${craft.callsign} cleared to land (queue position: ${tower.queueSize})`);
} else {
  console.log(`Clearance denied: ${result.reason}`);
}

// Process the merge queue
const next = tower.peek();
if (next) {
  // Merge the craft's branch, then dequeue
  tower.dequeue(next.craft.callsign);
}

// Declare an emergency
const report = tower.declareEmergency(craft, "captain-1", "Repeated test failures after 3 go-arounds");
```

## Dependencies

| Package | Purpose |
|---|---|
| `@atc/types` | `Craft`, `FlightPlan`, `BlackBoxEntry`, `VectorStatus`, `BlackBoxEntryType` |
| `@atc/errors` | `TowerError`, `EmergencyError` |
| `@atc/core` | Core runtime functions |
| `@atc/checklist` | Checklist types |

## Related Packages

- [`@atc/core`](../core/) — Craft lifecycle management
- [`@atc/errors`](../errors/) — `TowerError` and `EmergencyError`
- [`@atc/daemon`](../daemon/) — Hosts the tower as part of the long-running process
