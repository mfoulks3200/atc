# @atc/validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pure validation functions for pilot certification, seat assignment, and permission checks.

**Architecture:** Stateless, side-effect-free functions that validate ATC domain rules. Returns booleans for queries, throws domain errors for assertions. Consumed by @atc/core and @atc/tower.

**Tech Stack:** TypeScript 5.8, vitest, pnpm workspaces

---

## Task 1: Scaffold the `@atc/validation` package

Create the package skeleton with proper configuration, dependencies, and empty source files.

### 1a. Create `packages/validation/package.json`

```json
{
  "name": "@atc/validation",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc --build"
  },
  "dependencies": {
    "@atc/types": "workspace:*",
    "@atc/errors": "workspace:*"
  }
}
```

### 1b. Create `packages/validation/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [
    { "path": "../types" },
    { "path": "../errors" }
  ]
}
```

### 1c. Create empty source files

Create these files with placeholder exports so the package compiles:

**`packages/validation/src/index.ts`**

```typescript
export { isPilotCertified } from "./certification.js";
export {
  isValidSeatAssignment,
  validateSeatAssignment,
  validateCraftCrew,
} from "./seat.js";
export { canHoldControls, canPerformAction } from "./permissions.js";
```

**`packages/validation/src/certification.ts`**

```typescript
import type { Pilot } from "@atc/types";

/**
 * Checks whether a pilot holds a certification for the given craft category.
 *
 * @param pilot - The pilot to check.
 * @param category - The craft category to check certification for.
 * @returns `true` if the pilot's certifications include the category.
 * @see RULE-PILOT-2
 */
export function isPilotCertified(pilot: Pilot, category: string): boolean {
  return pilot.certifications.includes(category);
}
```

**`packages/validation/src/seat.ts`**

```typescript
// Placeholder — implemented in Task 3
export function isValidSeatAssignment(): boolean {
  return false;
}
export function validateSeatAssignment(): void {}
export function validateCraftCrew(): void {}
```

**`packages/validation/src/permissions.ts`**

```typescript
// Placeholder — implemented in Task 4
export function canHoldControls(): boolean {
  return false;
}
export function canPerformAction(): boolean {
  return false;
}
```

### 1d. Register the package in root `tsconfig.json`

Add a reference to the root `tsconfig.json` so `tsc --build` picks up the new package:

```json
{
  "references": [
    { "path": "packages/types" },
    { "path": "packages/core" },
    { "path": "packages/validation" }
  ]
}
```

### 1e. Install dependencies

```bash
pnpm install
```

### 1f. Verify the build compiles

```bash
pnpm run build
```

### Acceptance Criteria

- `packages/validation/` exists with `package.json`, `tsconfig.json`, and `src/index.ts`.
- `pnpm run build` succeeds with zero errors.
- The barrel export in `index.ts` re-exports from all three source modules.

---

## Task 2: `certification.ts` — `isPilotCertified` (TDD)

The simplest function in the package. A pure predicate over the pilot's certifications array.

### 2a. Write tests first: `packages/validation/src/certification.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import type { Pilot } from "@atc/types";
import { isPilotCertified } from "./certification.js";

describe("isPilotCertified", () => {
  const certifiedPilot: Pilot = {
    identifier: "pilot-1",
    certifications: ["Backend Engineering", "Frontend Engineering"],
  };

  const uncertifiedPilot: Pilot = {
    identifier: "pilot-2",
    certifications: [],
  };

  const singleCertPilot: Pilot = {
    identifier: "pilot-3",
    certifications: ["Infrastructure"],
  };

  it("returns true when pilot is certified for the category", () => {
    expect(isPilotCertified(certifiedPilot, "Backend Engineering")).toBe(true);
  });

  it("returns true for any matching certification in the list", () => {
    expect(isPilotCertified(certifiedPilot, "Frontend Engineering")).toBe(true);
  });

  it("returns false when pilot is not certified for the category", () => {
    expect(isPilotCertified(certifiedPilot, "Infrastructure")).toBe(false);
  });

  it("returns false when pilot has no certifications", () => {
    expect(isPilotCertified(uncertifiedPilot, "Backend Engineering")).toBe(false);
  });

  it("returns false for empty category string", () => {
    expect(isPilotCertified(certifiedPilot, "")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isPilotCertified(singleCertPilot, "infrastructure")).toBe(false);
    expect(isPilotCertified(singleCertPilot, "Infrastructure")).toBe(true);
  });
});
```

### 2b. Implement: `packages/validation/src/certification.ts`

```typescript
import type { Pilot } from "@atc/types";

/**
 * Checks whether a pilot holds a certification for the given craft category.
 *
 * A pilot is certified if their `certifications` array contains an exact match
 * for the given category string. Matching is case-sensitive.
 *
 * @param pilot - The pilot to check.
 * @param category - The craft category to check certification for.
 * @returns `true` if the pilot's certifications include the category.
 * @see RULE-PILOT-2
 */
export function isPilotCertified(pilot: Pilot, category: string): boolean {
  return pilot.certifications.includes(category);
}
```

### 2c. Run tests

```bash
pnpm run test -- --reporter verbose packages/validation/src/certification.test.ts
```

### Acceptance Criteria

- All 6 tests pass.
- `isPilotCertified` is a single-expression function with no branching.
- JSDoc references RULE-PILOT-2.

---

## Task 3: `seat.ts` — seat assignment and crew validation (TDD)

This file contains the three seat-related functions: `isValidSeatAssignment`, `validateSeatAssignment`, and `validateCraftCrew`. They enforce RULE-SEAT-1 through RULE-SEAT-3 and RULE-CRAFT-5.

### 3a. Write tests first: `packages/validation/src/seat.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import type { Pilot } from "@atc/types";
import { SeatType } from "@atc/types";
import {
  isValidSeatAssignment,
  validateSeatAssignment,
  validateCraftCrew,
} from "./seat.js";

// --- Test fixtures ---

const certifiedPilot: Pilot = {
  identifier: "ace",
  certifications: ["Backend Engineering", "Frontend Engineering"],
};

const uncertifiedPilot: Pilot = {
  identifier: "rookie",
  certifications: [],
};

const infraPilot: Pilot = {
  identifier: "ops",
  certifications: ["Infrastructure"],
};

const CATEGORY = "Backend Engineering";

// --- isValidSeatAssignment ---

describe("isValidSeatAssignment", () => {
  describe("Captain seat", () => {
    it("returns true when pilot is certified for the category", () => {
      expect(isValidSeatAssignment(certifiedPilot, SeatType.Captain, CATEGORY)).toBe(true);
    });

    it("returns false when pilot is not certified for the category", () => {
      expect(isValidSeatAssignment(uncertifiedPilot, SeatType.Captain, CATEGORY)).toBe(false);
    });

    it("returns false when pilot is certified for a different category", () => {
      expect(isValidSeatAssignment(infraPilot, SeatType.Captain, CATEGORY)).toBe(false);
    });
  });

  describe("FirstOfficer seat", () => {
    it("returns true when pilot is certified for the category", () => {
      expect(isValidSeatAssignment(certifiedPilot, SeatType.FirstOfficer, CATEGORY)).toBe(true);
    });

    it("returns false when pilot is not certified for the category", () => {
      expect(isValidSeatAssignment(uncertifiedPilot, SeatType.FirstOfficer, CATEGORY)).toBe(false);
    });
  });

  describe("Jumpseat", () => {
    it("returns true even when pilot is not certified", () => {
      expect(isValidSeatAssignment(uncertifiedPilot, SeatType.Jumpseat, CATEGORY)).toBe(true);
    });

    it("returns true when pilot is certified (certification not required)", () => {
      expect(isValidSeatAssignment(certifiedPilot, SeatType.Jumpseat, CATEGORY)).toBe(true);
    });

    it("returns true for pilot with empty certifications", () => {
      expect(isValidSeatAssignment(uncertifiedPilot, SeatType.Jumpseat, CATEGORY)).toBe(true);
    });
  });
});

// --- validateSeatAssignment ---

describe("validateSeatAssignment", () => {
  it("does not throw when assignment is valid", () => {
    expect(() =>
      validateSeatAssignment(certifiedPilot, SeatType.Captain, CATEGORY),
    ).not.toThrow();
  });

  it("does not throw for valid jumpseat assignment", () => {
    expect(() =>
      validateSeatAssignment(uncertifiedPilot, SeatType.Jumpseat, CATEGORY),
    ).not.toThrow();
  });

  it("throws SeatAssignmentError when uncertified pilot takes Captain seat", () => {
    expect(() =>
      validateSeatAssignment(uncertifiedPilot, SeatType.Captain, CATEGORY),
    ).toThrow();
  });

  it("throws SeatAssignmentError when uncertified pilot takes FirstOfficer seat", () => {
    expect(() =>
      validateSeatAssignment(uncertifiedPilot, SeatType.FirstOfficer, CATEGORY),
    ).toThrow();
  });

  it("thrown error has ruleId referencing RULE-SEAT-2", () => {
    try {
      validateSeatAssignment(uncertifiedPilot, SeatType.Captain, CATEGORY);
      expect.unreachable("should have thrown");
    } catch (error: unknown) {
      expect(error).toHaveProperty("ruleId", "RULE-SEAT-2");
    }
  });

  it("thrown error message includes pilot identifier and category", () => {
    try {
      validateSeatAssignment(uncertifiedPilot, SeatType.FirstOfficer, CATEGORY);
      expect.unreachable("should have thrown");
    } catch (error: unknown) {
      const message = (error as Error).message;
      expect(message).toContain("rookie");
      expect(message).toContain(CATEGORY);
    }
  });
});

// --- validateCraftCrew ---

describe("validateCraftCrew", () => {
  it("does not throw for a valid crew (certified captain, certified FOs)", () => {
    expect(() => validateCraftCrew(certifiedPilot, [certifiedPilot], CATEGORY)).not.toThrow();
  });

  it("does not throw for captain with no first officers", () => {
    expect(() => validateCraftCrew(certifiedPilot, [], CATEGORY)).not.toThrow();
  });

  it("throws when captain is not certified for category (RULE-SEAT-2)", () => {
    expect(() => validateCraftCrew(uncertifiedPilot, [], CATEGORY)).toThrow();
  });

  it("throws when any first officer is not certified (RULE-SEAT-2)", () => {
    expect(() =>
      validateCraftCrew(certifiedPilot, [certifiedPilot, uncertifiedPilot], CATEGORY),
    ).toThrow();
  });

  it("thrown error for uncertified FO includes the FO's identifier", () => {
    try {
      validateCraftCrew(certifiedPilot, [uncertifiedPilot], CATEGORY);
      expect.unreachable("should have thrown");
    } catch (error: unknown) {
      const message = (error as Error).message;
      expect(message).toContain("rookie");
    }
  });

  it("validates all first officers, not just the first one", () => {
    const secondUncertified: Pilot = {
      identifier: "also-rookie",
      certifications: [],
    };
    expect(() =>
      validateCraftCrew(certifiedPilot, [certifiedPilot, secondUncertified], CATEGORY),
    ).toThrow();
  });
});
```

### 3b. Implement: `packages/validation/src/seat.ts`

```typescript
import type { Pilot } from "@atc/types";
import { SeatType } from "@atc/types";
import { SeatAssignmentError } from "@atc/errors";
import { isPilotCertified } from "./certification.js";

/**
 * Checks whether a pilot can validly occupy the given seat on a craft of the
 * specified category. Returns `true` if:
 * - The seat is Jumpseat (no certification required), OR
 * - The pilot holds a certification for the craft's category.
 *
 * @param pilot - The pilot to validate.
 * @param seat - The seat being assigned.
 * @param craftCategory - The craft's category.
 * @returns Whether the assignment is valid.
 * @see RULE-SEAT-2, RULE-SEAT-3
 */
export function isValidSeatAssignment(
  pilot: Pilot,
  seat: SeatType,
  craftCategory: string,
): boolean {
  if (seat === SeatType.Jumpseat) {
    return true;
  }
  return isPilotCertified(pilot, craftCategory);
}

/**
 * Validates that a pilot can occupy the given seat on a craft of the specified
 * category. Throws a {@link SeatAssignmentError} if the pilot lacks the
 * required certification for a non-jumpseat position.
 *
 * @param pilot - The pilot to validate.
 * @param seat - The seat being assigned.
 * @param craftCategory - The craft's category.
 * @throws {SeatAssignmentError} If the pilot is not certified for the seat.
 * @see RULE-SEAT-2, RULE-SEAT-3
 */
export function validateSeatAssignment(
  pilot: Pilot,
  seat: SeatType,
  craftCategory: string,
): void {
  if (!isValidSeatAssignment(pilot, seat, craftCategory)) {
    throw new SeatAssignmentError(
      `Pilot "${pilot.identifier}" is not certified for category "${craftCategory}" ` +
        `and cannot occupy the ${seat} seat.`,
      "RULE-SEAT-2",
    );
  }
}

/**
 * Validates the crew composition of a craft. Ensures:
 * - The captain is certified for the craft's category (RULE-CRAFT-5, RULE-SEAT-2).
 * - All first officers are certified for the craft's category (RULE-SEAT-2).
 *
 * Note: RULE-SEAT-1 (exactly one captain) is enforced structurally — the function
 * accepts a single `captain` parameter, not a list.
 *
 * @param captain - The captain assigned to the craft.
 * @param firstOfficers - The first officers assigned to the craft.
 * @param craftCategory - The craft's category.
 * @throws {SeatAssignmentError} If the captain or any first officer is not certified.
 * @see RULE-CRAFT-5, RULE-SEAT-1, RULE-SEAT-2
 */
export function validateCraftCrew(
  captain: Pilot,
  firstOfficers: readonly Pilot[],
  craftCategory: string,
): void {
  validateSeatAssignment(captain, SeatType.Captain, craftCategory);

  for (const fo of firstOfficers) {
    validateSeatAssignment(fo, SeatType.FirstOfficer, craftCategory);
  }
}
```

### 3c. Run tests

```bash
pnpm run test -- --reporter verbose packages/validation/src/seat.test.ts
```

### Acceptance Criteria

- All 15 tests pass.
- `isValidSeatAssignment` delegates to `isPilotCertified` (no duplicated logic).
- `validateSeatAssignment` throws `SeatAssignmentError` with `ruleId: "RULE-SEAT-2"`.
- `validateCraftCrew` validates the captain and every first officer.
- JSDoc references the relevant `RULE-*` identifiers.

---

## Task 4: `permissions.ts` — controls and action permissions (TDD)

Two functions that query the PERMISSIONS matrix from `@atc/types`. Pure lookups, no throws.

### 4a. Write tests first: `packages/validation/src/permissions.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { SeatType } from "@atc/types";
import type { PilotAction } from "@atc/types";
import { canHoldControls, canPerformAction } from "./permissions.js";

// --- canHoldControls ---

describe("canHoldControls", () => {
  it("returns true for Captain", () => {
    expect(canHoldControls(SeatType.Captain)).toBe(true);
  });

  it("returns true for FirstOfficer", () => {
    expect(canHoldControls(SeatType.FirstOfficer)).toBe(true);
  });

  it("returns false for Jumpseat", () => {
    expect(canHoldControls(SeatType.Jumpseat)).toBe(false);
  });
});

// --- canPerformAction ---

describe("canPerformAction", () => {
  describe("Captain permissions", () => {
    it.each<[PilotAction, boolean]>([
      ["modifyCode", true],
      ["holdControls", true],
      ["writeBlackBox", true],
      ["fileVectorReport", true],
      ["declareEmergency", true],
      ["requestLandingClearance", true],
    ])("Captain can %s: %s", (action, expected) => {
      expect(canPerformAction(SeatType.Captain, action)).toBe(expected);
    });
  });

  describe("FirstOfficer permissions", () => {
    it.each<[PilotAction, boolean]>([
      ["modifyCode", true],
      ["holdControls", true],
      ["writeBlackBox", true],
      ["fileVectorReport", true],
      ["declareEmergency", false],
      ["requestLandingClearance", true],
    ])("FirstOfficer can %s: %s", (action, expected) => {
      expect(canPerformAction(SeatType.FirstOfficer, action)).toBe(expected);
    });
  });

  describe("Jumpseat permissions", () => {
    it.each<[PilotAction, boolean]>([
      ["modifyCode", false],
      ["holdControls", false],
      ["writeBlackBox", true],
      ["fileVectorReport", false],
      ["declareEmergency", false],
      ["requestLandingClearance", false],
    ])("Jumpseat can %s: %s", (action, expected) => {
      expect(canPerformAction(SeatType.Jumpseat, action)).toBe(expected);
    });
  });

  describe("cross-checks with canHoldControls", () => {
    it("canPerformAction(seat, 'holdControls') agrees with canHoldControls(seat)", () => {
      for (const seat of [SeatType.Captain, SeatType.FirstOfficer, SeatType.Jumpseat]) {
        expect(canPerformAction(seat, "holdControls")).toBe(canHoldControls(seat));
      }
    });
  });
});
```

### 4b. Implement: `packages/validation/src/permissions.ts`

```typescript
import type { PilotAction } from "@atc/types";
import { SeatType, PERMISSIONS } from "@atc/types";

/**
 * Checks whether a pilot in the given seat is allowed to hold controls.
 * Only Captain and FirstOfficer may hold controls; Jumpseat pilots may not.
 *
 * This is a convenience wrapper over the PERMISSIONS matrix for the
 * `holdControls` action.
 *
 * @param seat - The seat type to check.
 * @returns `true` if the seat permits holding controls.
 * @see RULE-CTRL-2
 */
export function canHoldControls(seat: SeatType): boolean {
  return PERMISSIONS[seat].holdControls;
}

/**
 * Looks up whether a pilot in the given seat is permitted to perform
 * the specified action, according to the PERMISSIONS matrix.
 *
 * @param seat - The seat type to check.
 * @param action - The action to look up.
 * @returns `true` if the seat permits the action.
 * @see RULE-SEAT-1 through RULE-SEAT-4, RULE-CTRL-2, RULE-BBOX-3, RULE-EMER-1
 */
export function canPerformAction(seat: SeatType, action: PilotAction): boolean {
  return PERMISSIONS[seat][action];
}
```

### 4c. Run tests

```bash
pnpm run test -- --reporter verbose packages/validation/src/permissions.test.ts
```

### Acceptance Criteria

- All 22 tests pass (3 for `canHoldControls`, 18 for `canPerformAction` via `it.each`, 1 cross-check).
- Both functions delegate to the `PERMISSIONS` constant from `@atc/types` (no hardcoded logic).
- `canHoldControls` is a thin wrapper, not a separate implementation.
- JSDoc references RULE-CTRL-2 and related rules.

---

## Task 5: Final barrel export, build, and full test suite

Wire up the final exports, verify everything compiles, and run the complete test suite.

### 5a. Finalize `packages/validation/src/index.ts`

This should already be correct from Task 1, but verify it matches:

```typescript
export { isPilotCertified } from "./certification.js";
export {
  isValidSeatAssignment,
  validateSeatAssignment,
  validateCraftCrew,
} from "./seat.js";
export { canHoldControls, canPerformAction } from "./permissions.js";
```

### 5b. Build the full workspace

```bash
pnpm run build
```

Zero type errors expected.

### 5c. Run the full test suite

```bash
pnpm run test
```

All tests across all packages pass.

### 5d. Run tests with coverage

```bash
pnpm run test -- --coverage
```

Verify `packages/validation/src/` files are at or above 90% coverage across statements, branches, functions, and lines.

### 5e. Lint and format

```bash
pnpm run format
pnpm run format:check
pnpm run lint
```

All clean, zero warnings.

### Acceptance Criteria

- `pnpm run build` succeeds with zero errors.
- `pnpm run test` passes with zero failures.
- Coverage is at or above 90% on all `packages/validation/src/` files.
- `pnpm run lint` and `pnpm run format:check` produce zero issues.
- Barrel export exposes exactly 6 functions: `isPilotCertified`, `isValidSeatAssignment`, `validateSeatAssignment`, `validateCraftCrew`, `canHoldControls`, `canPerformAction`.

---

## Summary

| Task | File(s) | Functions | Tests |
|------|---------|-----------|-------|
| 1 | Package scaffold | -- | -- |
| 2 | `certification.ts` | `isPilotCertified` | 6 |
| 3 | `seat.ts` | `isValidSeatAssignment`, `validateSeatAssignment`, `validateCraftCrew` | 15 |
| 4 | `permissions.ts` | `canHoldControls`, `canPerformAction` | 22 |
| 5 | Final integration | -- | Full suite |

**Total:** 6 exported functions, ~43 tests, 3 source files + barrel export.

### Dependency Graph

```
@atc/types (enums, interfaces, PERMISSIONS)
     |
     v
@atc/errors (SeatAssignmentError, ControlsError)
     |
     v
@atc/validation (this package)
```

### Rules Enforced

| Rule | Function | Behavior |
|------|----------|----------|
| RULE-PILOT-2 | `isPilotCertified` | Checks certifications array |
| RULE-SEAT-1 | `validateCraftCrew` | Structural (single captain param) |
| RULE-SEAT-2 | `isValidSeatAssignment`, `validateSeatAssignment`, `validateCraftCrew` | Captain/FO must be certified |
| RULE-SEAT-3 | `isValidSeatAssignment` | Jumpseat always valid |
| RULE-CRAFT-5 | `validateCraftCrew` | Captain required (param is non-optional) |
| RULE-CTRL-2 | `canHoldControls`, `canPerformAction` | Jumpseat cannot hold controls |
| RULE-BBOX-3 | `canPerformAction` | All seats can writeBlackBox |
| RULE-EMER-1 | `canPerformAction` | Only Captain can declareEmergency |
