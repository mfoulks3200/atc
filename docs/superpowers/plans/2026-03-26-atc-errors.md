# @atc/errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Define domain error types for all ATC rule violations.

**Architecture:** A base AtcError class with a ruleId field, plus domain-specific subclasses. Each error class takes a descriptive message and the RULE-* identifier. Pure error types with no runtime logic.

**Tech Stack:** TypeScript 5.8, vitest, pnpm workspaces

---

## Task 1: Scaffold `@atc/errors` package

### Files

**`packages/errors/package.json`**

```json
{
  "name": "@atc/errors",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc --build"
  }
}
```

**`packages/errors/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Update `tsconfig.json` (root)** — add `{ "path": "packages/errors" }` to the `references` array:

```json
"references": [{ "path": "packages/types" }, { "path": "packages/errors" }, { "path": "packages/core" }]
```

**`packages/errors/src/index.ts`** — create as an empty barrel file (placeholder, populated in later tasks):

```typescript
export { AtcError } from "./base.js";
```

### Verify

```bash
cd packages/errors && pnpm run build
```

Should compile with no errors (once base.ts exists in the next task).

---

## Task 2: Base error class — `AtcError`

### 2a. Write test (RED)

**`packages/errors/src/base.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { AtcError } from "./base.js";

describe("AtcError", () => {
  it("extends Error", () => {
    const err = new AtcError("something broke", "RULE-TEST-1");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores the message", () => {
    const err = new AtcError("something broke", "RULE-TEST-1");
    expect(err.message).toBe("something broke");
  });

  it("stores the ruleId", () => {
    const err = new AtcError("something broke", "RULE-TEST-1");
    expect(err.ruleId).toBe("RULE-TEST-1");
  });

  it("has name set to AtcError", () => {
    const err = new AtcError("msg", "RULE-TEST-1");
    expect(err.name).toBe("AtcError");
  });

  it("captures a stack trace", () => {
    const err = new AtcError("msg", "RULE-TEST-1");
    expect(err.stack).toBeDefined();
  });
});
```

### Verify RED

```bash
pnpm run test -- packages/errors/src/base.test.ts
```

Should fail (module not found).

### 2b. Implement (GREEN)

**`packages/errors/src/base.ts`**

```typescript
/**
 * Base error class for all ATC rule violations.
 * Every domain error extends this class and carries the RULE-* identifier
 * of the violated rule.
 *
 * @see docs/specification.md — Appendix A: Rule Index
 */
export class AtcError extends Error {
  /** The RULE-* identifier of the violated rule. */
  readonly ruleId: string;

  override readonly name: string = "AtcError";

  /**
   * @param message - Human-readable description of what went wrong.
   * @param ruleId - The RULE-* identifier that was violated.
   */
  constructor(message: string, ruleId: string) {
    super(message);
    this.ruleId = ruleId;
  }
}
```

### Verify GREEN

```bash
pnpm run test -- packages/errors/src/base.test.ts
```

All 5 tests pass.

### Verify build

```bash
pnpm run build
```

---

## Task 3: `CraftError` and `SeatAssignmentError`

These are straightforward — no extra context fields needed beyond message and ruleId.

### 3a. Write tests (RED)

**`packages/errors/src/craft.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { CraftError } from "./craft.js";
import { AtcError } from "./base.js";

describe("CraftError", () => {
  it("extends AtcError", () => {
    const err = new CraftError("duplicate callsign", "RULE-CRAFT-1");
    expect(err).toBeInstanceOf(AtcError);
    expect(err).toBeInstanceOf(Error);
  });

  it("stores message and ruleId", () => {
    const err = new CraftError("missing captain", "RULE-CRAFT-5");
    expect(err.message).toBe("missing captain");
    expect(err.ruleId).toBe("RULE-CRAFT-5");
  });

  it("has name set to CraftError", () => {
    const err = new CraftError("msg", "RULE-CRAFT-1");
    expect(err.name).toBe("CraftError");
  });
});
```

**`packages/errors/src/seat.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { SeatAssignmentError } from "./seat.js";
import { AtcError } from "./base.js";

describe("SeatAssignmentError", () => {
  it("extends AtcError", () => {
    const err = new SeatAssignmentError("uncertified in captain seat", "RULE-SEAT-2");
    expect(err).toBeInstanceOf(AtcError);
    expect(err).toBeInstanceOf(Error);
  });

  it("stores message and ruleId", () => {
    const err = new SeatAssignmentError("uncertified pilot", "RULE-SEAT-2");
    expect(err.message).toBe("uncertified pilot");
    expect(err.ruleId).toBe("RULE-SEAT-2");
  });

  it("has name set to SeatAssignmentError", () => {
    const err = new SeatAssignmentError("msg", "RULE-SEAT-2");
    expect(err.name).toBe("SeatAssignmentError");
  });
});
```

### Verify RED

```bash
pnpm run test -- packages/errors/src/craft.test.ts packages/errors/src/seat.test.ts
```

### 3b. Implement (GREEN)

**`packages/errors/src/craft.ts`**

```typescript
import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-CRAFT-* invariant is violated.
 * Covers craft creation and property constraints: unique callsign,
 * required cargo, required category, required captain.
 *
 * @see RULE-CRAFT-1 through RULE-CRAFT-5
 */
export class CraftError extends AtcError {
  override readonly name: string = "CraftError";
}
```

**`packages/errors/src/seat.ts`**

```typescript
import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-SEAT-* invariant is violated.
 * Covers seat assignment constraints: certification requirements,
 * captain cardinality, jumpseat restrictions.
 *
 * @see RULE-SEAT-1 through RULE-SEAT-4
 */
export class SeatAssignmentError extends AtcError {
  override readonly name: string = "SeatAssignmentError";
}
```

### 3c. Update barrel export

**`packages/errors/src/index.ts`** — replace contents:

```typescript
export { AtcError } from "./base.js";
export { CraftError } from "./craft.js";
export { SeatAssignmentError } from "./seat.js";
```

### Verify GREEN

```bash
pnpm run test -- packages/errors/src/craft.test.ts packages/errors/src/seat.test.ts
pnpm run build
```

---

## Task 4: `ControlsError` and `BlackBoxError`

### 4a. Write tests (RED)

**`packages/errors/src/controls.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { ControlsError } from "./controls.js";
import { AtcError } from "./base.js";

describe("ControlsError", () => {
  it("extends AtcError", () => {
    const err = new ControlsError("jumpseat holding controls", "RULE-CTRL-2");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new ControlsError("modifying without controls", "RULE-CTRL-3");
    expect(err.message).toBe("modifying without controls");
    expect(err.ruleId).toBe("RULE-CTRL-3");
  });

  it("has name set to ControlsError", () => {
    const err = new ControlsError("msg", "RULE-CTRL-1");
    expect(err.name).toBe("ControlsError");
  });
});
```

**`packages/errors/src/black-box.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { BlackBoxError } from "./black-box.js";
import { AtcError } from "./base.js";

describe("BlackBoxError", () => {
  it("extends AtcError", () => {
    const err = new BlackBoxError("mutating existing entry", "RULE-BBOX-2");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new BlackBoxError("mutating existing entry", "RULE-BBOX-2");
    expect(err.message).toBe("mutating existing entry");
    expect(err.ruleId).toBe("RULE-BBOX-2");
  });

  it("has name set to BlackBoxError", () => {
    const err = new BlackBoxError("msg", "RULE-BBOX-1");
    expect(err.name).toBe("BlackBoxError");
  });
});
```

### Verify RED

```bash
pnpm run test -- packages/errors/src/controls.test.ts packages/errors/src/black-box.test.ts
```

### 4b. Implement (GREEN)

**`packages/errors/src/controls.ts`**

```typescript
import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-CTRL-* invariant is violated.
 * Covers control handoff and modification constraints: jumpseat exclusion,
 * modification without controls, control transfer protocol violations.
 *
 * @see RULE-CTRL-1 through RULE-CTRL-7
 */
export class ControlsError extends AtcError {
  override readonly name: string = "ControlsError";
}
```

**`packages/errors/src/black-box.ts`**

```typescript
import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-BBOX-* invariant is violated.
 * Covers append-only log constraints: mutating existing entries,
 * missing black box on lifecycle events.
 *
 * @see RULE-BBOX-1 through RULE-BBOX-4
 */
export class BlackBoxError extends AtcError {
  override readonly name: string = "BlackBoxError";
}
```

### 4c. Update barrel export

Add to **`packages/errors/src/index.ts`**:

```typescript
export { AtcError } from "./base.js";
export { CraftError } from "./craft.js";
export { SeatAssignmentError } from "./seat.js";
export { ControlsError } from "./controls.js";
export { BlackBoxError } from "./black-box.js";
```

### Verify GREEN

```bash
pnpm run test -- packages/errors/src/controls.test.ts packages/errors/src/black-box.test.ts
pnpm run build
```

---

## Task 5: `LifecycleError` (with context fields)

This error benefits from extra context: the `from` and `to` states of the invalid transition.

### 5a. Write test (RED)

**`packages/errors/src/lifecycle.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { LifecycleError } from "./lifecycle.js";
import { AtcError } from "./base.js";

describe("LifecycleError", () => {
  it("extends AtcError", () => {
    const err = new LifecycleError("invalid transition", "RULE-LIFE-2");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new LifecycleError("invalid transition", "RULE-LIFE-2");
    expect(err.message).toBe("invalid transition");
    expect(err.ruleId).toBe("RULE-LIFE-2");
  });

  it("has name set to LifecycleError", () => {
    const err = new LifecycleError("msg", "RULE-LIFE-1");
    expect(err.name).toBe("LifecycleError");
  });

  it("optionally stores from and to states", () => {
    const err = new LifecycleError("invalid transition", "RULE-LIFE-2", {
      from: "Landed",
      to: "InFlight",
    });
    expect(err.from).toBe("Landed");
    expect(err.to).toBe("InFlight");
  });

  it("defaults from and to to undefined", () => {
    const err = new LifecycleError("msg", "RULE-LIFE-1");
    expect(err.from).toBeUndefined();
    expect(err.to).toBeUndefined();
  });
});
```

### Verify RED

```bash
pnpm run test -- packages/errors/src/lifecycle.test.ts
```

### 5b. Implement (GREEN)

**`packages/errors/src/lifecycle.ts`**

```typescript
import { AtcError } from "./base.js";

/**
 * Optional context for lifecycle transition errors.
 */
export interface LifecycleErrorContext {
  /** The state the craft was transitioning from. */
  readonly from?: string;
  /** The state the craft was transitioning to. */
  readonly to?: string;
}

/**
 * Error thrown when a RULE-LIFE-* invariant is violated.
 * Covers lifecycle transition constraints: invalid transitions,
 * transitions from terminal states, missing preconditions.
 *
 * @see RULE-LIFE-1 through RULE-LIFE-8
 */
export class LifecycleError extends AtcError {
  override readonly name: string = "LifecycleError";

  /** The state the craft was transitioning from, if applicable. */
  readonly from?: string;

  /** The state the craft was transitioning to, if applicable. */
  readonly to?: string;

  /**
   * @param message - Human-readable description of what went wrong.
   * @param ruleId - The RULE-LIFE-* identifier that was violated.
   * @param context - Optional from/to state context for transition errors.
   */
  constructor(message: string, ruleId: string, context?: LifecycleErrorContext) {
    super(message, ruleId);
    this.from = context?.from;
    this.to = context?.to;
  }
}
```

### 5c. Update barrel export

Add to **`packages/errors/src/index.ts`**:

```typescript
export { AtcError } from "./base.js";
export { CraftError } from "./craft.js";
export { SeatAssignmentError } from "./seat.js";
export { ControlsError } from "./controls.js";
export { BlackBoxError } from "./black-box.js";
export { LifecycleError } from "./lifecycle.js";
export type { LifecycleErrorContext } from "./lifecycle.js";
```

### Verify GREEN

```bash
pnpm run test -- packages/errors/src/lifecycle.test.ts
pnpm run build
```

---

## Task 6: `VectorError`, `ChecklistError`, `EmergencyError`, `TowerError`

These are all simple single-constructor errors with no extra context fields. Grouped into one task.

### 6a. Write tests (RED)

**`packages/errors/src/vector.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { VectorError } from "./vector.js";
import { AtcError } from "./base.js";

describe("VectorError", () => {
  it("extends AtcError", () => {
    const err = new VectorError("skipped vector", "RULE-VEC-2");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new VectorError("missing report", "RULE-VRPT-1");
    expect(err.message).toBe("missing report");
    expect(err.ruleId).toBe("RULE-VRPT-1");
  });

  it("has name set to VectorError", () => {
    const err = new VectorError("msg", "RULE-VEC-1");
    expect(err.name).toBe("VectorError");
  });
});
```

**`packages/errors/src/checklist.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { ChecklistError } from "./checklist.js";
import { AtcError } from "./base.js";

describe("ChecklistError", () => {
  it("extends AtcError", () => {
    const err = new ChecklistError("checklist item failed", "RULE-LCHK-3");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new ChecklistError("not holding controls", "RULE-LCHK-1");
    expect(err.message).toBe("not holding controls");
    expect(err.ruleId).toBe("RULE-LCHK-1");
  });

  it("has name set to ChecklistError", () => {
    const err = new ChecklistError("msg", "RULE-LCHK-1");
    expect(err.name).toBe("ChecklistError");
  });
});
```

**`packages/errors/src/emergency.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { EmergencyError } from "./emergency.js";
import { AtcError } from "./base.js";

describe("EmergencyError", () => {
  it("extends AtcError", () => {
    const err = new EmergencyError("non-captain declaring emergency", "RULE-EMER-1");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new EmergencyError("missing declaration entry", "RULE-EMER-2");
    expect(err.message).toBe("missing declaration entry");
    expect(err.ruleId).toBe("RULE-EMER-2");
  });

  it("has name set to EmergencyError", () => {
    const err = new EmergencyError("msg", "RULE-EMER-1");
    expect(err.name).toBe("EmergencyError");
  });
});
```

**`packages/errors/src/tower.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { TowerError } from "./tower.js";
import { AtcError } from "./base.js";

describe("TowerError", () => {
  it("extends AtcError", () => {
    const err = new TowerError("branch not up to date", "RULE-TOWER-3");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new TowerError("unverified vector reports", "RULE-TMRG-1");
    expect(err.message).toBe("unverified vector reports");
    expect(err.ruleId).toBe("RULE-TMRG-1");
  });

  it("has name set to TowerError", () => {
    const err = new TowerError("msg", "RULE-TOWER-1");
    expect(err.name).toBe("TowerError");
  });
});
```

### Verify RED

```bash
pnpm run test -- packages/errors/src/vector.test.ts packages/errors/src/checklist.test.ts packages/errors/src/emergency.test.ts packages/errors/src/tower.test.ts
```

### 6b. Implement (GREEN)

**`packages/errors/src/vector.ts`**

```typescript
import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-VEC-* or RULE-VRPT-* invariant is violated.
 * Covers vector sequencing, reporting, and flight plan constraints.
 *
 * @see RULE-VEC-1 through RULE-VEC-5
 * @see RULE-VRPT-1 through RULE-VRPT-4
 */
export class VectorError extends AtcError {
  override readonly name: string = "VectorError";
}
```

**`packages/errors/src/checklist.ts`**

```typescript
import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-LCHK-* invariant is violated.
 * Covers landing checklist constraints: execution authority,
 * item failures, go-around triggers.
 *
 * @see RULE-LCHK-1 through RULE-LCHK-4
 */
export class ChecklistError extends AtcError {
  override readonly name: string = "ChecklistError";
}
```

**`packages/errors/src/emergency.ts`**

```typescript
import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-EMER-* invariant is violated.
 * Covers emergency declaration constraints: captain-only authority,
 * required black box entry, return-to-origin protocol.
 *
 * @see RULE-EMER-1 through RULE-EMER-4
 */
export class EmergencyError extends AtcError {
  override readonly name: string = "EmergencyError";
}
```

**`packages/errors/src/tower.ts`**

```typescript
import { AtcError } from "./base.js";

/**
 * Error thrown when a RULE-TOWER-* or RULE-TMRG-* invariant is violated.
 * Covers tower merge coordination: vector report verification,
 * branch freshness, merge sequencing.
 *
 * @see RULE-TOWER-1 through RULE-TOWER-3
 * @see RULE-TMRG-1 through RULE-TMRG-4
 */
export class TowerError extends AtcError {
  override readonly name: string = "TowerError";
}
```

### 6c. Update barrel export

**`packages/errors/src/index.ts`** — final version:

```typescript
export { AtcError } from "./base.js";
export { CraftError } from "./craft.js";
export { SeatAssignmentError } from "./seat.js";
export { ControlsError } from "./controls.js";
export { BlackBoxError } from "./black-box.js";
export { LifecycleError } from "./lifecycle.js";
export type { LifecycleErrorContext } from "./lifecycle.js";
export { VectorError } from "./vector.js";
export { ChecklistError } from "./checklist.js";
export { EmergencyError } from "./emergency.js";
export { TowerError } from "./tower.js";
```

### Verify GREEN

```bash
pnpm run test -- packages/errors/src/vector.test.ts packages/errors/src/checklist.test.ts packages/errors/src/emergency.test.ts packages/errors/src/tower.test.ts
pnpm run build
```

---

## Task 7: Final validation

Run the full contributing checklist against the completed package.

```bash
# Format
pnpm run format
pnpm run format:check

# Lint
pnpm run lint

# Type check
pnpm run build

# All tests
pnpm run test

# Coverage
pnpm run test -- --coverage
```

Verify 90%+ coverage on all files in `packages/errors/src/`. Fix any issues surfaced by lint or formatting.
