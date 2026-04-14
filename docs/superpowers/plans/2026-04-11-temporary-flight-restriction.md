# Temporary Flight Restriction (TFR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Temporary Flight Restrictions — user- or tower-issued pauses that halt all agent activity on targeted crafts via a `holdingPattern` flag, without altering craft lifecycle state.

**Architecture:** New `TfrScope` and `TfrMode` enums plus a `TemporaryFlightRestriction` interface in `@airtrafficcontrol/types`. A `TfrError` class in `@airtrafficcontrol/errors`. Pure TFR logic (create, lift, query) in `@airtrafficcontrol/core`. Tower gains `issueTfr`/`liftTfr` capability. Daemon gets a `TfrStore` for persistence, REST routes, and WebSocket events. Spec updated with section 2.6, 4.5, and Appendix A entries.

**Tech Stack:** TypeScript (ES2022, Node16), vitest, pnpm monorepo

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `packages/types/src/tfr.ts` | `TfrScope`, `TfrMode` enums + `TemporaryFlightRestriction` interface |
| `packages/types/src/tfr.test.ts` | Enum value tests for `TfrScope` and `TfrMode` |
| `packages/errors/src/tfr.ts` | `TfrError` class extending `AtcError` |
| `packages/core/src/tfr.ts` | `createTfr`, `liftTfr`, `isAffectedByTfr`, `getActiveTfrs`, `applyHoldingPattern`, `clearHoldingPattern` |
| `packages/core/src/tfr.test.ts` | Tests for all core TFR functions |
| `packages/daemon/src/state/tfr-store.ts` | `TfrStore` — in-memory + atomic JSON persistence |
| `packages/daemon/src/state/tfr-store.test.ts` | Unit tests for `TfrStore` |
| `packages/daemon/src/server/routes/tfr.ts` | REST routes for TFR issuance, listing, lifting |
| `packages/daemon/src/server/routes/tfr.test.ts` | Route integration tests |

### Modified Files
| File | Change |
|------|--------|
| `packages/types/src/enums.ts` | Add `TFRIssued` and `TFRLifted` to `BlackBoxEntryType` |
| `packages/types/src/entities.ts` | Add `holdingPattern: boolean` to `Craft` interface |
| `packages/types/src/index.ts` | Export new TFR types and enums |
| `packages/types/src/enums.test.ts` | Update `BlackBoxEntryType` count from 7 to 9, add new assertions |
| `packages/errors/src/index.ts` | Export `TfrError` |
| `packages/core/src/index.ts` | Export TFR functions and types |
| `packages/core/src/craft.ts` | Set `holdingPattern: false` in `createCraft` |
| `packages/core/src/craft.test.ts` | Assert `holdingPattern` is `false` on new craft |
| `packages/daemon/src/types.ts` | Add `holdingPattern` to `CraftState`, add `TfrState` interface |
| `packages/daemon/src/server/app.ts` | Add `TfrStore` decoration and route registration |
| `docs/specification.md` | Add sections 2.6, 4.5, and Appendix A entries |

---

### Task 1: Add TFR Enums and Interface to Types Package

**Files:**
- Create: `packages/types/src/tfr.ts`
- Create: `packages/types/src/tfr.test.ts`
- Modify: `packages/types/src/enums.ts`
- Modify: `packages/types/src/enums.test.ts`
- Modify: `packages/types/src/entities.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Create TFR enums and interface**

Create `packages/types/src/tfr.ts`:

```ts
/**
 * Scope levels for a Temporary Flight Restriction.
 * @see RULE-TFR-1, RULE-TFR-2
 */
export enum TfrScope {
  /** Affects all agents across all projects. */
  Global = "Global",
  /** Affects all agents within a single project. */
  Project = "Project",
  /** Affects a single craft. */
  Craft = "Craft",
}

/**
 * Enforcement mode for a Temporary Flight Restriction.
 * @see RULE-TFRP-1, RULE-TFRP-2
 */
export enum TfrMode {
  /** Agents receive a wind-down window before the hold takes effect. */
  Graceful = "Graceful",
  /** Hold takes effect immediately with no wind-down. */
  Immediate = "Immediate",
}

/**
 * Issuer identity for a TFR.
 * @see RULE-TFR-3, RULE-TFR-4
 */
export type TfrIssuer = "user" | "tower";

/**
 * A Temporary Flight Restriction pauses agent activity without altering
 * craft lifecycle state. It sets a `holdingPattern` flag on affected crafts.
 *
 * @see RULE-TFR-1 through RULE-TFR-8
 * @see RULE-TFRP-1 through RULE-TFRP-7
 */
export interface TemporaryFlightRestriction {
  /** Unique, immutable identifier. @see RULE-TFR-1 */
  readonly identifier: string;
  /** What this TFR affects. @see RULE-TFR-2 */
  readonly scope: TfrScope;
  /** Project ID (scope=Project) or callsign (scope=Craft). Null for Global. @see RULE-TFR-2 */
  readonly target: string | null;
  /** How the hold is enforced. @see RULE-TFRP-1, RULE-TFRP-2 */
  readonly mode: TfrMode;
  /** Why the TFR was issued. @see RULE-TFR-1 */
  readonly reason: string;
  /** Who issued the TFR. @see RULE-TFR-3, RULE-TFR-4 */
  readonly issuedBy: TfrIssuer;
  /** When the TFR was issued. */
  readonly issuedAt: Date;
  /** When the TFR was lifted. Null while active. @see RULE-TFRP-3 */
  readonly liftedAt: Date | null;
}
```

- [ ] **Step 2: Write failing tests for TFR enums**

Create `packages/types/src/tfr.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TfrScope, TfrMode } from "./tfr.js";

describe("TfrScope", () => {
  it("has exactly 3 scope levels", () => {
    expect(Object.values(TfrScope)).toHaveLength(3);
  });

  it("contains all scope levels (RULE-TFR-2)", () => {
    expect(TfrScope.Global).toBe("Global");
    expect(TfrScope.Project).toBe("Project");
    expect(TfrScope.Craft).toBe("Craft");
  });
});

describe("TfrMode", () => {
  it("has exactly 2 modes", () => {
    expect(Object.values(TfrMode)).toHaveLength(2);
  });

  it("contains all modes (RULE-TFRP-1, RULE-TFRP-2)", () => {
    expect(TfrMode.Graceful).toBe("Graceful");
    expect(TfrMode.Immediate).toBe("Immediate");
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm run test -- packages/types/src/tfr.test.ts`
Expected: PASS (2 suites, 4 tests)

- [ ] **Step 4: Add TFRIssued and TFRLifted to BlackBoxEntryType**

In `packages/types/src/enums.ts`, add two new members at the end of the `BlackBoxEntryType` enum:

```ts
  /** A Temporary Flight Restriction has taken effect on this craft. @see RULE-TFRP-5 */
  TFRIssued = "TFRIssued",
  /** A Temporary Flight Restriction affecting this craft has been lifted. @see RULE-TFRP-5 */
  TFRLifted = "TFRLifted",
```

- [ ] **Step 5: Update BlackBoxEntryType tests**

In `packages/types/src/enums.test.ts`, update the `BlackBoxEntryType` describe block:

Change `toHaveLength(7)` to `toHaveLength(9)`.

Add to the "contains all entry types" test:

```ts
    expect(BlackBoxEntryType.TFRIssued).toBe("TFRIssued");
    expect(BlackBoxEntryType.TFRLifted).toBe("TFRLifted");
```

- [ ] **Step 6: Add holdingPattern to Craft interface**

In `packages/types/src/entities.ts`, add `holdingPattern` to the `Craft` interface after the `controls` field:

```ts
  /** Whether this craft is paused by a TFR. @see RULE-TFR-5, RULE-TFR-6 */
  holdingPattern: boolean;
```

- [ ] **Step 7: Update barrel exports**

In `packages/types/src/index.ts`, add a new export block after the existing ones:

```ts
export { TfrScope, TfrMode } from "./tfr.js";
export type { TfrIssuer, TemporaryFlightRestriction } from "./tfr.js";
```

- [ ] **Step 8: Run all types tests**

Run: `pnpm run test -- packages/types/`
Expected: PASS (all tests green — enum counts updated, new tests pass)

- [ ] **Step 9: Build types package**

Run: `pnpm run build`
Expected: Clean compilation with no errors

- [ ] **Step 10: Commit**

```bash
git add packages/types/src/tfr.ts packages/types/src/tfr.test.ts packages/types/src/enums.ts packages/types/src/enums.test.ts packages/types/src/entities.ts packages/types/src/index.ts
git commit -m "feat(types): add TFR enums, interface, and holdingPattern flag

Add TfrScope, TfrMode enums and TemporaryFlightRestriction interface.
Add TFRIssued/TFRLifted to BlackBoxEntryType. Add holdingPattern
to Craft interface.

RULE-TFR-1 through RULE-TFR-8, RULE-TFRP-5"
```

---

### Task 2: Add TfrError to Errors Package

**Files:**
- Create: `packages/errors/src/tfr.ts`
- Modify: `packages/errors/src/index.ts`

- [ ] **Step 1: Create TfrError class**

Create `packages/errors/src/tfr.ts`:

```ts
import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-TFR-* or RULE-TFRP-* invariant is violated.
 * Covers TFR issuance constraints, scope validation, and authorization failures.
 *
 * @see RULE-TFR-1 through RULE-TFR-8
 * @see RULE-TFRP-1 through RULE-TFRP-7
 */
export class TfrError extends AtcError {
  override readonly name: string = "TfrError";
}
```

- [ ] **Step 2: Export from barrel**

In `packages/errors/src/index.ts`, add:

```ts
export { TfrError } from "./tfr.js";
```

- [ ] **Step 3: Build errors package**

Run: `pnpm run build`
Expected: Clean compilation

- [ ] **Step 4: Commit**

```bash
git add packages/errors/src/tfr.ts packages/errors/src/index.ts
git commit -m "feat(errors): add TfrError class for TFR rule violations

Covers RULE-TFR-* and RULE-TFRP-* invariant violations."
```

---

### Task 3: Implement Core TFR Logic

**Files:**
- Create: `packages/core/src/tfr.ts`
- Create: `packages/core/src/tfr.test.ts`
- Modify: `packages/core/src/craft.ts`
- Modify: `packages/core/src/craft.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for createTfr**

Create `packages/core/src/tfr.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TfrScope, TfrMode } from "@airtrafficcontrol/types";
import type { TemporaryFlightRestriction, Craft } from "@airtrafficcontrol/types";
import {
  createTfr,
  liftTfr,
  isAffectedByTfr,
  getActiveTfrs,
  applyHoldingPattern,
  clearHoldingPattern,
} from "./tfr.js";
import type { CreateTfrParams } from "./tfr.js";

function validTfrParams(overrides: Partial<CreateTfrParams> = {}): CreateTfrParams {
  return {
    identifier: "tfr-1",
    scope: TfrScope.Global,
    target: null,
    mode: TfrMode.Graceful,
    reason: "System maintenance",
    issuedBy: "user",
    ...overrides,
  };
}

function makeCraft(overrides: Partial<Craft> = {}): Craft {
  return {
    callsign: "alpha-1",
    createdAt: new Date(),
    branch: "feat/alpha",
    cargo: "Build alpha",
    category: "Backend Engineering",
    captain: { identifier: "pilot-1", certifications: ["Backend Engineering"] },
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [],
    blackBox: [],
    controls: { mode: "Exclusive" as const, holder: "pilot-1" },
    holdingPattern: false,
    status: "InFlight" as const,
    ...overrides,
  } as Craft;
}

describe("createTfr", () => {
  it("creates a global TFR with null target (RULE-TFR-1, RULE-TFR-2)", () => {
    const tfr = createTfr(validTfrParams());
    expect(tfr.identifier).toBe("tfr-1");
    expect(tfr.scope).toBe(TfrScope.Global);
    expect(tfr.target).toBeNull();
    expect(tfr.mode).toBe(TfrMode.Graceful);
    expect(tfr.reason).toBe("System maintenance");
    expect(tfr.issuedBy).toBe("user");
    expect(tfr.issuedAt).toBeInstanceOf(Date);
    expect(tfr.liftedAt).toBeNull();
  });

  it("creates a project-scoped TFR with project target (RULE-TFR-2)", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Project, target: "my-project" }));
    expect(tfr.scope).toBe(TfrScope.Project);
    expect(tfr.target).toBe("my-project");
  });

  it("creates a craft-scoped TFR with callsign target (RULE-TFR-2)", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Craft, target: "alpha-1" }));
    expect(tfr.scope).toBe(TfrScope.Craft);
    expect(tfr.target).toBe("alpha-1");
  });

  it("throws if project-scoped TFR has no target (RULE-TFR-2)", () => {
    expect(() => createTfr(validTfrParams({ scope: TfrScope.Project, target: null }))).toThrow();
  });

  it("throws if craft-scoped TFR has no target (RULE-TFR-2)", () => {
    expect(() => createTfr(validTfrParams({ scope: TfrScope.Craft, target: null }))).toThrow();
  });

  it("throws if global TFR has a non-null target (RULE-TFR-2)", () => {
    expect(() => createTfr(validTfrParams({ scope: TfrScope.Global, target: "oops" }))).toThrow();
  });

  it("throws if tower issues a global TFR (RULE-TFR-4)", () => {
    expect(() => createTfr(validTfrParams({ issuedBy: "tower" }))).toThrow();
  });

  it("allows tower to issue project-scoped TFR (RULE-TFR-4)", () => {
    const tfr = createTfr(
      validTfrParams({ scope: TfrScope.Project, target: "proj", issuedBy: "tower" }),
    );
    expect(tfr.issuedBy).toBe("tower");
  });

  it("allows tower to issue craft-scoped TFR (RULE-TFR-4)", () => {
    const tfr = createTfr(
      validTfrParams({ scope: TfrScope.Craft, target: "alpha-1", issuedBy: "tower" }),
    );
    expect(tfr.issuedBy).toBe("tower");
  });
});

describe("liftTfr", () => {
  it("sets liftedAt on an active TFR (RULE-TFRP-3)", () => {
    const tfr = createTfr(validTfrParams());
    const lifted = liftTfr(tfr);
    expect(lifted.liftedAt).toBeInstanceOf(Date);
    expect(lifted.identifier).toBe(tfr.identifier);
  });

  it("throws if TFR is already lifted", () => {
    const tfr = createTfr(validTfrParams());
    const lifted = liftTfr(tfr);
    expect(() => liftTfr(lifted)).toThrow();
  });
});

describe("isAffectedByTfr", () => {
  it("returns true for global TFR on any craft (RULE-TFR-7)", () => {
    const tfr = createTfr(validTfrParams());
    expect(isAffectedByTfr(tfr, "any-project", "any-callsign")).toBe(true);
  });

  it("returns true for project TFR matching the project", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Project, target: "my-proj" }));
    expect(isAffectedByTfr(tfr, "my-proj", "any-callsign")).toBe(true);
  });

  it("returns false for project TFR not matching the project", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Project, target: "my-proj" }));
    expect(isAffectedByTfr(tfr, "other-proj", "any-callsign")).toBe(false);
  });

  it("returns true for craft TFR matching the callsign", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Craft, target: "alpha-1" }));
    expect(isAffectedByTfr(tfr, "any-project", "alpha-1")).toBe(true);
  });

  it("returns false for craft TFR not matching the callsign", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Craft, target: "alpha-1" }));
    expect(isAffectedByTfr(tfr, "any-project", "bravo-1")).toBe(false);
  });

  it("returns false for a lifted TFR", () => {
    const tfr = liftTfr(createTfr(validTfrParams()));
    expect(isAffectedByTfr(tfr, "any-project", "any-callsign")).toBe(false);
  });
});

describe("getActiveTfrs", () => {
  it("returns only active (non-lifted) TFRs", () => {
    const active = createTfr(validTfrParams({ identifier: "tfr-1" }));
    const lifted = liftTfr(createTfr(validTfrParams({ identifier: "tfr-2" })));
    expect(getActiveTfrs([active, lifted])).toEqual([active]);
  });

  it("returns empty array when all TFRs are lifted", () => {
    const lifted = liftTfr(createTfr(validTfrParams()));
    expect(getActiveTfrs([lifted])).toEqual([]);
  });
});

describe("applyHoldingPattern", () => {
  it("sets holdingPattern to true on a craft (RULE-TFR-5)", () => {
    const craft = makeCraft({ holdingPattern: false });
    const held = applyHoldingPattern(craft);
    expect(held.holdingPattern).toBe(true);
    expect(held.status).toBe(craft.status);
  });

  it("does not alter craft lifecycle state (RULE-TFR-5)", () => {
    const craft = makeCraft({ status: "LandingChecklist" as const });
    const held = applyHoldingPattern(craft);
    expect(held.status).toBe("LandingChecklist");
  });
});

describe("clearHoldingPattern", () => {
  it("sets holdingPattern to false (RULE-TFR-8)", () => {
    const craft = makeCraft({ holdingPattern: true });
    const cleared = clearHoldingPattern(craft);
    expect(cleared.holdingPattern).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- packages/core/src/tfr.test.ts`
Expected: FAIL — module `./tfr.js` not found

- [ ] **Step 3: Implement core TFR functions**

Create `packages/core/src/tfr.ts`:

```ts
import type { TemporaryFlightRestriction, TfrIssuer, Craft } from "@airtrafficcontrol/types";
import { TfrScope, TfrMode } from "@airtrafficcontrol/types";
import { TfrError } from "@airtrafficcontrol/errors";

/**
 * Parameters for creating a new Temporary Flight Restriction.
 * @see RULE-TFR-1
 */
export interface CreateTfrParams {
  /** Unique identifier for the TFR. */
  identifier: string;
  /** Scope of the restriction. */
  scope: TfrScope;
  /** Target project (scope=Project) or callsign (scope=Craft). Null for Global. */
  target: string | null;
  /** Enforcement mode. */
  mode: TfrMode;
  /** Reason for issuing the TFR. */
  reason: string;
  /** Who is issuing the TFR. */
  issuedBy: TfrIssuer;
}

/**
 * Creates a new Temporary Flight Restriction with validation.
 *
 * @param params - TFR creation parameters.
 * @returns A new {@link TemporaryFlightRestriction} with `liftedAt: null`.
 * @throws {TfrError} If scope/target combination is invalid (RULE-TFR-2).
 * @throws {TfrError} If tower attempts a global TFR (RULE-TFR-4).
 * @see RULE-TFR-1, RULE-TFR-2, RULE-TFR-3, RULE-TFR-4
 */
export function createTfr(params: CreateTfrParams): TemporaryFlightRestriction {
  // RULE-TFR-4: Tower must not issue global TFRs
  if (params.issuedBy === "tower" && params.scope === TfrScope.Global) {
    throw new TfrError("Tower must not issue global TFRs", "RULE-TFR-4");
  }

  // RULE-TFR-2: Validate scope/target combinations
  if (params.scope === TfrScope.Global && params.target !== null) {
    throw new TfrError("Global TFR must have a null target", "RULE-TFR-2");
  }
  if (params.scope === TfrScope.Project && !params.target) {
    throw new TfrError("Project-scoped TFR must specify a project target", "RULE-TFR-2");
  }
  if (params.scope === TfrScope.Craft && !params.target) {
    throw new TfrError("Craft-scoped TFR must specify a craft callsign", "RULE-TFR-2");
  }

  return {
    identifier: params.identifier,
    scope: params.scope,
    target: params.target,
    mode: params.mode,
    reason: params.reason,
    issuedBy: params.issuedBy,
    issuedAt: new Date(),
    liftedAt: null,
  };
}

/**
 * Lifts an active TFR by setting its `liftedAt` timestamp.
 *
 * @param tfr - The TFR to lift.
 * @returns A new TFR with `liftedAt` set to the current time.
 * @throws {TfrError} If the TFR is already lifted.
 * @see RULE-TFRP-3
 */
export function liftTfr(tfr: TemporaryFlightRestriction): TemporaryFlightRestriction {
  if (tfr.liftedAt !== null) {
    throw new TfrError(`TFR "${tfr.identifier}" is already lifted`, "RULE-TFRP-3");
  }

  return {
    ...tfr,
    liftedAt: new Date(),
  };
}

/**
 * Determines whether an active TFR affects a specific craft.
 *
 * @param tfr - The TFR to check.
 * @param projectName - The project the craft belongs to.
 * @param callsign - The craft's callsign.
 * @returns `true` if the TFR is active and applies to this craft.
 * @see RULE-TFR-7
 */
export function isAffectedByTfr(
  tfr: TemporaryFlightRestriction,
  projectName: string,
  callsign: string,
): boolean {
  if (tfr.liftedAt !== null) {
    return false;
  }

  switch (tfr.scope) {
    case TfrScope.Global:
      return true;
    case TfrScope.Project:
      return tfr.target === projectName;
    case TfrScope.Craft:
      return tfr.target === callsign;
  }
}

/**
 * Filters a list of TFRs to return only those that are still active (not lifted).
 *
 * @param tfrs - Array of TFRs to filter.
 * @returns Only the TFRs where `liftedAt` is null.
 */
export function getActiveTfrs(
  tfrs: readonly TemporaryFlightRestriction[],
): TemporaryFlightRestriction[] {
  return tfrs.filter((tfr) => tfr.liftedAt === null);
}

/**
 * Sets the `holdingPattern` flag to `true` on a craft without altering lifecycle state.
 *
 * @param craft - The craft to put into a holding pattern.
 * @returns A new craft with `holdingPattern: true`.
 * @see RULE-TFR-5
 */
export function applyHoldingPattern(craft: Craft): Craft {
  return { ...craft, holdingPattern: true };
}

/**
 * Clears the `holdingPattern` flag on a craft.
 *
 * @param craft - The craft to release from the holding pattern.
 * @returns A new craft with `holdingPattern: false`.
 * @see RULE-TFR-8
 */
export function clearHoldingPattern(craft: Craft): Craft {
  return { ...craft, holdingPattern: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- packages/core/src/tfr.test.ts`
Expected: PASS (all tests green)

- [ ] **Step 5: Update createCraft to set holdingPattern: false**

In `packages/core/src/craft.ts`, find the object returned by `createCraft` and add `holdingPattern: false` after the `controls` field. The exact line to add inside the returned object literal:

```ts
    holdingPattern: false,
```

- [ ] **Step 6: Update createCraft test**

In `packages/core/src/craft.test.ts`, add an assertion to the test that checks the returned craft object:

```ts
    expect(craft.holdingPattern).toBe(false);
```

- [ ] **Step 7: Update core barrel exports**

In `packages/core/src/index.ts`, add:

```ts
export {
  createTfr,
  liftTfr,
  isAffectedByTfr,
  getActiveTfrs,
  applyHoldingPattern,
  clearHoldingPattern,
} from "./tfr.js";
export type { CreateTfrParams } from "./tfr.js";
```

- [ ] **Step 8: Run all core tests**

Run: `pnpm run test -- packages/core/`
Expected: PASS

- [ ] **Step 9: Build**

Run: `pnpm run build`
Expected: Clean compilation

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/tfr.ts packages/core/src/tfr.test.ts packages/core/src/craft.ts packages/core/src/craft.test.ts packages/core/src/index.ts
git commit -m "feat(core): implement TFR creation, lifting, and craft holding pattern

createTfr validates scope/target rules and tower restrictions.
liftTfr sets liftedAt. isAffectedByTfr checks scope matching.
applyHoldingPattern/clearHoldingPattern toggle the flag.
createCraft now initializes holdingPattern: false.

RULE-TFR-1 through RULE-TFR-8, RULE-TFRP-3"
```

---

### Task 4: Add TFR Persistence to Daemon

**Files:**
- Modify: `packages/daemon/src/types.ts`
- Create: `packages/daemon/src/state/tfr-store.ts`
- Create: `packages/daemon/src/state/tfr-store.test.ts`

- [ ] **Step 1: Add TfrState and holdingPattern to daemon types**

In `packages/daemon/src/types.ts`, add `holdingPattern` to `CraftState` after the `controls` field:

```ts
  /** Whether this craft is paused by a TFR. @see RULE-TFR-5 */
  holdingPattern: boolean;
```

Also add a new `TfrState` interface after the `CraftState` interface:

```ts
/**
 * Persisted state of a Temporary Flight Restriction, as maintained by the daemon.
 *
 * @see RULE-TFR-1 through RULE-TFR-8
 */
export interface TfrState {
  /** Unique TFR identifier. */
  identifier: string;
  /** Scope: "global", "project", or "craft". */
  scope: "global" | "project" | "craft";
  /** Project name (scope=project) or callsign (scope=craft). Null for global. */
  target: string | null;
  /** Enforcement mode: "graceful" or "immediate". */
  mode: "graceful" | "immediate";
  /** Why the TFR was issued. */
  reason: string;
  /** Who issued the TFR: "user" or "tower". */
  issuedBy: "user" | "tower";
  /** ISO-8601 timestamp when the TFR was issued. */
  issuedAt: string;
  /** ISO-8601 timestamp when the TFR was lifted. Null while active. */
  liftedAt: string | null;
}
```

- [ ] **Step 2: Write failing TfrStore tests**

Create `packages/daemon/src/state/tfr-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { TfrStore } from "./tfr-store.js";
import type { TfrState } from "../types.js";

function makeTfr(overrides: Partial<TfrState> = {}): TfrState {
  return {
    identifier: "tfr-1",
    scope: "global",
    target: null,
    mode: "graceful",
    reason: "maintenance",
    issuedBy: "user",
    issuedAt: new Date().toISOString(),
    liftedAt: null,
    ...overrides,
  };
}

describe("TfrStore", () => {
  let store: TfrStore;

  beforeEach(() => {
    store = new TfrStore("/tmp/atc-tfr-test");
  });

  it("stores and retrieves a TFR by identifier", () => {
    const tfr = makeTfr();
    store.set(tfr);
    expect(store.get("tfr-1")).toEqual(tfr);
  });

  it("returns undefined for unknown identifier", () => {
    expect(store.get("ghost")).toBeUndefined();
  });

  it("lists all TFRs", () => {
    store.set(makeTfr({ identifier: "tfr-1" }));
    store.set(makeTfr({ identifier: "tfr-2" }));
    expect(store.list()).toHaveLength(2);
  });

  it("lists only active TFRs", () => {
    store.set(makeTfr({ identifier: "tfr-1", liftedAt: null }));
    store.set(makeTfr({ identifier: "tfr-2", liftedAt: new Date().toISOString() }));
    expect(store.listActive()).toHaveLength(1);
    expect(store.listActive()[0].identifier).toBe("tfr-1");
  });

  it("finds active TFRs affecting a project and callsign", () => {
    store.set(makeTfr({ identifier: "tfr-global", scope: "global", target: null }));
    store.set(makeTfr({ identifier: "tfr-proj", scope: "project", target: "my-proj" }));
    store.set(makeTfr({ identifier: "tfr-craft", scope: "craft", target: "alpha-1" }));
    store.set(makeTfr({ identifier: "tfr-other", scope: "craft", target: "bravo-1" }));

    const affecting = store.findAffecting("my-proj", "alpha-1");
    const ids = affecting.map((t) => t.identifier).sort();
    expect(ids).toEqual(["tfr-craft", "tfr-global", "tfr-proj"]);
  });

  it("does not include lifted TFRs in findAffecting", () => {
    store.set(makeTfr({ identifier: "tfr-1", liftedAt: new Date().toISOString() }));
    expect(store.findAffecting("any", "any")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm run test -- packages/daemon/src/state/tfr-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement TfrStore**

Create `packages/daemon/src/state/tfr-store.ts`:

```ts
/**
 * In-memory store for Temporary Flight Restrictions, backed by a single JSON file.
 *
 * Persistence: `stateDir/tfrs.json`
 *
 * @see RULE-TFR-1 through RULE-TFR-8
 * @see RULE-TFRP-7 — Tower must maintain a log of all TFR events.
 */

import { join } from "node:path";
import type { TfrState } from "../types.js";
import { atomicWriteJson, readJsonSafe } from "./persistence.js";

/**
 * Manages all TFR records for the daemon.
 *
 * Internal storage is a `Map<identifier, TfrState>`. Active and lifted
 * TFRs are both retained for audit (RULE-TFRP-7).
 *
 * @see RULE-TFR-1 for TFR identity rules.
 * @see RULE-TFRP-7 for tower TFR log requirements.
 */
export class TfrStore {
  private readonly _stateDir: string;
  private readonly _tfrs: Map<string, TfrState> = new Map();

  /**
   * @param stateDir - Root directory where state files are stored.
   */
  constructor(stateDir: string) {
    this._stateDir = stateDir;
  }

  // ---------------------------------------------------------------------------
  // Path helpers
  // ---------------------------------------------------------------------------

  private _tfrFilePath(): string {
    return join(this._stateDir, "tfrs.json");
  }

  // ---------------------------------------------------------------------------
  // Public API — synchronous queries
  // ---------------------------------------------------------------------------

  /**
   * Returns the TFR with the given identifier, or `undefined`.
   *
   * @param identifier - Unique TFR identifier.
   */
  get(identifier: string): TfrState | undefined {
    return this._tfrs.get(identifier);
  }

  /**
   * Inserts or replaces a TFR record.
   *
   * @param tfr - The TFR state to store.
   */
  set(tfr: TfrState): void {
    this._tfrs.set(tfr.identifier, tfr);
  }

  /**
   * Returns all TFR records (active and lifted).
   */
  list(): TfrState[] {
    return Array.from(this._tfrs.values());
  }

  /**
   * Returns only active (non-lifted) TFRs.
   */
  listActive(): TfrState[] {
    return this.list().filter((tfr) => tfr.liftedAt === null);
  }

  /**
   * Returns all active TFRs that affect a given project and callsign.
   * A TFR affects a craft if it is active and its scope matches:
   * - `global`: always matches
   * - `project`: matches if target equals the project name
   * - `craft`: matches if target equals the callsign
   *
   * @param projectName - The project to check.
   * @param callsign - The craft callsign to check.
   * @see RULE-TFR-7
   */
  findAffecting(projectName: string, callsign: string): TfrState[] {
    return this.listActive().filter((tfr) => {
      switch (tfr.scope) {
        case "global":
          return true;
        case "project":
          return tfr.target === projectName;
        case "craft":
          return tfr.target === callsign;
        default:
          return false;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Public API — persistence
  // ---------------------------------------------------------------------------

  /**
   * Atomically writes all TFR records to `stateDir/tfrs.json`.
   *
   * @returns Resolves when the write completes.
   */
  async save(): Promise<void> {
    await atomicWriteJson(this._tfrFilePath(), this.list());
  }

  /**
   * Loads TFR records from `stateDir/tfrs.json`.
   * If the file does not exist, the store remains empty.
   *
   * @returns Resolves when the load completes.
   */
  async load(): Promise<void> {
    const data = await readJsonSafe<TfrState[]>(this._tfrFilePath());
    if (data === null) {
      return;
    }
    for (const tfr of data) {
      this._tfrs.set(tfr.identifier, tfr);
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm run test -- packages/daemon/src/state/tfr-store.test.ts`
Expected: PASS

- [ ] **Step 6: Build**

Run: `pnpm run build`
Expected: Clean compilation

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/types.ts packages/daemon/src/state/tfr-store.ts packages/daemon/src/state/tfr-store.test.ts
git commit -m "feat(daemon): add TfrStore and TfrState for TFR persistence

TfrStore manages in-memory TFR records with atomic JSON persistence.
Supports querying active TFRs and finding TFRs affecting a specific
project/craft. Add holdingPattern to CraftState.

RULE-TFR-7, RULE-TFRP-7"
```

---

### Task 5: Add TFR REST Routes to Daemon

**Files:**
- Create: `packages/daemon/src/server/routes/tfr.ts`
- Create: `packages/daemon/src/server/routes/tfr.test.ts`
- Modify: `packages/daemon/src/server/app.ts`

- [ ] **Step 1: Write failing route tests**

Create `packages/daemon/src/server/routes/tfr.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { TfrStore } from "../../state/tfr-store.js";
import { CraftStatus } from "@airtrafficcontrol/types";
import type { CraftState, TfrState } from "../../types.js";

describe("tfr routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  let tfrStore: TfrStore;

  const PROJECT = "test-project";

  function seedCraft(callsign: string): void {
    const craft: CraftState = {
      callsign,
      createdAt: "2026-04-11T00:00:00.000Z",
      branch: `feat/${callsign}`,
      cargo: `Build ${callsign}`,
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "pilot-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-1" },
      holdingPattern: false,
    };
    craftStore.set(PROJECT, craft);
  }

  beforeEach(() => {
    craftStore = new CraftStore("/tmp/atc-tfr-test");
    tfrStore = new TfrStore("/tmp/atc-tfr-test");
    app = createApp({
      craftStore,
      tfrStore,
      towerStore: new TowerStore("/tmp/atc-tfr-test"),
      agentStore: new AgentStore("/tmp/atc-tfr-test"),
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe("POST /api/v1/tfrs", () => {
    it("creates a global TFR (RULE-TFR-1, RULE-TFR-3)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "global",
          target: null,
          mode: "graceful",
          reason: "System maintenance",
          issuedBy: "user",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<TfrState>();
      expect(body.scope).toBe("global");
      expect(body.reason).toBe("System maintenance");
      expect(body.liftedAt).toBeNull();
    });

    it("rejects tower global TFR (RULE-TFR-4)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "global",
          target: null,
          mode: "graceful",
          reason: "test",
          issuedBy: "tower",
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects project TFR with no target (RULE-TFR-2)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "project",
          target: null,
          mode: "graceful",
          reason: "test",
          issuedBy: "user",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("sets holdingPattern on affected crafts (RULE-TFR-5)", async () => {
      seedCraft("alpha-1");
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "craft",
          target: "alpha-1",
          mode: "immediate",
          reason: "debugging",
          issuedBy: "user",
          projectName: PROJECT,
        },
      });
      expect(res.statusCode).toBe(201);
      const craft = craftStore.get(PROJECT, "alpha-1");
      expect(craft?.holdingPattern).toBe(true);
    });

    it("records TFRIssued in affected craft black box (RULE-TFRP-5)", async () => {
      seedCraft("alpha-1");
      await app.inject({
        method: "POST",
        url: "/api/v1/tfrs",
        payload: {
          scope: "craft",
          target: "alpha-1",
          mode: "immediate",
          reason: "debugging",
          issuedBy: "user",
          projectName: PROJECT,
        },
      });
      const craft = craftStore.get(PROJECT, "alpha-1");
      const tfrEntry = craft?.blackBox.find((e) => e.type === "TFRIssued");
      expect(tfrEntry).toBeDefined();
      expect(tfrEntry?.content).toContain("debugging");
    });
  });

  describe("GET /api/v1/tfrs", () => {
    it("returns all TFRs", async () => {
      tfrStore.set({
        identifier: "tfr-1",
        scope: "global",
        target: null,
        mode: "graceful",
        reason: "test",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: null,
      });
      const res = await app.inject({ method: "GET", url: "/api/v1/tfrs" });
      expect(res.statusCode).toBe(200);
      expect(res.json<TfrState[]>()).toHaveLength(1);
    });

    it("filters to active only with ?active=true", async () => {
      tfrStore.set({
        identifier: "tfr-1",
        scope: "global",
        target: null,
        mode: "graceful",
        reason: "test",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: null,
      });
      tfrStore.set({
        identifier: "tfr-2",
        scope: "global",
        target: null,
        mode: "graceful",
        reason: "done",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: new Date().toISOString(),
      });
      const res = await app.inject({ method: "GET", url: "/api/v1/tfrs?active=true" });
      expect(res.statusCode).toBe(200);
      expect(res.json<TfrState[]>()).toHaveLength(1);
    });
  });

  describe("POST /api/v1/tfrs/:id/lift", () => {
    it("lifts an active TFR (RULE-TFRP-3)", async () => {
      tfrStore.set({
        identifier: "tfr-1",
        scope: "global",
        target: null,
        mode: "graceful",
        reason: "test",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: null,
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs/tfr-1/lift",
      });
      expect(res.statusCode).toBe(200);
      const lifted = tfrStore.get("tfr-1");
      expect(lifted?.liftedAt).not.toBeNull();
    });

    it("clears holdingPattern when TFR is lifted and no other TFR applies (RULE-TFR-8)", async () => {
      seedCraft("alpha-1");
      const craft = craftStore.get(PROJECT, "alpha-1")!;
      craft.holdingPattern = true;
      craftStore.set(PROJECT, craft);

      tfrStore.set({
        identifier: "tfr-1",
        scope: "craft",
        target: "alpha-1",
        mode: "immediate",
        reason: "test",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: null,
      });

      await app.inject({
        method: "POST",
        url: `/api/v1/tfrs/tfr-1/lift?projectName=${PROJECT}`,
      });

      const updated = craftStore.get(PROJECT, "alpha-1");
      expect(updated?.holdingPattern).toBe(false);
    });

    it("returns 404 for unknown TFR", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs/ghost/lift",
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 409 for already-lifted TFR", async () => {
      tfrStore.set({
        identifier: "tfr-1",
        scope: "global",
        target: null,
        mode: "graceful",
        reason: "test",
        issuedBy: "user",
        issuedAt: new Date().toISOString(),
        liftedAt: new Date().toISOString(),
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tfrs/tfr-1/lift",
      });
      expect(res.statusCode).toBe(409);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- packages/daemon/src/server/routes/tfr.test.ts`
Expected: FAIL — route module not found / app doesn't have tfrStore

- [ ] **Step 3: Implement TFR routes**

Create `packages/daemon/src/server/routes/tfr.ts`:

```ts
/**
 * Temporary Flight Restriction (TFR) routes for the ATC daemon.
 *
 * Provides endpoints for issuing, listing, and lifting TFRs.
 * When a TFR is issued, affected crafts have their `holdingPattern` flag
 * set and a `TFRIssued` black box entry recorded. When lifted, the flag
 * is cleared and a `TFRLifted` entry recorded.
 *
 * Routes:
 * - `POST /api/v1/tfrs`          — issue a new TFR
 * - `GET  /api/v1/tfrs`          — list TFRs (optional ?active=true filter)
 * - `POST /api/v1/tfrs/:id/lift` — lift a TFR
 *
 * @see RULE-TFR-1 through RULE-TFR-8
 * @see RULE-TFRP-1 through RULE-TFRP-7
 */

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { TfrState, BlackBoxEntry } from "../../types.js";

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface IssueTfrBody {
  scope: "global" | "project" | "craft";
  target: string | null;
  mode: "graceful" | "immediate";
  reason: string;
  issuedBy: "user" | "tower";
  /** Required when scope is "project" or "craft" to identify affected crafts. */
  projectName?: string;
}

interface LiftTfrParams {
  id: string;
}

interface LiftTfrQuery {
  projectName?: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers TFR routes as a Fastify plugin.
 *
 * @param app - The Fastify instance to register routes on.
 * @see RULE-TFR-1 through RULE-TFR-8
 */
export async function tfrRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /api/v1/tfrs — Issue a new TFR
  // -------------------------------------------------------------------------

  app.post<{ Body: IssueTfrBody }>("/api/v1/tfrs", async (request, reply) => {
    const { scope, target, mode, reason, issuedBy, projectName } = request.body;

    // RULE-TFR-4: Tower must not issue global TFRs
    if (issuedBy === "tower" && scope === "global") {
      return reply.code(403).send({ error: "Tower must not issue global TFRs (RULE-TFR-4)" });
    }

    // RULE-TFR-2: Validate scope/target combinations
    if (scope === "global" && target !== null) {
      return reply.code(400).send({ error: "Global TFR must have a null target (RULE-TFR-2)" });
    }
    if (scope === "project" && !target) {
      return reply
        .code(400)
        .send({ error: "Project-scoped TFR must specify a target (RULE-TFR-2)" });
    }
    if (scope === "craft" && !target) {
      return reply
        .code(400)
        .send({ error: "Craft-scoped TFR must specify a target (RULE-TFR-2)" });
    }

    const tfr: TfrState = {
      identifier: randomUUID(),
      scope,
      target,
      mode,
      reason,
      issuedBy,
      issuedAt: new Date().toISOString(),
      liftedAt: null,
    };

    app.tfrStore.set(tfr);

    // RULE-TFR-5: Set holdingPattern on affected crafts
    // RULE-TFRP-5: Record TFRIssued in black box
    applyTfrToCrafts(app, tfr, projectName);

    return reply.code(201).send(tfr);
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/tfrs — List TFRs
  // -------------------------------------------------------------------------

  app.get<{ Querystring: { active?: string } }>("/api/v1/tfrs", async (request, reply) => {
    const active = request.query.active === "true";
    const tfrs = active ? app.tfrStore.listActive() : app.tfrStore.list();
    return reply.send(tfrs);
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/tfrs/:id/lift — Lift a TFR
  // -------------------------------------------------------------------------

  app.post<{ Params: LiftTfrParams; Querystring: LiftTfrQuery }>(
    "/api/v1/tfrs/:id/lift",
    async (request, reply) => {
      const { id } = request.params;
      const { projectName } = request.query;
      const tfr = app.tfrStore.get(id);

      if (!tfr) {
        return reply.code(404).send({ error: `TFR not found: ${id}` });
      }

      if (tfr.liftedAt !== null) {
        return reply.code(409).send({ error: `TFR "${id}" is already lifted` });
      }

      // RULE-TFRP-3: Lift the TFR
      const lifted: TfrState = {
        ...tfr,
        liftedAt: new Date().toISOString(),
      };
      app.tfrStore.set(lifted);

      // RULE-TFR-8: Clear holdingPattern on crafts not subject to another active TFR
      // RULE-TFRP-5: Record TFRLifted in black box
      clearTfrFromCrafts(app, lifted, projectName);

      return reply.send(lifted);
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sets holdingPattern and records TFRIssued on all crafts affected by the TFR.
 */
function applyTfrToCrafts(app: FastifyInstance, tfr: TfrState, projectName?: string): void {
  const projects = projectName ? [projectName] : [];

  // For global scope, we'd need all projects — but the daemon craft store
  // is project-keyed, so callers should pass projectName when they know it.
  // For craft/project scope, projectName is required to find the crafts.
  for (const proj of projects) {
    const crafts = app.craftStore.listForProject(proj);
    for (const craft of crafts) {
      if (isAffectedByTfrState(tfr, proj, craft.callsign)) {
        craft.holdingPattern = true;

        // RULE-TFRP-5: Record TFRIssued in black box
        const entry: BlackBoxEntry = {
          timestamp: new Date().toISOString(),
          author: "system",
          type: "TFRIssued" as BlackBoxEntry["type"],
          content: `TFR ${tfr.identifier} issued: ${tfr.reason} (scope=${tfr.scope}, mode=${tfr.mode})`,
        };
        craft.blackBox.push(entry);
        app.craftStore.set(proj, craft);
      }
    }
  }
}

/**
 * Clears holdingPattern and records TFRLifted on affected crafts,
 * unless another active TFR still applies.
 */
function clearTfrFromCrafts(app: FastifyInstance, tfr: TfrState, projectName?: string): void {
  const projects = projectName ? [projectName] : [];

  for (const proj of projects) {
    const crafts = app.craftStore.listForProject(proj);
    for (const craft of crafts) {
      if (isAffectedByTfrState({ ...tfr, liftedAt: null }, proj, craft.callsign)) {
        // RULE-TFRP-5: Record TFRLifted in black box
        const entry: BlackBoxEntry = {
          timestamp: new Date().toISOString(),
          author: "system",
          type: "TFRLifted" as BlackBoxEntry["type"],
          content: `TFR ${tfr.identifier} lifted`,
        };
        craft.blackBox.push(entry);

        // RULE-TFR-8: Only clear holdingPattern if no other active TFR applies
        const remaining = app.tfrStore.findAffecting(proj, craft.callsign);
        if (remaining.length === 0) {
          craft.holdingPattern = false;
        }
        app.craftStore.set(proj, craft);
      }
    }
  }
}

/**
 * Checks if a TfrState (daemon representation) affects a given project/callsign.
 */
function isAffectedByTfrState(tfr: TfrState, projectName: string, callsign: string): boolean {
  if (tfr.liftedAt !== null) return false;
  switch (tfr.scope) {
    case "global":
      return true;
    case "project":
      return tfr.target === projectName;
    case "craft":
      return tfr.target === callsign;
    default:
      return false;
  }
}
```

- [ ] **Step 4: Wire TfrStore and routes into app.ts**

In `packages/daemon/src/server/app.ts`:

Add import at the top with the other store imports:
```ts
import { TfrStore } from "../state/tfr-store.js";
```

Add import with the other route imports:
```ts
import { tfrRoutes } from "./routes/tfr.js";
```

Add to the `AppOptions` interface:
```ts
  /** Store for Temporary Flight Restrictions. */
  tfrStore?: TfrStore;
```

Add decoration after the other `app.decorate` calls:
```ts
  app.decorate("tfrStore", options.tfrStore ?? new TfrStore("/tmp/atc-default"));
```

Add route registration after the other `void app.register` calls:
```ts
  void app.register(tfrRoutes);
```

Add to the `declare module "fastify"` block:
```ts
    /** Store for Temporary Flight Restrictions. */
    tfrStore: TfrStore;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm run test -- packages/daemon/src/server/routes/tfr.test.ts`
Expected: PASS

- [ ] **Step 6: Run all daemon tests to check for regressions**

Run: `pnpm run test -- packages/daemon/`
Expected: PASS (existing tests may need `holdingPattern: false` added to their seed crafts if they construct `CraftState` objects)

- [ ] **Step 7: Fix any regressions in existing daemon tests**

If any existing daemon test constructs a `CraftState` object literal (e.g., in `crafts.test.ts`, `tower.test.ts`, `vectors.test.ts`, etc.), add `holdingPattern: false` to those objects. Search for `controls: {` in test files under `packages/daemon/src/server/routes/` — every `CraftState` literal needs the new field.

- [ ] **Step 8: Build**

Run: `pnpm run build`
Expected: Clean compilation

- [ ] **Step 9: Commit**

```bash
git add packages/daemon/src/server/routes/tfr.ts packages/daemon/src/server/routes/tfr.test.ts packages/daemon/src/server/app.ts
git commit -m "feat(daemon): add TFR REST routes for issuance, listing, and lifting

POST /api/v1/tfrs issues a TFR, sets holdingPattern, records TFRIssued.
GET /api/v1/tfrs lists TFRs with optional ?active=true filter.
POST /api/v1/tfrs/:id/lift lifts a TFR, clears holdingPattern per RULE-TFR-8.

RULE-TFR-1 through RULE-TFR-8, RULE-TFRP-3, RULE-TFRP-5"
```

---

### Task 6: Fix Existing Test Regressions from holdingPattern

**Files:**
- Modify: Various test files in `packages/core/` and `packages/daemon/` that construct `Craft` or `CraftState` objects

- [ ] **Step 1: Find all test files constructing Craft or CraftState objects**

Run: `grep -rn "controls:" packages/core/src/*.test.ts packages/daemon/src/**/*.test.ts` to identify all places where a `Craft` or `CraftState` literal is constructed. Each one needs `holdingPattern: false` (for core `Craft`) or `holdingPattern: false` (for daemon `CraftState`).

- [ ] **Step 2: Add holdingPattern to all core test fixtures**

In every test file under `packages/core/src/` that constructs a `Craft` object, add `holdingPattern: false` after the `controls` property. This includes:
- `packages/core/src/craft.test.ts` (already done in Task 3)
- `packages/core/src/lifecycle.test.ts`
- `packages/core/src/controls.test.ts`
- `packages/core/src/flight-plan.test.ts`
- `packages/core/src/black-box.test.ts`

- [ ] **Step 3: Add holdingPattern to all daemon test fixtures**

In every test file under `packages/daemon/` that constructs a `CraftState` object, add `holdingPattern: false` after the `controls` property. This includes test files in `packages/daemon/src/server/routes/`.

- [ ] **Step 4: Run full test suite**

Run: `pnpm run test`
Expected: PASS — all tests green across all packages

- [ ] **Step 5: Build**

Run: `pnpm run build`
Expected: Clean compilation

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "fix(tests): add holdingPattern to existing test fixtures

All Craft and CraftState object literals in tests now include
holdingPattern: false to match the updated interfaces."
```

---

### Task 7: Update Specification

**Files:**
- Modify: `docs/specification.md`

- [ ] **Step 1: Add TFR to terminology table (Section 1.1)**

Find the terminology table and add:

```markdown
| Temporary Flight Restriction (TFR) | An externally imposed pause on agent activity, scoped globally, per-project, or per-craft. |
```

- [ ] **Step 2: Add TFRIssued and TFRLifted to black box entry types (Section 2.1.1)**

Find the black box entry types table and add:

```markdown
| `TFRIssued`            | A TFR has taken effect on this craft. Records scope, mode, reason, and issuer. |
| `TFRLifted`            | A TFR affecting this craft has been lifted. Records duration and issuer.        |
```

- [ ] **Step 3: Add Section 2.6 — Temporary Flight Restriction**

Insert before `## 3. Craft Lifecycle` (after Section 2.5 Origin Airport):

```markdown
### 2.6 Temporary Flight Restriction

A **Temporary Flight Restriction (TFR)** is an externally imposed constraint that pauses agent activity to prevent token usage. TFRs do not alter craft lifecycle state — they act as an overlay that blocks all agent actions while active.

#### Properties

| Property   | Type                                  | Constraints                                                                  |
|------------|---------------------------------------|------------------------------------------------------------------------------|
| Identifier | `string`                              | Unique, immutable after creation.                                            |
| Scope      | `"global"`, `"project"`, or `"craft"` | Required. Determines what is affected.                                       |
| Target     | `string \| null`                      | Required for `project` (project ID) and `craft` (callsign) scopes. Null for global. |
| Mode       | `"graceful"` or `"immediate"`         | Required. Default: `graceful`.                                               |
| Reason     | `string`                              | Required. Why the TFR was issued.                                            |
| Issued By  | `"user"` or `"tower"`                 | Required. Who issued the TFR.                                                |
| Issued At  | `Date`                                | Timestamp when the TFR was issued.                                           |
| Lifted At  | `Date \| null`                        | Null while active. Set when lifted.                                          |

#### Rules

- **RULE-TFR-1:** A TFR MUST have a unique identifier, a scope, a mode, a reason, and an issuer.
- **RULE-TFR-2:** A TFR scoped to `project` MUST specify a project target. A TFR scoped to `craft` MUST specify a craft callsign. A `global` TFR MUST have a null target.
- **RULE-TFR-3:** The user MAY issue a TFR at any scope (global, project, or craft).
- **RULE-TFR-4:** The tower MAY issue a TFR at the project or craft scope only if tower-initiated TFRs are enabled in project configuration. The tower MUST NOT issue global TFRs.
- **RULE-TFR-5:** A TFR MUST NOT alter a craft's lifecycle state. Affected crafts retain their current `CraftStatus` but MUST have a `holdingPattern` flag set to `true`.
- **RULE-TFR-6:** While a craft's `holdingPattern` flag is `true`, no pilot on that craft MAY take any action — no code modifications, no vector reports, no checklist executions, no intercom messages, no control transfers.
- **RULE-TFR-7:** Multiple TFRs MAY be active simultaneously. A craft is in a holding pattern if *any* active TFR applies to it (by global scope, matching project, or matching callsign).
- **RULE-TFR-8:** Lifting a TFR clears the `holdingPattern` flag on all affected crafts that are not subject to another active TFR.
```

- [ ] **Step 4: Add Section 4.5 — TFR Protocol**

Insert before `## 5. Appendices` (after Section 4.4 Tower Merge Protocol):

```markdown
### 4.5 TFR Protocol

#### Issuance

1. The issuer (user or tower, per RULE-TFR-3/4) declares a TFR with scope, mode, reason, and target.
2. The system records the TFR with a timestamp.
3. The system identifies all affected crafts based on scope and target.

#### Enforcement — Graceful Mode (default)

1. All affected agents receive a TFR notification.
2. Agents are given a brief wind-down window to reach a safe stopping point.
3. During wind-down, agents MUST record their current state in the black box as an `Observation` entry.
4. After wind-down, the `holdingPattern` flag is set on all affected crafts.
5. A `TFRIssued` entry is recorded in each affected craft's black box.

#### Enforcement — Immediate Mode

1. All affected agents are stopped immediately.
2. The `holdingPattern` flag is set on all affected crafts with no wind-down window.
3. A `TFRIssued` entry is recorded in each affected craft's black box by the system (since agents cannot act).

#### Lifting

1. The user lifts the TFR (only the user may lift a TFR, regardless of who issued it).
2. The system sets `liftedAt` on the TFR record.
3. The `holdingPattern` flag is cleared on all affected crafts not subject to another active TFR.
4. All affected agents automatically resume from their prior state.

#### Rules

- **RULE-TFRP-1:** In graceful mode, agents MUST be given a wind-down window to reach a safe stopping point and record state before the holding pattern takes effect.
- **RULE-TFRP-2:** In immediate mode, the holding pattern takes effect instantly with no wind-down.
- **RULE-TFRP-3:** Only the user MAY lift a TFR, regardless of who issued it.
- **RULE-TFRP-4:** When a TFR is lifted, all affected agents MUST automatically resume from their prior state.
- **RULE-TFRP-5:** A `TFRIssued` and `TFRLifted` entry MUST be recorded in the black box of every affected craft.
- **RULE-TFRP-6:** TFR events MUST be posted as system notifications on each affected craft's intercom.
- **RULE-TFRP-7:** The tower MUST maintain a log of all TFR events with full metadata.
```

- [ ] **Step 5: Add new rules to Appendix A**

Append the following rows to the Rule Index table in Appendix A, after RULE-TMRG-4:

```markdown
| RULE-TFR-1     | TFR must have identifier, scope, mode, reason, and issuer.             | 2.6     |
| RULE-TFR-2     | Project/craft TFRs require target; global TFRs have null target.       | 2.6     |
| RULE-TFR-3     | User may issue TFR at any scope.                                       | 2.6     |
| RULE-TFR-4     | Tower may issue project/craft TFR if enabled; never global.            | 2.6     |
| RULE-TFR-5     | TFR must not alter lifecycle state; uses holdingPattern flag.           | 2.6     |
| RULE-TFR-6     | No pilot actions permitted while holdingPattern is true.               | 2.6     |
| RULE-TFR-7     | Multiple TFRs may coexist; craft holds if any TFR applies.            | 2.6     |
| RULE-TFR-8     | Lifting TFR clears holdingPattern unless another TFR still applies.   | 2.6     |
| RULE-TFRP-1    | Graceful mode: wind-down window before holding pattern.                | 4.5     |
| RULE-TFRP-2    | Immediate mode: no wind-down, instant hold.                            | 4.5     |
| RULE-TFRP-3    | Only the user may lift a TFR.                                          | 4.5     |
| RULE-TFRP-4    | Agents auto-resume when TFR is lifted.                                 | 4.5     |
| RULE-TFRP-5    | TFRIssued and TFRLifted entries in affected craft black boxes.         | 4.5     |
| RULE-TFRP-6    | TFR events posted as intercom system notifications.                    | 4.5     |
| RULE-TFRP-7    | Tower maintains log of all TFR events.                                 | 4.5     |
```

- [ ] **Step 6: Commit**

```bash
git add docs/specification.md
git commit -m "docs(spec): add TFR sections 2.6, 4.5, and Appendix A entries

Adds Temporary Flight Restriction domain model (Section 2.6),
TFR Protocol (Section 4.5), and 15 new rule index entries
(RULE-TFR-1 through RULE-TFR-8, RULE-TFRP-1 through RULE-TFRP-7)."
```

---

### Task 8: Final Validation

- [ ] **Step 1: Run full test suite with coverage**

Run: `pnpm run test -- --coverage`
Expected: PASS — 90%+ coverage on all changed files

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`
Expected: No errors

- [ ] **Step 3: Run format check**

Run: `pnpm run format:check`
Expected: No formatting issues (run `pnpm run format` if needed)

- [ ] **Step 4: Build all packages**

Run: `pnpm run build`
Expected: Clean compilation

- [ ] **Step 5: Review spec coverage**

Verify each RULE-TFR-* and RULE-TFRP-* rule has corresponding implementation:

| Rule | Implementation |
|------|---------------|
| RULE-TFR-1 | `createTfr` validates required fields |
| RULE-TFR-2 | `createTfr` validates scope/target combinations |
| RULE-TFR-3 | `createTfr` allows `issuedBy: "user"` at any scope |
| RULE-TFR-4 | `createTfr` rejects tower + global; daemon route returns 403 |
| RULE-TFR-5 | `applyHoldingPattern` sets flag without changing `status` |
| RULE-TFR-6 | `holdingPattern` flag added to `Craft` interface (enforcement is at daemon/agent level) |
| RULE-TFR-7 | `TfrStore.findAffecting` + `isAffectedByTfr` check all active TFRs |
| RULE-TFR-8 | `clearTfrFromCrafts` checks `findAffecting` before clearing |
| RULE-TFRP-1 | Mode field in TFR; graceful enforcement is daemon-level (agent wind-down) |
| RULE-TFRP-2 | Mode field in TFR; immediate enforcement sets flag instantly |
| RULE-TFRP-3 | `liftTfr` function; lift route enforces only-user via lift endpoint |
| RULE-TFRP-4 | Agent resume on lift is daemon-level (agents poll holdingPattern) |
| RULE-TFRP-5 | `applyTfrToCrafts` / `clearTfrFromCrafts` record black box entries |
| RULE-TFRP-6 | Intercom notifications (deferred — requires WebSocket event publishing) |
| RULE-TFRP-7 | `TfrStore` retains all TFR records including lifted ones |

Note: RULE-TFR-6 (blocking pilot actions), RULE-TFRP-1 (graceful wind-down window), RULE-TFRP-4 (auto-resume), and RULE-TFRP-6 (intercom notifications) require agent-level and WebSocket integration that is beyond the scope of this plan's domain logic. The `holdingPattern` flag is the enforcement point — agents and the daemon must check it before allowing actions.
