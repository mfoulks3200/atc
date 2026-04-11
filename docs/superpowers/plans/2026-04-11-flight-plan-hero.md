# Flight Plan Hero Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hero widget to the craft detail page that renders the flight plan as a continuous arc with segment lengths proportional to actual/estimated durations, styled as a tactical HUD.

**Architecture:** Pure-function utilities compute segment geometry and stats from `CraftState`; a React component renders the SVG with arc segments, waypoints, plane glyph, callout labels, and four corner readouts. `CraftState` gains a new `createdAt` timestamp so segment-1 duration can be computed. The existing FLIGHT PLAN card below the hero is left untouched.

**Tech Stack:** TypeScript (strict, Node16), React 18, Vite, Vitest, `@testing-library/react`, SVG.

**Spec:** `docs/superpowers/specs/2026-04-11-flight-plan-hero-design.md`

---

## File Structure

```
NEW  packages/web/src/components/base/flight-plan-hero.tsx         ~260 lines
NEW  packages/web/src/components/base/flight-plan-hero.utils.ts    ~180 lines
NEW  packages/web/src/components/base/flight-plan-hero.utils.test.ts
NEW  packages/web/src/components/base/flight-plan-hero.test.tsx
MOD  packages/web/src/routes/crafts/detail.tsx          (insert hero)
MOD  packages/web/src/types/api.ts                       (add createdAt)
MOD  packages/daemon/src/types.ts                        (add createdAt)
MOD  packages/daemon/src/server/routes/crafts.ts         (stamp on create)
MOD  packages/daemon/src/state/craft-store.ts            (backfill on load)
MOD  packages/daemon/src/state/craft-store.test.ts       (update fixture)
MOD  packages/daemon/src/types.test.ts                   (update fixture)
MOD  packages/daemon/src/server/routes/*.test.ts         (update fixtures)
```

Responsibility split:

- **`flight-plan-hero.utils.ts`** — pure data+math. `HERO_GEOMETRY`, `computeSegments`, `computeWaypoints`, `planeTransform`, `computeStats`, `formatDuration`. No React, no DOM. Fully unit-testable.
- **`flight-plan-hero.tsx`** — React component. Takes `craft: CraftState`, calls the utils, renders SVG. Holds the local `now` state that ticks for live elapsed.

---

## Task 1: Add `createdAt` to daemon `CraftState`

**Files:**
- Modify: `packages/daemon/src/types.ts:211-236`
- Modify: `packages/daemon/src/server/routes/crafts.ts:85-98`
- Modify: `packages/daemon/src/state/craft-store.test.ts:15-30`
- Modify: `packages/daemon/src/types.test.ts` (any CraftState fixture)
- Modify: `packages/daemon/src/server/routes/intercom.test.ts`, `blackbox.test.ts`, `vectors.test.ts`, `tower.test.ts` (fixtures)

- [ ] **Step 1: Add `createdAt` to `CraftState` interface**

In `packages/daemon/src/types.ts`, add the field right after `callsign` in the `CraftState` interface (around line 213):

```ts
export interface CraftState {
  /** Unique aviation callsign (matches the git branch name). */
  callsign: string;
  /** ISO-8601 timestamp when the craft was created (flight plan opened). */
  createdAt: string;
  /** Git branch name this craft is tied to. */
  branch: string;
  // ... rest unchanged
}
```

- [ ] **Step 2: Stamp `createdAt` in craft creation route**

In `packages/daemon/src/server/routes/crafts.ts`, modify the `craft` literal at line 85:

```ts
const craft: CraftState = {
  callsign,
  createdAt: new Date().toISOString(),
  branch,
  cargo,
  category,
  status: CraftStatus.Taxiing,
  captain,
  firstOfficers: firstOfficers ?? [],
  jumpseaters: jumpseaters ?? [],
  flightPlan: vectors,
  blackBox: [],
  intercom: [],
  controls: { mode: "exclusive", holder: captain },
};
```

- [ ] **Step 3: Update all `CraftState` test fixtures**

Run:

```bash
cd /Users/mfoulks/Documents/git/atc
grep -rn "CraftState = {" packages/daemon/src
```

Expected output lists the test files. For every fixture that builds a `CraftState` literal, add `createdAt: "2026-04-11T00:00:00.000Z"` right after `callsign`. Files to update:

- `packages/daemon/src/state/craft-store.test.ts` — `makeCraft` helper at line 15:

```ts
function makeCraft(callsign: string): CraftState {
  return {
    callsign,
    createdAt: "2026-04-11T00:00:00.000Z",
    branch: callsign,
    // ... rest unchanged
  };
}
```

- `packages/daemon/src/types.test.ts` — any `CraftState = {` literal (add the same `createdAt`).
- `packages/daemon/src/server/routes/intercom.test.ts`, `blackbox.test.ts`, `vectors.test.ts`, `tower.test.ts` — same pattern.

- [ ] **Step 4: Run daemon build + tests**

```bash
pnpm run build
pnpm run test -- packages/daemon
```

Expected: all green. If any test still fails with "Property 'createdAt' is missing", find the remaining fixture and add it.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/
git commit -m "feat(daemon): add createdAt to CraftState"
```

---

## Task 2: Backfill `createdAt` when loading persisted crafts

**Files:**
- Modify: `packages/daemon/src/state/craft-store.ts:200-223`
- Modify: `packages/daemon/src/state/craft-store.test.ts`

Persisted `craft.json` files written before Task 1 won't have `createdAt`. The store's `loadProject` must fill in a sensible default on read so the field can be treated as required everywhere else.

- [ ] **Step 1: Write the failing test**

Append to `packages/daemon/src/state/craft-store.test.ts` inside the top `describe("CraftStore", ...)` block:

```ts
it("backfills createdAt from earliest blackBox entry on load", async () => {
  const projectDir = join(tmpDir, "projects", "proj-a", "crafts", "LEGACY-01");
  await mkdir(projectDir, { recursive: true });
  // Simulate a legacy craft file written before createdAt existed.
  const legacy = {
    callsign: "LEGACY-01",
    branch: "LEGACY-01",
    cargo: "legacy",
    category: "test",
    status: CraftStatus.InFlight,
    captain: "pilot-1",
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [],
    blackBox: [
      { timestamp: "2026-01-15T12:00:00.000Z", author: "pilot-1", type: "Decision", content: "start" },
      { timestamp: "2026-01-16T12:00:00.000Z", author: "pilot-1", type: "Decision", content: "mid" },
    ],
    intercom: [],
    controls: { mode: "exclusive", holder: "pilot-1" },
  };
  await writeFile(join(projectDir, "craft.json"), JSON.stringify(legacy));

  await store.loadProject("proj-a");
  const loaded = store.get("proj-a", "LEGACY-01");
  expect(loaded?.createdAt).toBe("2026-01-15T12:00:00.000Z");
});

it("backfills createdAt to now when blackBox is empty", async () => {
  const projectDir = join(tmpDir, "projects", "proj-b", "crafts", "EMPTY-01");
  await mkdir(projectDir, { recursive: true });
  const legacy = {
    callsign: "EMPTY-01",
    branch: "EMPTY-01",
    cargo: "empty",
    category: "test",
    status: CraftStatus.Taxiing,
    captain: "pilot-1",
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "pilot-1" },
  };
  await writeFile(join(projectDir, "craft.json"), JSON.stringify(legacy));

  const before = Date.now();
  await store.loadProject("proj-b");
  const after = Date.now();

  const loaded = store.get("proj-b", "EMPTY-01");
  expect(loaded?.createdAt).toBeDefined();
  const loadedMs = new Date(loaded!.createdAt).getTime();
  expect(loadedMs).toBeGreaterThanOrEqual(before);
  expect(loadedMs).toBeLessThanOrEqual(after);
});
```

Also add `mkdir` and `writeFile` to the node imports at the top of the test file:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm run test -- packages/daemon/src/state/craft-store.test.ts
```

Expected: FAIL on the two new tests — `loaded?.createdAt` is `undefined`.

- [ ] **Step 3: Implement backfill in `loadProject`**

In `packages/daemon/src/state/craft-store.ts`, replace the `readJsonSafe` block inside `loadProject` (around line 214-222) with:

```ts
    await Promise.all(
      entries.map(async (callsign) => {
        const filePath = join(craftsDir, callsign, "craft.json");
        const craft = await readJsonSafe<CraftState>(filePath);
        if (craft !== null) {
          if (!craft.createdAt) {
            const earliest = craft.blackBox[0]?.timestamp;
            craft.createdAt = earliest ?? new Date().toISOString();
          }
          projectMap.set(callsign, craft);
        }
      }),
    );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm run test -- packages/daemon/src/state/craft-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/state/craft-store.ts packages/daemon/src/state/craft-store.test.ts
git commit -m "feat(daemon): backfill CraftState.createdAt when loading legacy craft.json"
```

---

## Task 3: Mirror `createdAt` in web API types

**Files:**
- Modify: `packages/web/src/types/api.ts:68-81`

- [ ] **Step 1: Add `createdAt` to web `CraftState`**

In `packages/web/src/types/api.ts`, add `createdAt` after `callsign` in the interface (line 68):

```ts
export interface CraftState {
  callsign: string;
  createdAt: string;
  branch: string;
  cargo: string;
  category: string;
  status: CraftStatus;
  captain: string;
  firstOfficers: string[];
  jumpseaters: string[];
  flightPlan: VectorState[];
  blackBox: BlackBoxEntry[];
  intercom: IntercomMessage[];
  controls: ControlState;
}
```

- [ ] **Step 2: Run web build to confirm no type errors**

```bash
pnpm run build
```

Expected: clean build (no `tsc` errors). The web package should compile because the existing detail page doesn't read `createdAt` yet.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/types/api.ts
git commit -m "feat(web): add createdAt to CraftState api type"
```

---

## Task 4: Geometry utilities (`HERO_GEOMETRY`, arc math)

**Files:**
- Create: `packages/web/src/components/base/flight-plan-hero.utils.ts`
- Create: `packages/web/src/components/base/flight-plan-hero.utils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/base/flight-plan-hero.utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { HERO_GEOMETRY, pointAt, planeTransform } from "./flight-plan-hero.utils";

describe("HERO_GEOMETRY", () => {
  it("exposes fixed arc parameters", () => {
    expect(HERO_GEOMETRY.cx).toBe(450);
    expect(HERO_GEOMETRY.cy).toBe(560);
    expect(HERO_GEOMETRY.r).toBe(400);
    expect(HERO_GEOMETRY.arcStartDeg).toBe(-124);
    expect(HERO_GEOMETRY.arcEndDeg).toBe(-56);
    expect(HERO_GEOMETRY.viewBox).toEqual({ w: 900, h: 320 });
  });
});

describe("pointAt", () => {
  it("returns the depart point at t=0", () => {
    const p = pointAt(0);
    expect(p.x).toBeCloseTo(226.32, 1);
    expect(p.y).toBeCloseTo(228.40, 1);
  });

  it("returns the land point at t=1", () => {
    const p = pointAt(1);
    expect(p.x).toBeCloseTo(673.68, 1);
    expect(p.y).toBeCloseTo(228.40, 1);
  });

  it("returns the arc apex at t=0.5", () => {
    const p = pointAt(0.5);
    expect(p.x).toBeCloseTo(450, 1);
    expect(p.y).toBeCloseTo(160, 1);
  });

  it("always returns points on the r=400 circle", () => {
    for (const t of [0, 0.1, 0.25, 0.37, 0.5, 0.7, 0.83, 1]) {
      const p = pointAt(t);
      const dx = p.x - HERO_GEOMETRY.cx;
      const dy = p.y - HERO_GEOMETRY.cy;
      const dist = Math.hypot(dx, dy);
      expect(dist).toBeCloseTo(HERO_GEOMETRY.r, 3);
    }
  });
});

describe("planeTransform", () => {
  it("aligns the plane tangent at the arc apex (t=0.5)", () => {
    const t = planeTransform(0.5);
    // At apex, tangent points along +x, heading 0°, plane path points up so rotate +90°.
    expect(t.rotateDeg).toBeCloseTo(90, 1);
    expect(t.x).toBeCloseTo(450, 1);
    expect(t.y).toBeCloseTo(160, 1);
  });

  it("aligns the plane tangent at depart (t=0)", () => {
    const t = planeTransform(0);
    // At angle -124°, tangent heading ≈ -34°, plane rotation ≈ 56°.
    expect(t.rotateDeg).toBeCloseTo(56, 1);
  });

  it("aligns the plane tangent at land (t=1)", () => {
    const t = planeTransform(1);
    // At angle -56°, tangent heading ≈ 34°, plane rotation ≈ 124°.
    expect(t.rotateDeg).toBeCloseTo(124, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm run test -- packages/web/src/components/base/flight-plan-hero.utils.test.ts
```

Expected: FAIL with "Cannot find module './flight-plan-hero.utils'".

- [ ] **Step 3: Implement the geometry utilities**

Create `packages/web/src/components/base/flight-plan-hero.utils.ts`:

```ts
/**
 * Pure utilities for the flight-plan hero widget: geometry, segment math,
 * plane orientation, duration formatting, and stats computation.
 *
 * No React, no DOM. Fully unit-testable.
 */

// ---------------------------------------------------------------------------
// Geometry constants
// ---------------------------------------------------------------------------

export const HERO_GEOMETRY = {
  cx: 450,
  cy: 560,
  r: 400,
  arcStartDeg: -124,
  arcEndDeg: -56,
  viewBox: { w: 900, h: 320 },
  labelRail: { nameY: 68, durationY: 79, exitY: 85, margin: 90 },
  leaderKinkY: 100,
} as const;

export interface Point {
  x: number;
  y: number;
}

/**
 * Returns the (x, y) point at normalized position t along the arc,
 * where t=0 is depart and t=1 is land.
 */
export function pointAt(t: number): Point {
  const { cx, cy, r, arcStartDeg, arcEndDeg } = HERO_GEOMETRY;
  const angleDeg = arcStartDeg + (arcEndDeg - arcStartDeg) * t;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

export interface PlaneTransform {
  x: number;
  y: number;
  rotateDeg: number;
}

/**
 * Returns the translation + rotation needed to draw the plane glyph
 * at normalized position t with its nose pointing along the arc tangent.
 * The plane path in local coords points up (-y), so we rotate by heading + 90°.
 */
export function planeTransform(t: number): PlaneTransform {
  const { arcStartDeg, arcEndDeg } = HERO_GEOMETRY;
  const angleDeg = arcStartDeg + (arcEndDeg - arcStartDeg) * t;
  const angleRad = (angleDeg * Math.PI) / 180;
  // Tangent direction for sweep=1 in SVG y-down is (-sinθ, cosθ).
  const tx = -Math.sin(angleRad);
  const ty = Math.cos(angleRad);
  const headingDeg = (Math.atan2(ty, tx) * 180) / Math.PI;
  const p = pointAt(t);
  return { x: p.x, y: p.y, rotateDeg: headingDeg + 90 };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm run test -- packages/web/src/components/base/flight-plan-hero.utils.test.ts
```

Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/base/flight-plan-hero.utils.ts packages/web/src/components/base/flight-plan-hero.utils.test.ts
git commit -m "feat(web): add flight-plan-hero geometry utilities"
```

---

## Task 5: `computeSegments` — segment durations from `CraftState`

**Files:**
- Modify: `packages/web/src/components/base/flight-plan-hero.utils.ts`
- Modify: `packages/web/src/components/base/flight-plan-hero.utils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `flight-plan-hero.utils.test.ts`:

```ts
import { computeSegments } from "./flight-plan-hero.utils";
import type { CraftState, VectorState } from "@/types/api";

function mkCraft(partial: Partial<CraftState> & { flightPlan: VectorState[] }): CraftState {
  return {
    callsign: "TEST-01",
    createdAt: "2026-04-11T00:00:00.000Z",
    branch: "TEST-01",
    cargo: "test",
    category: "test",
    status: "InFlight" as any,
    captain: "p1",
    firstOfficers: [],
    jumpseaters: [],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "p1" },
    ...partial,
  };
}

describe("computeSegments", () => {
  const now = new Date("2026-04-11T11:00:00.000Z").getTime();

  it("computes measured durations for all passed vectors", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" },
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T03:00:00.000Z" },
        { name: "V3", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T08:00:00.000Z" },
      ],
    });
    const segs = computeSegments(craft, now);
    expect(segs).toHaveLength(3);
    expect(segs[0].durationMs).toBe(2 * 3600_000);
    expect(segs[1].durationMs).toBe(1 * 3600_000);
    expect(segs[2].durationMs).toBe(5 * 3600_000);
    expect(segs.every((s) => s.status === "Passed")).toBe(true);
    expect(segs.every((s) => !s.isCurrent)).toBe(true);
  });

  it("marks the first pending vector as current with live elapsed", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" },
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T08:00:00.000Z" },
        { name: "V3", acceptanceCriteria: "", status: "Pending" },
        { name: "V4", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    expect(segs[2].isCurrent).toBe(true);
    // segment 3 starts at V2.reportedAt (08:00) and elapsed to now (11:00) = 3h
    expect(segs[2].durationMs).toBe(3 * 3600_000);
    expect(segs[3].isCurrent).toBe(false);
  });

  it("uses average of measured segments for pending estimates", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" }, // 2h
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T08:00:00.000Z" }, // 6h
        { name: "V3", acceptanceCriteria: "", status: "Pending" }, // current, 3h elapsed at now
        { name: "V4", acceptanceCriteria: "", status: "Pending" }, // avg = (2+6+3)/3 = 3.67h
      ],
    });
    const segs = computeSegments(craft, now);
    const avgMs = ((2 + 6 + 3) / 3) * 3600_000;
    expect(segs[3].durationMs).toBeCloseTo(avgMs, -2);
    expect(segs[3].isEstimate).toBe(true);
  });

  it("falls back to equal weights when no measured segments exist (Taxiing)", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      status: "Taxiing" as any,
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Pending" },
        { name: "V2", acceptanceCriteria: "", status: "Pending" },
        { name: "V3", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    expect(segs[0].durationMs).toBe(segs[1].durationMs);
    expect(segs[1].durationMs).toBe(segs[2].durationMs);
    expect(segs.every((s) => s.isEstimate)).toBe(true);
    // Taxiing has no current segment
    expect(segs.every((s) => !s.isCurrent)).toBe(true);
  });

  it("includes failed segments in the average", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T04:00:00.000Z" }, // 4h
        { name: "V2", acceptanceCriteria: "", status: "Failed", reportedAt: "2026-04-11T06:00:00.000Z" }, // 2h
        { name: "V3", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    expect(segs[1].status).toBe("Failed");
    // average of measured = (4+2)/2 = 3h
    expect(segs[2].durationMs).toBeCloseTo(3 * 3600_000, -2);
  });

  it("produces monotonic normalized t values that sum to 1", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" },
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T03:00:00.000Z" },
        { name: "V3", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    expect(segs[0].tStart).toBe(0);
    expect(segs[segs.length - 1].tEnd).toBeCloseTo(1, 6);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].tStart).toBe(segs[i - 1].tEnd);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm run test -- packages/web/src/components/base/flight-plan-hero.utils.test.ts
```

Expected: FAIL — `computeSegments` not exported.

- [ ] **Step 3: Implement `computeSegments`**

Append to `flight-plan-hero.utils.ts`:

```ts
import type { CraftState, VectorState, VectorStatus } from "@/types/api";

export interface Segment {
  /** Vector index (0-based). */
  index: number;
  /** Vector name displayed as the label. */
  name: string;
  /** Status of the trailing vector. */
  status: VectorStatus;
  /** Segment start timestamp in ms (craft.createdAt for i=0, else prev.reportedAt). */
  startMs: number;
  /** Segment end timestamp in ms (undefined if not yet reported). */
  endMs?: number;
  /** Computed duration in ms (measured, live elapsed, or estimate). */
  durationMs: number;
  /** True when this is the first Pending vector after an unbroken run of Passed/Failed. */
  isCurrent: boolean;
  /** True when durationMs is an estimate (average-based) rather than a measurement. */
  isEstimate: boolean;
  /** Normalized position at the START of this segment along the arc, [0, 1]. */
  tStart: number;
  /** Normalized position at the END of this segment along the arc, [0, 1]. */
  tEnd: number;
}

/**
 * Derives segment durations from a craft's flight plan, using:
 *   - craft.createdAt as segment 0 start
 *   - vector[i-1].reportedAt as segment i start (for i > 0)
 *   - vector[i].reportedAt as segment i end
 *   - live elapsed (now - startMs) for the current segment
 *   - arithmetic mean of measured segments for later pending segments
 *   - equal weights if no measured segments exist yet
 *
 * @param nowMs override for Date.now() — test seam.
 */
export function computeSegments(craft: CraftState, nowMs: number = Date.now()): Segment[] {
  const createdMs = new Date(craft.createdAt).getTime();
  const vectors = craft.flightPlan;
  const n = vectors.length;
  if (n === 0) {
    return [];
  }

  // Pass 1: raw start/end times and status.
  const raw: Omit<Segment, "durationMs" | "isCurrent" | "isEstimate" | "tStart" | "tEnd">[] = [];
  let prevEnd: number | undefined = undefined;
  for (let i = 0; i < n; i++) {
    const v = vectors[i];
    const startMs = i === 0 ? createdMs : (prevEnd ?? createdMs);
    const endMs = v.reportedAt ? new Date(v.reportedAt).getTime() : undefined;
    raw.push({ index: i, name: v.name, status: v.status, startMs, endMs });
    prevEnd = endMs;
  }

  // Pass 2: identify current segment — first Pending whose predecessors are all non-Pending.
  let currentIdx = -1;
  for (let i = 0; i < n; i++) {
    if (vectors[i].status === "Pending") {
      currentIdx = i;
      break;
    }
  }
  // Current only counts if the craft is actively flying (any measured segment exists OR it's not Taxiing).
  // We approximate by: current is meaningful only when at least one earlier segment has ended OR the first segment itself is "in flight" (i.e. anything but Taxiing).
  const isTaxiing = currentIdx === 0 && raw[0].endMs === undefined && craft.status === "Taxiing";
  if (isTaxiing) {
    currentIdx = -1;
  }

  // Pass 3: measured durations + live elapsed for current.
  const measured: number[] = [];
  const durations: (number | undefined)[] = new Array(n).fill(undefined);
  for (let i = 0; i < n; i++) {
    const { startMs, endMs } = raw[i];
    if (endMs !== undefined) {
      const d = endMs - startMs;
      durations[i] = d;
      measured.push(d);
    } else if (i === currentIdx) {
      const d = Math.max(0, nowMs - startMs);
      durations[i] = d;
      measured.push(d);
    }
  }

  // Pass 4: fill pending estimates.
  const avgMs = measured.length > 0 ? measured.reduce((a, b) => a + b, 0) / measured.length : 1;
  for (let i = 0; i < n; i++) {
    if (durations[i] === undefined) {
      durations[i] = avgMs;
    }
  }

  // Pass 5: normalize and assemble.
  const total = durations.reduce<number>((a, b) => a + (b ?? 0), 0) || 1;
  const segments: Segment[] = [];
  let cursorT = 0;
  for (let i = 0; i < n; i++) {
    const d = durations[i] ?? 0;
    const frac = d / total;
    const tStart = cursorT;
    const tEnd = i === n - 1 ? 1 : cursorT + frac;
    cursorT = tEnd;
    const isMeasured = raw[i].endMs !== undefined || i === currentIdx;
    segments.push({
      ...raw[i],
      durationMs: d,
      isCurrent: i === currentIdx,
      isEstimate: !isMeasured,
      tStart,
      tEnd,
    });
  }
  return segments;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm run test -- packages/web/src/components/base/flight-plan-hero.utils.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/base/flight-plan-hero.utils.ts packages/web/src/components/base/flight-plan-hero.utils.test.ts
git commit -m "feat(web): add computeSegments for flight-plan-hero"
```

---

## Task 6: `computeStats` + `formatDuration`

**Files:**
- Modify: `packages/web/src/components/base/flight-plan-hero.utils.ts`
- Modify: `packages/web/src/components/base/flight-plan-hero.utils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `flight-plan-hero.utils.test.ts`:

```ts
import { computeStats, formatDuration } from "./flight-plan-hero.utils";

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(0)).toBe("0h 00m");
    expect(formatDuration(60_000 * 5)).toBe("0h 05m");
    expect(formatDuration(3600_000)).toBe("1h 00m");
    expect(formatDuration(3600_000 * 11 + 60_000 * 30)).toBe("11h 30m");
  });

  it("guards negatives", () => {
    expect(formatDuration(-1000)).toBe("0h 00m");
  });
});

describe("computeStats", () => {
  const now = new Date("2026-04-11T11:00:00.000Z").getTime();

  it("derives elapsed / eta / progress / status for InFlight", () => {
    const craft = mkCraft({
      status: "InFlight" as any,
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" },
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T08:00:00.000Z" },
        { name: "V3", acceptanceCriteria: "", status: "Pending" },
        { name: "V4", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    const stats = computeStats(craft, segs, now);
    expect(stats.elapsed).toBe("11h 00m");
    expect(stats.progress).toBe("2 / 4 VECTORS");
    expect(stats.statusLabel).toBe("IN FLIGHT");
    // eta = createdAt + total duration = 0 + (2 + 6 + 3 + avg(2,6,3)≈3.67)h = ~14.67h → "14h 40m"
    expect(stats.eta).toMatch(/^~\d+h \d{2}m$/);
  });

  it("shows TOTAL / landed for a completed craft", () => {
    const craft = mkCraft({
      status: "Landed" as any,
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T05:00:00.000Z" },
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T10:00:00.000Z" },
      ],
    });
    const segs = computeSegments(craft, now);
    const stats = computeStats(craft, segs, now);
    expect(stats.elapsedLabel).toBe("TOTAL");
    expect(stats.elapsed).toBe("10h 00m");
    expect(stats.eta).toBe("—");
    expect(stats.statusLabel).toBe("★ LANDED");
    expect(stats.progress).toBe("2 / 2 VECTORS");
  });

  it("dims everything for Taxiing", () => {
    const craft = mkCraft({
      status: "Taxiing" as any,
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Pending" },
        { name: "V2", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    const stats = computeStats(craft, segs, now);
    expect(stats.elapsed).toBe("—");
    expect(stats.eta).toBe("—");
    expect(stats.progress).toBe("0 / 2 VECTORS");
    expect(stats.statusLabel).toBe("TAXIING");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm run test -- packages/web/src/components/base/flight-plan-hero.utils.test.ts
```

Expected: FAIL — `computeStats` / `formatDuration` not exported.

- [ ] **Step 3: Implement `formatDuration` and `computeStats`**

Append to `flight-plan-hero.utils.ts`:

```ts
/**
 * Formats a millisecond duration as "Xh YYm". Negative values clamp to zero.
 */
export function formatDuration(ms: number): string {
  const safe = Math.max(0, ms);
  const totalMinutes = Math.floor(safe / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export interface HeroStats {
  /** Label to show in the top-left slot — "ELAPSED" or "TOTAL". */
  elapsedLabel: string;
  /** Value for the elapsed slot. */
  elapsed: string;
  /** Value for the ETA slot, or "—" when not applicable. */
  eta: string;
  /** Progress readout, e.g. "3 / 6 VECTORS". */
  progress: string;
  /** Status readout, e.g. "IN FLIGHT" or "★ LANDED". */
  statusLabel: string;
  /** Color variant for the status slot. */
  statusTone: "amber" | "green" | "red" | "dim";
}

const STATUS_LABELS: Record<string, { label: string; tone: HeroStats["statusTone"] }> = {
  Taxiing: { label: "TAXIING", tone: "dim" },
  InFlight: { label: "IN FLIGHT", tone: "amber" },
  LandingChecklist: { label: "LANDING CHECKLIST", tone: "amber" },
  ClearedToLand: { label: "CLEARED TO LAND", tone: "amber" },
  GoAround: { label: "GO AROUND", tone: "red" },
  Emergency: { label: "★ EMERGENCY", tone: "red" },
  Landed: { label: "★ LANDED", tone: "green" },
  ReturnToOrigin: { label: "RTO", tone: "dim" },
};

/**
 * Derives the four corner readouts from a craft and its computed segments.
 */
export function computeStats(craft: CraftState, segments: Segment[], nowMs: number): HeroStats {
  const status = String(craft.status);
  const isTaxiing = status === "Taxiing";
  const isLanded = status === "Landed" || status === "ReturnToOrigin";
  const passedCount = craft.flightPlan.filter((v) => v.status === "Passed").length;
  const total = craft.flightPlan.length;

  const elapsedLabel = isLanded ? "TOTAL" : "ELAPSED";
  let elapsed: string;
  let eta: string;

  if (isTaxiing) {
    elapsed = "—";
    eta = "—";
  } else if (isLanded) {
    const totalMs = segments.reduce((a, s) => a + s.durationMs, 0);
    elapsed = formatDuration(totalMs);
    eta = "—";
  } else {
    const createdMs = new Date(craft.createdAt).getTime();
    elapsed = formatDuration(nowMs - createdMs);
    const totalMs = segments.reduce((a, s) => a + s.durationMs, 0);
    eta = "~" + formatDuration(totalMs);
  }

  const statusEntry = STATUS_LABELS[status] ?? { label: status.toUpperCase(), tone: "dim" as const };

  return {
    elapsedLabel,
    elapsed,
    eta,
    progress: `${passedCount} / ${total} VECTORS`,
    statusLabel: statusEntry.label,
    statusTone: statusEntry.tone,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm run test -- packages/web/src/components/base/flight-plan-hero.utils.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/base/flight-plan-hero.utils.ts packages/web/src/components/base/flight-plan-hero.utils.test.ts
git commit -m "feat(web): add computeStats and formatDuration for flight-plan-hero"
```

---

## Task 7: FlightPlanHero component — arc + waypoints

**Files:**
- Create: `packages/web/src/components/base/flight-plan-hero.tsx`

This task builds the component skeleton that renders radar rings, endpoint labels, arc segments, and waypoints. Plane/labels/stats come in Task 8.

- [ ] **Step 1: Create the component file with the arc rendering**

Create `packages/web/src/components/base/flight-plan-hero.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { CraftState } from "@/types/api";
import {
  HERO_GEOMETRY,
  computeSegments,
  pointAt,
  type Segment,
} from "./flight-plan-hero.utils";

const DURATION_COLOR = {
  passed: "#3a5a88",
  pending: "#2e4468",
  current: "#a88845",
  failed: "#8a3a3a",
} as const;

/**
 * Builds the SVG arc path `d` attribute for a single segment on the shared circle.
 */
function segmentPath(seg: Segment): string {
  const start = pointAt(seg.tStart);
  const end = pointAt(seg.tEnd);
  const { r } = HERO_GEOMETRY;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
}

function segmentStrokeClass(seg: Segment): string {
  if (seg.status === "Failed") return "arc-failed";
  if (seg.isCurrent) return "arc-current";
  if (seg.status === "Passed") return "arc-passed";
  return "arc-pending";
}

function waypointClass(seg: Segment): string {
  if (seg.status === "Failed") return "waypoint-failed";
  if (seg.isCurrent) return "waypoint-current";
  if (seg.status === "Passed") return "waypoint-passed";
  return "waypoint-pending";
}

export interface FlightPlanHeroProps {
  craft: CraftState;
}

export function FlightPlanHero({ craft }: FlightPlanHeroProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (craft.status === "Taxiing" || craft.status === "Landed" || craft.status === "ReturnToOrigin") {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [craft.status]);

  const segments = computeSegments(craft, now);
  const { viewBox, cx, cy } = HERO_GEOMETRY;
  const departPoint = pointAt(0);
  const landPoint = pointAt(1);

  return (
    <div
      className="overflow-hidden rounded-md border"
      style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)" }}
    >
      <div
        className="border-b px-3 py-2 text-[10px] uppercase tracking-widest"
        style={{ color: "var(--text-dim)", borderColor: "var(--border)", fontFamily: "var(--font-mono)" }}
      >
        Flight plan · Tactical HUD
      </div>
      <svg
        viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", width: "100%", height: "auto" }}
      >
        <defs>
          <style>{`
            .arc-passed  { fill: none; stroke: var(--accent-green); stroke-width: 4;
              filter: drop-shadow(0 0 6px rgba(0,255,136,0.55)) drop-shadow(0 0 12px rgba(0,255,136,0.28)); }
            .arc-current { fill: none; stroke: var(--accent-yellow); stroke-width: 4;
              filter: drop-shadow(0 0 8px rgba(255,216,102,0.7)); }
            .arc-pending { fill: none; stroke: var(--text-dim); stroke-width: 2;
              stroke-dasharray: 4 5; opacity: 0.6; }
            .arc-failed  { fill: none; stroke: var(--accent-red); stroke-width: 4;
              filter: drop-shadow(0 0 6px rgba(255,85,85,0.6)) drop-shadow(0 0 14px rgba(255,85,85,0.3)); }
            .waypoint-passed  { fill: var(--bg-base); stroke: var(--accent-green); stroke-width: 2; }
            .waypoint-current { fill: var(--accent-yellow); stroke: var(--accent-yellow); stroke-width: 2; }
            .waypoint-pending { fill: var(--bg-base); stroke: var(--text-dim); stroke-width: 1.5; }
            .waypoint-failed  { fill: var(--accent-red); stroke: var(--accent-red); stroke-width: 2; }
            .radar-ring { fill: none; stroke: #162033; stroke-width: 1; }
            .grid-line  { stroke: #0f1a2e; stroke-width: 1; }
            .endpoint   { font-size: 9px; letter-spacing: 0.2em; fill: var(--text-dim);
              font-family: var(--font-mono); }
          `}</style>
        </defs>

        {/* radar rings + crosshair */}
        <circle className="radar-ring" cx={cx} cy={cy} r={340} />
        <circle className="radar-ring" cx={cx} cy={cy} r={400} />
        <circle className="radar-ring" cx={cx} cy={cy} r={460} />
        <line className="grid-line" x1={0} y1={228.4} x2={viewBox.w} y2={228.4} />
        <line className="grid-line" x1={cx} y1={0} x2={cx} y2={viewBox.h} />

        {/* endpoints */}
        <text className="endpoint" x={departPoint.x} y={252} textAnchor="middle">
          ◆ DEPART
        </text>
        <text className="endpoint" x={landPoint.x} y={252} textAnchor="middle">
          LAND ◆
        </text>

        {/* arc segments */}
        {segments.map((seg) => (
          <path key={`seg-${seg.index}`} className={segmentStrokeClass(seg)} d={segmentPath(seg)} />
        ))}

        {/* depart marker */}
        <circle cx={departPoint.x} cy={departPoint.y} r={3} fill="var(--accent-green)" />

        {/* waypoints */}
        {segments.map((seg) => {
          const p = pointAt(seg.tEnd);
          const r = seg.isCurrent ? 6 : 5;
          return <circle key={`wp-${seg.index}`} className={waypointClass(seg)} cx={p.x} cy={p.y} r={r} />;
        })}

        {/* X mark on failed waypoints */}
        {segments
          .filter((s) => s.status === "Failed")
          .map((seg) => {
            const p = pointAt(seg.tEnd);
            return (
              <g key={`x-${seg.index}`} transform={`translate(${p.x}, ${p.y})`}>
                <line x1={-3} y1={-3} x2={3} y2={3} stroke="var(--bg-base)" strokeWidth={1.5} />
                <line x1={-3} y1={3} x2={3} y2={-3} stroke="var(--bg-base)" strokeWidth={1.5} />
              </g>
            );
          })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Run the web build to catch type errors**

```bash
pnpm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/base/flight-plan-hero.tsx
git commit -m "feat(web): add FlightPlanHero component skeleton with arc and waypoints"
```

---

## Task 8: Plane glyph, label rail, leader callouts

**Files:**
- Modify: `packages/web/src/components/base/flight-plan-hero.tsx`

- [ ] **Step 1: Extend the component**

In `flight-plan-hero.tsx`, add these imports at the top:

```tsx
import {
  HERO_GEOMETRY,
  computeSegments,
  formatDuration,
  pointAt,
  planeTransform,
  type Segment,
} from "./flight-plan-hero.utils";
```

Add a helper function above the component:

```tsx
/**
 * Determines where the plane should be positioned for the current craft state.
 * Returns a normalized t value along the arc, or null if the plane should be hidden.
 */
function planeT(craft: CraftState, segments: Segment[]): number | null {
  if (craft.status === "Taxiing") return 0;
  if (craft.status === "Landed" || craft.status === "ReturnToOrigin") return 1;
  const failed = segments.find((s) => s.status === "Failed");
  if (failed) return failed.tEnd;
  const current = segments.find((s) => s.isCurrent);
  if (current) return (current.tStart + current.tEnd) / 2;
  return null;
}

/**
 * Returns "passed" | "current" | "pending" | "failed" for duration coloring.
 */
function durationTone(seg: Segment): keyof typeof DURATION_COLOR {
  if (seg.status === "Failed") return "failed";
  if (seg.isCurrent) return "current";
  if (seg.status === "Passed") return "passed";
  return "pending";
}

function durationText(seg: Segment): string {
  if (seg.status === "Failed") return `${formatDuration(seg.durationMs)} · FAILED`;
  if (seg.isCurrent) return `${formatDuration(seg.durationMs)} · NOW`;
  if (seg.isEstimate) return `~${formatDuration(seg.durationMs)}`;
  return formatDuration(seg.durationMs);
}
```

Inside the component's return, compute per-frame data before the `<svg>`:

```tsx
  const planePosT = planeT(craft, segments);
  const plane = planePosT !== null ? planeTransform(planePosT) : null;
  const rail = HERO_GEOMETRY.labelRail;
  const n = segments.length;
  const labelXs = segments.map((_, i) => {
    if (n === 1) return viewBox.w / 2;
    return rail.margin + (i / (n - 1)) * (viewBox.w - 2 * rail.margin);
  });
```

Add to the SVG `<defs><style>` block (append to the existing string literal):

```
  .plane       { fill: var(--accent-yellow);
    filter: drop-shadow(0 0 10px rgba(255,216,102,0.9)); }
  .plane-red   { fill: var(--accent-red);
    filter: drop-shadow(0 0 12px rgba(255,85,85,0.9)); }
  .plane-green { fill: var(--accent-green);
    filter: drop-shadow(0 0 10px rgba(0,255,136,0.9)); }
  .leader      { stroke: #2a3a5a; stroke-width: 1; fill: none; stroke-linejoin: round; }
  .leader-failed { stroke: #6a2a2a; }
  .vname       { fill: var(--text-secondary); font-size: 10px; letter-spacing: 0.08em;
    font-family: var(--font-mono); }
  .vname-current { fill: var(--accent-yellow); }
  .vname-failed  { fill: var(--accent-red); }
  .vname-done    { fill: var(--accent-green); }
  .vtime       { font-size: 8px; letter-spacing: 0.05em; font-family: var(--font-mono); }
```

Add these elements right before the closing `</svg>`:

```tsx
        {/* leader callouts */}
        {segments.map((seg, i) => {
          const labelX = labelXs[i];
          const wp = pointAt(seg.tEnd);
          const points = `${labelX},${rail.exitY} ${labelX},${HERO_GEOMETRY.leaderKinkY} ${wp.x},${wp.y}`;
          const cls = seg.status === "Failed" ? "leader leader-failed" : "leader";
          return <polyline key={`ld-${seg.index}`} className={cls} points={points} />;
        })}

        {/* plane glyph */}
        {plane && (
          <g transform={`translate(${plane.x}, ${plane.y}) rotate(${plane.rotateDeg})`}>
            <path
              className={
                craft.status === "Emergency" || craft.status === "GoAround"
                  ? "plane-red"
                  : craft.status === "Landed" || craft.status === "ReturnToOrigin"
                    ? "plane-green"
                    : "plane"
              }
              d="M 0 -8 L 2 3 L 9 5 L 9 8 L 2 7 L 0 12 L -2 7 L -9 8 L -9 5 L -2 3 Z"
            />
          </g>
        )}

        {/* label rail */}
        {segments.map((seg, i) => {
          const isLanded = craft.status === "Landed" || craft.status === "ReturnToOrigin";
          const nameCls =
            seg.status === "Failed"
              ? "vname vname-failed"
              : seg.isCurrent
                ? "vname vname-current"
                : isLanded && seg.status === "Passed"
                  ? "vname vname-done"
                  : "vname";
          const tone = durationTone(seg);
          return (
            <g key={`label-${seg.index}`}>
              <text className={nameCls} x={labelXs[i]} y={rail.nameY} textAnchor="middle">
                V{seg.index + 1} {seg.name.toUpperCase()}
              </text>
              <text
                className="vtime"
                x={labelXs[i]}
                y={rail.durationY}
                textAnchor="middle"
                fill={DURATION_COLOR[tone]}
              >
                {durationText(seg)}
              </text>
            </g>
          );
        })}
```

- [ ] **Step 2: Run the web build**

```bash
pnpm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/base/flight-plan-hero.tsx
git commit -m "feat(web): render plane, labels, and leader callouts in FlightPlanHero"
```

---

## Task 9: Corner stats + Emergency pulse

**Files:**
- Modify: `packages/web/src/components/base/flight-plan-hero.tsx`

- [ ] **Step 1: Add `computeStats` import**

Update the import block at the top:

```tsx
import {
  HERO_GEOMETRY,
  computeSegments,
  computeStats,
  formatDuration,
  pointAt,
  planeTransform,
  type Segment,
} from "./flight-plan-hero.utils";
```

- [ ] **Step 2: Compute stats and map tones to colors**

Inside the component body, after `computeSegments`, add:

```tsx
  const stats = computeStats(craft, segments, now);
  const statusColor =
    stats.statusTone === "amber"
      ? "var(--accent-yellow)"
      : stats.statusTone === "red"
        ? "var(--accent-red)"
        : stats.statusTone === "green"
          ? "var(--accent-green)"
          : "var(--text-muted)";
```

- [ ] **Step 3: Append pulse keyframes + stat CSS to `<defs><style>`**

Add to the existing style block:

```
  .stat-lbl { fill: var(--text-dim); font-size: 8px; letter-spacing: 0.18em;
    font-family: var(--font-mono); }
  .stat-val { fill: var(--text-primary); font-size: 13px; font-weight: 600;
    font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  @keyframes fph-emerg-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.45; }
  }
  .arc-emerg { animation: fph-emerg-pulse 1.2s ease-in-out infinite; }
```

- [ ] **Step 4: Apply emergency pulse to the current segment when in Emergency**

Replace `segmentStrokeClass` at the top of the file with:

```tsx
function segmentStrokeClass(seg: Segment, craftStatus: string): string {
  if (seg.status === "Failed") return "arc-failed";
  if (seg.isCurrent) {
    if (craftStatus === "Emergency") return "arc-current arc-emerg";
    return "arc-current";
  }
  if (seg.status === "Passed") return "arc-passed";
  return "arc-pending";
}
```

Update the call site inside the `<svg>` to pass `craft.status`:

```tsx
        {segments.map((seg) => (
          <path
            key={`seg-${seg.index}`}
            className={segmentStrokeClass(seg, craft.status)}
            d={segmentPath(seg)}
          />
        ))}
```

- [ ] **Step 5: Render the four corner stat groups**

Add these before the closing `</svg>`:

```tsx
        {/* four-corner stats */}
        <g transform="translate(30, 25)">
          <text className="stat-lbl" y={0}>
            {stats.elapsedLabel}
          </text>
          <text className="stat-val" y={16}>
            {stats.elapsed}
          </text>
        </g>
        <g transform={`translate(${viewBox.w - 30}, 25)`} textAnchor="end">
          <text className="stat-lbl" y={0}>
            ETA
          </text>
          <text className="stat-val" y={16}>
            {stats.eta}
          </text>
        </g>
        <g transform="translate(30, 290)">
          <text className="stat-lbl" y={0}>
            PROGRESS
          </text>
          <text className="stat-val" y={16} fill="var(--text-muted)">
            {stats.progress}
          </text>
        </g>
        <g transform={`translate(${viewBox.w - 30}, 290)`} textAnchor="end">
          <text className="stat-lbl" y={0}>
            STATUS
          </text>
          <text className="stat-val" y={16} fill={statusColor}>
            {stats.statusLabel}
          </text>
        </g>
```

- [ ] **Step 6: Run build**

```bash
pnpm run build
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/base/flight-plan-hero.tsx
git commit -m "feat(web): add corner stats and emergency pulse to FlightPlanHero"
```

---

## Task 10: Component integration tests

**Files:**
- Create: `packages/web/src/components/base/flight-plan-hero.test.tsx`

- [ ] **Step 1: Write the component tests**

Create `packages/web/src/components/base/flight-plan-hero.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FlightPlanHero } from "./flight-plan-hero";
import type { CraftState } from "@/types/api";

function makeCraft(overrides: Partial<CraftState>): CraftState {
  return {
    callsign: "TEST-01",
    createdAt: "2026-04-11T00:00:00.000Z",
    branch: "TEST-01",
    cargo: "test",
    category: "test",
    status: "InFlight" as any,
    captain: "p1",
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "p1" },
    ...overrides,
  };
}

describe("FlightPlanHero", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T11:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders all vectors as labels in the rail", () => {
    const craft = makeCraft({
      flightPlan: [
        { name: "scaffold", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" },
        { name: "types", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T08:00:00.000Z" },
        { name: "core", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const { getByText } = render(<FlightPlanHero craft={craft} />);
    expect(getByText("V1 SCAFFOLD")).toBeTruthy();
    expect(getByText("V2 TYPES")).toBeTruthy();
    expect(getByText("V3 CORE")).toBeTruthy();
  });

  it("shows IN FLIGHT status for an in-flight craft", () => {
    const craft = makeCraft({
      status: "InFlight" as any,
      flightPlan: [
        { name: "v1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" },
        { name: "v2", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const { getByText } = render(<FlightPlanHero craft={craft} />);
    expect(getByText("IN FLIGHT")).toBeTruthy();
  });

  it("shows ★ LANDED and TOTAL for a landed craft", () => {
    const craft = makeCraft({
      status: "Landed" as any,
      flightPlan: [
        { name: "v1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T05:00:00.000Z" },
        { name: "v2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T10:00:00.000Z" },
      ],
    });
    const { getByText } = render(<FlightPlanHero craft={craft} />);
    expect(getByText("★ LANDED")).toBeTruthy();
    expect(getByText("TOTAL")).toBeTruthy();
    expect(getByText("10h 00m")).toBeTruthy();
  });

  it("shows TAXIING with em-dash stats for a taxiing craft", () => {
    const craft = makeCraft({
      status: "Taxiing" as any,
      flightPlan: [{ name: "v1", acceptanceCriteria: "", status: "Pending" }],
    });
    const { getAllByText, getByText } = render(<FlightPlanHero craft={craft} />);
    expect(getByText("TAXIING")).toBeTruthy();
    expect(getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("renders a red EMERGENCY status", () => {
    const craft = makeCraft({
      status: "Emergency" as any,
      flightPlan: [
        { name: "v1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" },
        { name: "v2", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const { getByText } = render(<FlightPlanHero craft={craft} />);
    expect(getByText("★ EMERGENCY")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm run test -- packages/web/src/components/base/flight-plan-hero.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/base/flight-plan-hero.test.tsx
git commit -m "test(web): add state-variant tests for FlightPlanHero"
```

---

## Task 11: Integrate the hero into the craft detail page

**Files:**
- Modify: `packages/web/src/routes/crafts/detail.tsx:69-70`

- [ ] **Step 1: Import the hero**

Add to the imports at the top of `packages/web/src/routes/crafts/detail.tsx`:

```tsx
import { FlightPlanHero } from "@/components/base/flight-plan-hero";
```

- [ ] **Step 2: Insert the hero between the header block and the 2-column grid**

Find the section around line 69 (after the header `<div>` that closes, before `<div className="mt-4 grid grid-cols-2 gap-4">`). Insert:

```tsx
      <div className="mt-4">
        <FlightPlanHero craft={craft} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        {/* ...existing CREW + FLIGHT PLAN cards unchanged... */}
```

The existing 2-column grid below stays exactly as it is.

- [ ] **Step 3: Run the full web test + build**

```bash
pnpm run build
pnpm run test -- packages/web
```

Expected: clean build, all tests green.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/crafts/detail.tsx
git commit -m "feat(web): add FlightPlanHero to craft detail page"
```

---

## Task 12: Full-suite verification

- [ ] **Step 1: Run full build**

```bash
pnpm run build
```

Expected: all packages compile cleanly.

- [ ] **Step 2: Run full test suite**

```bash
pnpm run test
```

Expected: all tests pass.

- [ ] **Step 3: Run lint**

```bash
pnpm run lint
```

Expected: clean.

- [ ] **Step 4: Run format check**

```bash
pnpm run format:check
```

If this fails, run `pnpm run format` and re-commit.

- [ ] **Step 5: Final commit if anything needed fixing**

If any of the above required fixes:

```bash
git add -A
git commit -m "chore: lint/format cleanup for flight-plan-hero"
```

Otherwise, the plan is complete.

---

## Self-Review Notes

**Spec coverage check:**
- Aesthetic direction — Task 7 (CSS in `<defs>`) ✓
- Geometry (cx/cy/r/angles/pointAt) — Task 4 ✓
- Segment layout (cumulative t values) — Task 5 ✓
- Waypoints per status — Task 7 ✓
- Plane glyph + orientation — Tasks 4, 8 ✓
- Label rail (equal spacing) — Task 8 ✓
- Leader callouts (vertical drop + diagonal) — Task 8 ✓
- Background decoration (radar rings, crosshair, endpoint labels) — Task 7 ✓
- Four-corner stats — Task 9 ✓
- Duration computation + live ticking — Tasks 5, 7 ✓
- CraftState.createdAt schema change — Tasks 1, 2, 3 ✓
- State variants (Taxiing, InFlight, GoAround, Emergency, Landed) — Tasks 8, 9, 10 ✓
- Integration on detail page — Task 11 ✓
- Testing (utils + component) — Tasks 4–6, 10 ✓

**Type consistency check:** `Segment`, `HeroStats`, `PlaneTransform`, `HERO_GEOMETRY`, `pointAt`, `planeTransform`, `computeSegments`, `computeStats`, `formatDuration` — all defined in Task 4/5/6 and used consistently in Tasks 7–10.
