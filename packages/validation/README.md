# @atc/validation

Pure validation functions for certification checks, seat assignment rules, and permission enforcement. These functions implement the guard logic that ensures pilots are eligible for their seats and authorized for their actions.

## Installation

```bash
pnpm add @atc/validation
```

This is an internal workspace package (`workspace:*`).

## API Reference

### Certification

#### `isPilotCertified(pilot: Pilot, category: string): boolean`

Checks whether a pilot holds a certification for the given craft category. Matching is case-sensitive.

See `RULE-PILOT-2`.

```typescript
import { isPilotCertified } from "@atc/validation";

const pilot = { identifier: "agent-1", certifications: ["feature", "bugfix"] };
isPilotCertified(pilot, "feature"); // true
isPilotCertified(pilot, "refactor"); // false
```

### Seat Assignment

#### `isValidSeatAssignment(pilot: Pilot, seat: SeatType, craftCategory: string): boolean`

Checks whether a pilot can validly occupy the given seat. Returns `true` if the seat is Jumpseat (no certification required) or if the pilot is certified for the craft's category.

See `RULE-SEAT-2`, `RULE-SEAT-3`.

#### `validateSeatAssignment(pilot: Pilot, seat: SeatType, craftCategory: string): void`

Throws `SeatAssignmentError` if the pilot lacks the required certification for a non-jumpseat position.

See `RULE-SEAT-2`, `RULE-SEAT-3`.

#### `validateCraftCrew(captain: Pilot, firstOfficers: readonly Pilot[], craftCategory: string): void`

Validates the full crew composition: the captain and all first officers must be certified for the craft's category. The single-captain constraint (`RULE-SEAT-1`) is enforced structurally by the function signature.

Throws `SeatAssignmentError` if any crew member is not certified.

See `RULE-CRAFT-5`, `RULE-SEAT-1`, `RULE-SEAT-2`.

### Permissions

#### `canHoldControls(seat: SeatType): boolean`

Checks whether a pilot in the given seat is allowed to hold controls. Only Captain and FirstOfficer may hold controls.

See `RULE-CTRL-2`.

```typescript
import { canHoldControls } from "@atc/validation";
import { SeatType } from "@atc/types";

canHoldControls(SeatType.Captain);     // true
canHoldControls(SeatType.FirstOfficer); // true
canHoldControls(SeatType.Jumpseat);    // false
```

#### `canPerformAction(seat: SeatType, action: PilotAction): boolean`

Looks up whether a pilot in the given seat is permitted to perform the specified action, according to the `PERMISSIONS` matrix.

See `RULE-SEAT-1` through `RULE-SEAT-4`, `RULE-CTRL-2`, `RULE-BBOX-3`, `RULE-EMER-1`.

```typescript
import { canPerformAction } from "@atc/validation";
import { SeatType } from "@atc/types";

canPerformAction(SeatType.Captain, "declareEmergency");      // true
canPerformAction(SeatType.FirstOfficer, "declareEmergency"); // false
canPerformAction(SeatType.Jumpseat, "writeBlackBox");        // true
```

## Dependencies

| Package | Purpose |
|---|---|
| `@atc/types` | `Pilot`, `SeatType`, `PilotAction`, `PERMISSIONS` |
| `@atc/errors` | `SeatAssignmentError` |

## Related Packages

- [`@atc/types`](../types/) — Domain types and permissions matrix
- [`@atc/errors`](../errors/) — Error class thrown on invalid assignments
- [`@atc/core`](../core/) — Uses `validateCraftCrew` during craft creation
