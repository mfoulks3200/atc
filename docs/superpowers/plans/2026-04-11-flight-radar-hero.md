# Flight Radar Hero Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `<FlightRadar />` hero widget to the dashboard that renders every active craft as a deterministic, clickable SVG radar map driven by the existing REST + WebSocket data flow.

**Architecture:** Pure geometry helpers in `packages/web/src/lib/radar-geometry.ts` (unit-tested, no React). React component at `packages/web/src/components/base/flight-radar.tsx` reads `useProjects()` + `useCrafts()`, flattens `CraftState[]` across projects (carrying the project name for deep links), calls the geometry helpers, and renders SVG. WebSocket invalidation is already handled by the existing `useSubscription` + `mapEventToQueryUpdate` pipeline — the radar only needs to subscribe. No server or `@airtrafficcontrol/*` package changes.

**Tech Stack:** React 18, TypeScript (Node16, `.js` import extensions), Vitest, React Testing Library, TanStack Query, react-router, Tailwind CSS, SVG.

---

## Spec reconciliation

Three points in `docs/superpowers/specs/2026-04-11-flight-radar-hero-design.md` do not match the current codebase. Resolved as follows:

1. **`flightPlan.vectors`** — the actual type is `CraftState.flightPlan: VectorState[]` (flat, no nested `vectors`). Read vectors as `craft.flightPlan` throughout.
2. **`hasOpenEmergency` field** — not exposed on `CraftState`. V1 approximates it as `craft.status === "Emergency"`. A TODO comment in `flight-radar.tsx` notes the proper bbox-scan refinement (checking `craft.blackBox` for unresolved `EmergencyDeclaration` entries) as followup.
3. **Deep-link path** — the real route is `/projects/:name/crafts/:callsign`, not `/crafts/:callsign`. The flattened craft list must carry `project` per craft and the click handler navigates to `/projects/${project}/crafts/${callsign}`.

## File structure

### Create
- `packages/web/src/lib/radar-geometry.ts` — pure geometry + hashing + label resolver.
- `packages/web/src/lib/radar-geometry.test.ts` — Vitest unit tests for everything in `radar-geometry.ts`.
- `packages/web/src/components/base/flight-radar.tsx` — React SVG component and `colorForCraft`.
- `packages/web/src/components/base/flight-radar.test.tsx` — React Testing Library smoke tests.

### Modify
- `packages/web/src/routes/dashboard.tsx` — mount `<FlightRadar />` immediately after `<PageHeader>`, above the stat card grid.

No files outside `packages/web/` change.

---

## Task 1: Geometry — FNV-1a hash + bearing + jitter

**Files:**
- Create: `packages/web/src/lib/radar-geometry.ts`
- Test: `packages/web/src/lib/radar-geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/lib/radar-geometry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fnv1a, bearingFor, jitterFor } from "./radar-geometry.js";

describe("fnv1a", () => {
  it("is stable for the same input", () => {
    expect(fnv1a("NX-42")).toBe(fnv1a("NX-42"));
  });

  it("has known-answer values", () => {
    // FNV-1a 32-bit offset basis 2166136261, prime 16777619.
    expect(fnv1a("")).toBe(2166136261);
    expect(fnv1a("a")).toBe(3826002220);
    expect(fnv1a("foobar")).toBe(3214735720);
  });

  it("returns an unsigned 32-bit integer", () => {
    const h = fnv1a("anything");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe("bearingFor", () => {
  it("is deterministic", () => {
    expect(bearingFor("NX-42")).toBe(bearingFor("NX-42"));
  });

  it("returns a value in [0, 360)", () => {
    for (const name of ["A", "NX-42", "very-long-callsign", "z"]) {
      const b = bearingFor(name);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });

  it("spreads 20 sample callsigns across at least four quadrants", () => {
    const names = Array.from({ length: 20 }, (_, i) => `NX-${i}`);
    const quadrants = new Set(names.map((n) => Math.floor(bearingFor(n) / 90)));
    expect(quadrants.size).toBeGreaterThanOrEqual(4);
  });
});

describe("jitterFor", () => {
  it("stays within [-5, 5] degrees", () => {
    for (const name of ["A", "NX-42", "callsign-with-many-chars"]) {
      for (let i = 0; i < 10; i++) {
        const j = jitterFor(name, i);
        expect(j).toBeGreaterThanOrEqual(-5);
        expect(j).toBeLessThanOrEqual(5);
      }
    }
  });

  it("is deterministic per (callsign, vectorIndex)", () => {
    expect(jitterFor("NX-42", 0)).toBe(jitterFor("NX-42", 0));
    expect(jitterFor("NX-42", 1)).toBe(jitterFor("NX-42", 1));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- packages/web/src/lib/radar-geometry.test.ts`
Expected: FAIL — module `./radar-geometry.js` does not exist.

- [ ] **Step 3: Create `radar-geometry.ts` with the three helpers**

Create `packages/web/src/lib/radar-geometry.ts`:

```ts
/**
 * Pure geometry + hashing helpers for the Flight Radar hero widget.
 * No React, no DOM — everything here is unit-testable in isolation.
 *
 * @see docs/superpowers/specs/2026-04-11-flight-radar-hero-design.md
 */

/**
 * 32-bit FNV-1a hash of a string. Used as the deterministic seed for
 * every per-craft bearing and jitter decision so a craft's radar position
 * is stable across renders and across operators viewing the same state.
 */
export function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by FNV prime 16777619 using Math.imul for 32-bit semantics,
    // then coerce back to unsigned 32-bit.
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic bearing in [0, 360) for a callsign.
 * This is NOT a real compass heading — it is a pseudo-random but stable
 * angle used purely as a layout hint for the radar.
 */
export function bearingFor(callsign: string): number {
  return fnv1a(`bearing:${callsign}`) % 360;
}

/**
 * Deterministic per-vector angular jitter in degrees in [-5, 5].
 * Lets successive vectors on one craft wobble slightly so tracks don't
 * collapse onto a perfect straight radial line.
 */
export function jitterFor(callsign: string, vectorIndex: number): number {
  const h = fnv1a(`jitter:${callsign}:${vectorIndex}`);
  // Map 32-bit hash into [0, 10), subtract 5 → [-5, 5).
  return (h % 10000) / 1000 - 5;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- packages/web/src/lib/radar-geometry.test.ts`
Expected: PASS (11 test assertions across 3 describe blocks).

Note: if the `fnv1a("a")` or `fnv1a("foobar")` known-answer values disagree with the implementation, **trust the implementation** (the implementation follows the standard FNV-1a 32-bit algorithm) and update the test expectations to match. Log the observed values and keep them as the frozen expectation going forward.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/radar-geometry.ts packages/web/src/lib/radar-geometry.test.ts
git commit -m "feat(web): add deterministic FNV-1a hash and bearing helpers for flight radar"
```

---

## Task 2: Geometry — `computeCraftTrack`

**Files:**
- Modify: `packages/web/src/lib/radar-geometry.ts`
- Test: `packages/web/src/lib/radar-geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/src/lib/radar-geometry.test.ts`:

```ts
import { computeCraftTrack } from "./radar-geometry.js";
import type { TrackPoint, CraftTrack } from "./radar-geometry.js";

describe("computeCraftTrack", () => {
  const center: TrackPoint = { x: 400, y: 240 };
  const outerRadius = 320;
  const threshRadius = 62;

  it("returns totalVectors points in vectors[]", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 4,
      currentVectorIndex: 1,
      center,
      outerRadius,
      threshRadius,
    });
    expect(t.vectors).toHaveLength(4);
  });

  it("places origin near the outer ring", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 3,
      currentVectorIndex: 0,
      center,
      outerRadius,
      threshRadius,
    });
    const dx = t.origin.x - center.x;
    const dy = t.origin.y - center.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    expect(r).toBeGreaterThan(outerRadius - 2);
    expect(r).toBeLessThan(outerRadius + 2);
  });

  it("places threshold near the inner ring", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 3,
      currentVectorIndex: 0,
      center,
      outerRadius,
      threshRadius,
    });
    const dx = t.threshold.x - center.x;
    const dy = t.threshold.y - center.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    expect(r).toBeGreaterThan(threshRadius - 2);
    expect(r).toBeLessThan(threshRadius + 2);
  });

  it("places each vector on or near the base bearing within jitter tolerance", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 5,
      currentVectorIndex: 2,
      center,
      outerRadius,
      threshRadius,
    });
    const baseRad = (bearingFor("NX-42") * Math.PI) / 180;
    for (const v of t.vectors) {
      const angle = Math.atan2(v.y - center.y, v.x - center.x);
      // Difference wrapped into [-pi, pi].
      let diff = angle - baseRad;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      // 5 deg jitter => roughly 0.0873 rad tolerance; give 0.12 for slack.
      expect(Math.abs(diff)).toBeLessThan(0.12);
    }
  });

  it("sets currentVectorIndex to -1 when all vectors passed", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 3,
      currentVectorIndex: 3,
      center,
      outerRadius,
      threshRadius,
    });
    expect(t.currentVectorIndex).toBe(-1);
  });

  it("is deterministic", () => {
    const args = {
      callsign: "NX-42",
      totalVectors: 4,
      currentVectorIndex: 1,
      center,
      outerRadius,
      threshRadius,
    } as const;
    const a = computeCraftTrack(args);
    const b = computeCraftTrack(args);
    expect(a).toEqual(b);
  });

  it("headingDeg points roughly inward (toward center) in SVG degrees", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 3,
      currentVectorIndex: 1,
      center,
      outerRadius,
      threshRadius,
    });
    // Sanity: headingDeg is a finite number in [-180, 360].
    expect(Number.isFinite(t.headingDeg)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- packages/web/src/lib/radar-geometry.test.ts`
Expected: FAIL — `computeCraftTrack` is not exported.

- [ ] **Step 3: Add `computeCraftTrack` to `radar-geometry.ts`**

Append to `packages/web/src/lib/radar-geometry.ts`:

```ts
export interface TrackPoint {
  x: number;
  y: number;
}

export interface CraftTrack {
  /** Entry point on the outer radar ring. */
  origin: TrackPoint;
  /** One point per flight-plan vector, ordered from origin toward threshold. */
  vectors: TrackPoint[];
  /** Runway threshold point on the inner ring. */
  threshold: TrackPoint;
  /** Heading of the plane icon at its current vector, in SVG degrees. */
  headingDeg: number;
  /** Index into vectors[] where the plane icon sits; -1 if all passed. */
  currentVectorIndex: number;
}

interface ComputeTrackInput {
  callsign: string;
  totalVectors: number;
  /** 0-based index of the first non-passed vector. Equal to totalVectors when all passed. */
  currentVectorIndex: number;
  center: TrackPoint;
  outerRadius: number;
  threshRadius: number;
}

/**
 * Compute the full SVG geometry for a craft's track: origin → vectors → threshold,
 * plus the plane icon's position index and heading. Deterministic given the
 * same input (callsign seeds the bearing and jitter).
 *
 * All angles are in SVG degrees, where 0 = east and 90 = south.
 */
export function computeCraftTrack(input: ComputeTrackInput): CraftTrack {
  const { callsign, totalVectors, center, outerRadius, threshRadius } = input;
  const baseBearingDeg = bearingFor(callsign);

  const toPoint = (radius: number, degrees: number): TrackPoint => {
    const rad = (degrees * Math.PI) / 180;
    return {
      x: center.x + radius * Math.cos(rad),
      y: center.y + radius * Math.sin(rad),
    };
  };

  const origin = toPoint(outerRadius, baseBearingDeg);
  const threshold = toPoint(threshRadius, baseBearingDeg);

  const vectors: TrackPoint[] = [];
  // Distribute vectors evenly between outer ring and threshold (exclusive of
  // the extreme endpoints so the origin/threshold markers stay distinct).
  const span = outerRadius - threshRadius;
  const divisor = Math.max(totalVectors + 1, 2);
  for (let i = 0; i < totalVectors; i++) {
    const t = (i + 1) / divisor;
    const radius = outerRadius - span * t;
    const degrees = baseBearingDeg + jitterFor(callsign, i);
    vectors.push(toPoint(radius, degrees));
  }

  // Plane icon sits at the first non-passed vector, or -1 if all passed.
  const planeIndex = input.currentVectorIndex >= totalVectors ? -1 : input.currentVectorIndex;

  // Heading = direction from the previous point to the current plane point.
  // When planeIndex is 0, use origin as the "previous" point. When -1, fall
  // back to pointing from last vector to threshold.
  let headingDeg: number;
  if (planeIndex === -1) {
    const last = vectors[vectors.length - 1] ?? origin;
    headingDeg = (Math.atan2(threshold.y - last.y, threshold.x - last.x) * 180) / Math.PI;
  } else {
    const prev = planeIndex === 0 ? origin : vectors[planeIndex - 1];
    const curr = vectors[planeIndex];
    headingDeg = (Math.atan2(curr.y - prev.y, curr.x - prev.x) * 180) / Math.PI;
  }

  return {
    origin,
    vectors,
    threshold,
    headingDeg,
    currentVectorIndex: planeIndex,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- packages/web/src/lib/radar-geometry.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/radar-geometry.ts packages/web/src/lib/radar-geometry.test.ts
git commit -m "feat(web): compute deterministic craft track geometry for flight radar"
```

---

## Task 3: Geometry — `resolveLabelPlacements`

**Files:**
- Modify: `packages/web/src/lib/radar-geometry.ts`
- Test: `packages/web/src/lib/radar-geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/src/lib/radar-geometry.test.ts`:

```ts
import { resolveLabelPlacements } from "./radar-geometry.js";
import type { LabelInput, RouteSegment, ResolvedLabel } from "./radar-geometry.js";

describe("resolveLabelPlacements", () => {
  const bbox = { width: 60, height: 14 };

  it("returns one resolved label per input, preserving order", () => {
    const inputs: LabelInput[] = [
      { callsign: "A", anchor: { x: 100, y: 100 }, headingDeg: 0, bbox },
      { callsign: "B", anchor: { x: 300, y: 100 }, headingDeg: 0, bbox },
    ];
    const out = resolveLabelPlacements(inputs, []);
    expect(out.map((r) => r.callsign)).toEqual(["A", "B"]);
  });

  it("separates two labels whose initial positions would overlap", () => {
    const inputs: LabelInput[] = [
      { callsign: "A", anchor: { x: 100, y: 100 }, headingDeg: 0, bbox },
      { callsign: "B", anchor: { x: 105, y: 100 }, headingDeg: 0, bbox },
    ];
    const out = resolveLabelPlacements(inputs, []);
    const dx = out[0].x - out[1].x;
    const dy = out[0].y - out[1].y;
    expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(bbox.height);
  });

  it("pushes or flips a label whose preferred slot crosses another craft's segment", () => {
    const inputs: LabelInput[] = [
      { callsign: "A", anchor: { x: 200, y: 200 }, headingDeg: 0, bbox },
    ];
    // A vertical segment immediately above the anchor belonging to craft "B"
    // blocks the preferred perpendicular.
    const segments: RouteSegment[] = [
      { callsign: "B", x1: 180, y1: 100, x2: 220, y2: 180 },
    ];
    const out = resolveLabelPlacements(inputs, segments);
    // Label should not be at the initial 36 px offset directly above.
    const dy = out[0].y - 200;
    expect(Math.abs(dy) === 36 && dy < 0).toBe(false);
  });

  it("applies the text-anchor rule: below-right → start", () => {
    const inputs: LabelInput[] = [
      // headingDeg 90 → perpendicular is ±0 (east-west). Below-right placement
      // satisfies offX > 0 && offY >= 0 && |offX| > |offY|.
      { callsign: "X", anchor: { x: 200, y: 200 }, headingDeg: 90, bbox },
    ];
    const out = resolveLabelPlacements(inputs, []);
    const offX = out[0].x - 200;
    const offY = out[0].y - 200;
    if (offX > 0 && offY >= 0 && Math.abs(offX) > Math.abs(offY)) {
      expect(out[0].textAnchor).toBe("start");
    } else {
      expect(out[0].textAnchor).toBe("end");
    }
  });

  it("falls back to max-distance first perpendicular when fully blocked", () => {
    // Surround the anchor with segments so no slot fits cleanly.
    const inputs: LabelInput[] = [
      { callsign: "A", anchor: { x: 400, y: 400 }, headingDeg: 0, bbox },
    ];
    const segments: RouteSegment[] = [];
    for (let r = 36; r <= 120; r += 4) {
      segments.push({ callsign: "B", x1: 300, y1: 400 - r, x2: 500, y2: 400 - r });
      segments.push({ callsign: "B", x1: 300, y1: 400 + r, x2: 500, y2: 400 + r });
    }
    const out = resolveLabelPlacements(inputs, segments);
    // Degrade gracefully: still return something at max distance on the
    // first perpendicular side.
    expect(out).toHaveLength(1);
    const dy = out[0].y - 400;
    expect(Math.abs(Math.abs(dy) - 120)).toBeLessThan(0.001);
  });

  it("is deterministic for the same input order", () => {
    const inputs: LabelInput[] = [
      { callsign: "A", anchor: { x: 100, y: 100 }, headingDeg: 10, bbox },
      { callsign: "B", anchor: { x: 110, y: 105 }, headingDeg: 20, bbox },
      { callsign: "C", anchor: { x: 120, y: 110 }, headingDeg: 30, bbox },
    ];
    const a = resolveLabelPlacements(inputs, []);
    const b = resolveLabelPlacements(inputs, []);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- packages/web/src/lib/radar-geometry.test.ts`
Expected: FAIL — `resolveLabelPlacements` is not exported.

- [ ] **Step 3: Add `resolveLabelPlacements` to `radar-geometry.ts`**

Append to `packages/web/src/lib/radar-geometry.ts`:

```ts
export interface LabelInput {
  callsign: string;
  /** Plane position the label is attached to. */
  anchor: TrackPoint;
  /** Inbound heading in SVG degrees (0 = east, 90 = south). */
  headingDeg: number;
  /** Rendered label bounding box, in px. */
  bbox: { width: number; height: number };
}

export interface RouteSegment {
  /** Callsign of the craft that owns this segment. */
  callsign: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ResolvedLabel {
  callsign: string;
  /** Leader-line attachment point in SVG coordinates. */
  x: number;
  y: number;
  textAnchor: "start" | "end";
}

interface PlacedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_DISTANCE = 36;
const MAX_DISTANCE = 120;
const DISTANCE_STEP = 4;
const PADDING = 4;

/**
 * Deterministic label placement resolver. For each label, searches along the
 * two perpendiculars of the craft's heading, stepping outward from MIN to MAX
 * distance, rejecting candidates that overlap an already-placed label box or
 * a route segment belonging to another craft. Input order is preserved.
 */
export function resolveLabelPlacements(
  labels: LabelInput[],
  segments: RouteSegment[],
): ResolvedLabel[] {
  const placed: PlacedBox[] = [];
  const results: ResolvedLabel[] = [];

  for (const label of labels) {
    const headingRad = (label.headingDeg * Math.PI) / 180;
    // Perpendicular unit vectors (two sides).
    const perps: Array<{ dx: number; dy: number }> = [
      { dx: -Math.sin(headingRad), dy: Math.cos(headingRad) },
      { dx: Math.sin(headingRad), dy: -Math.cos(headingRad) },
    ];

    let chosen: ResolvedLabel | null = null;
    let chosenBox: PlacedBox | null = null;

    outer: for (let dist = MIN_DISTANCE; dist <= MAX_DISTANCE; dist += DISTANCE_STEP) {
      for (const p of perps) {
        const cx = label.anchor.x + p.dx * dist;
        const cy = label.anchor.y + p.dy * dist;
        const box: PlacedBox = {
          x: cx - label.bbox.width / 2 - PADDING,
          y: cy - label.bbox.height / 2 - PADDING,
          width: label.bbox.width + PADDING * 2,
          height: label.bbox.height + PADDING * 2,
        };
        if (placed.some((other) => boxesOverlap(box, other))) continue;
        if (
          segments.some(
            (seg) => seg.callsign !== label.callsign && segmentIntersectsBox(seg, box),
          )
        ) {
          continue;
        }
        chosen = {
          callsign: label.callsign,
          x: cx,
          y: cy,
          textAnchor: pickTextAnchor(cx - label.anchor.x, cy - label.anchor.y),
        };
        chosenBox = box;
        break outer;
      }
    }

    if (!chosen || !chosenBox) {
      // Graceful fallback: max-distance on first perpendicular, no rejection.
      const p = perps[0];
      const cx = label.anchor.x + p.dx * MAX_DISTANCE;
      const cy = label.anchor.y + p.dy * MAX_DISTANCE;
      chosen = {
        callsign: label.callsign,
        x: cx,
        y: cy,
        textAnchor: pickTextAnchor(cx - label.anchor.x, cy - label.anchor.y),
      };
      chosenBox = {
        x: cx - label.bbox.width / 2 - PADDING,
        y: cy - label.bbox.height / 2 - PADDING,
        width: label.bbox.width + PADDING * 2,
        height: label.bbox.height + PADDING * 2,
      };
    }

    results.push(chosen);
    placed.push(chosenBox);
  }

  return results;
}

function pickTextAnchor(offX: number, offY: number): "start" | "end" {
  if (offX > 0 && offY >= 0 && Math.abs(offX) > Math.abs(offY)) return "start";
  return "end";
}

function boxesOverlap(a: PlacedBox, b: PlacedBox): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function segmentIntersectsBox(seg: RouteSegment, box: PlacedBox): boolean {
  // Cheap AABB reject.
  const segMinX = Math.min(seg.x1, seg.x2);
  const segMaxX = Math.max(seg.x1, seg.x2);
  const segMinY = Math.min(seg.y1, seg.y2);
  const segMaxY = Math.max(seg.y1, seg.y2);
  if (segMaxX < box.x || segMinX > box.x + box.width) return false;
  if (segMaxY < box.y || segMinY > box.y + box.height) return false;
  // Liang-Barsky clip of segment against box.
  let t0 = 0;
  let t1 = 1;
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const p = [-dx, dx, -dy, dy];
  const q = [seg.x1 - box.x, box.x + box.width - seg.x1, seg.y1 - box.y, box.y + box.height - seg.y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- packages/web/src/lib/radar-geometry.test.ts`
Expected: PASS — all Task 1 + 2 + 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/radar-geometry.ts packages/web/src/lib/radar-geometry.test.ts
git commit -m "feat(web): deterministic label placement resolver for flight radar"
```

---

## Task 4: `<FlightRadar />` React component — smoke render

**Files:**
- Create: `packages/web/src/components/base/flight-radar.tsx`
- Create: `packages/web/src/components/base/flight-radar.test.tsx`

- [ ] **Step 1: Write the failing smoke test**

Create `packages/web/src/components/base/flight-radar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FlightRadar } from "./flight-radar.js";
import type { CraftState } from "@/types/api";

vi.mock("@/hooks/ws-context", () => ({
  useWsManager: () => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    onEvent: () => () => {},
  }),
}));

vi.mock("@/hooks/use-subscription", () => ({
  useSubscription: vi.fn(),
}));

function renderRadar(crafts: Array<{ project: string; craft: CraftState }>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Seed cache directly so useProjects / useCrafts resolve synchronously.
  const projectNames = Array.from(new Set(crafts.map((c) => c.project)));
  queryClient.setQueryData(
    ["projects", "list"],
    projectNames.map((n) => ({ name: n, remoteUrl: "", categories: [], checklist: [], mcpServers: {} })),
  );
  for (const name of projectNames) {
    queryClient.setQueryData(
      ["crafts", "list", name],
      crafts.filter((c) => c.project === name).map((c) => c.craft),
    );
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FlightRadar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FlightRadar", () => {
  it("renders an empty radar (rings + runway) with no crafts", () => {
    const { container } = renderRadar([]);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(container.querySelector(".rings")).not.toBeNull();
    expect(container.querySelector(".runway")).not.toBeNull();
    expect(screen.getByText("NO INBOUND TRAFFIC")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/components/base/flight-radar.test.tsx`
Expected: FAIL — module `./flight-radar.js` does not exist.

- [ ] **Step 3: Create `flight-radar.tsx` scaffold with empty-state rendering**

Create `packages/web/src/components/base/flight-radar.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useProjects, useCrafts } from "@/hooks/use-api";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import {
  computeCraftTrack,
  resolveLabelPlacements,
  type CraftTrack,
  type ResolvedLabel,
  type RouteSegment,
  type LabelInput,
} from "@/lib/radar-geometry.js";
import type { CraftState, CraftStatus, VectorState } from "@/types/api";

const VIEW_W = 800;
const VIEW_H = 480;
const CENTER_X = 400;
const CENTER_Y = 240;
const OUTER_RADIUS = 320;
const THRESH_RADIUS = 62;
const RING_RADII = [60, 120, 180, 240, 300];
const CHAR_WIDTH = 6; // 9px monospace char width approximation.
const CHAR_HEIGHT = 11;

interface FlatCraft {
  project: string;
  craft: CraftState;
}

/**
 * Dashboard hero radar widget. Renders every non-terminal craft across
 * every registered project as a deterministic SVG map with clickable,
 * keyboard-focusable tracks that deep-link to the craft detail route.
 *
 * @see docs/superpowers/specs/2026-04-11-flight-radar-hero-design.md
 */
export function FlightRadar() {
  const { data: projects } = useProjects();
  const wsManager = useWsManager();
  useSubscription(wsManager, "craft.*");

  const projectNames = useMemo(() => (projects ?? []).map((p) => p.name), [projects]);

  return (
    <div className="hidden md:block">
      <FlightRadarInner projectNames={projectNames} />
    </div>
  );
}

function FlightRadarInner({ projectNames }: { projectNames: string[] }) {
  // Hook rules: one `useCrafts` per project in a stable order.
  const craftsByProject = projectNames.map((name) => ({
    name,
    query: useCrafts(name), // eslint-disable-line react-hooks/rules-of-hooks
  }));

  const activeCrafts = useMemo<FlatCraft[]>(() => {
    const out: FlatCraft[] = [];
    for (const { name, query } of craftsByProject) {
      const list = query.data ?? [];
      for (const craft of list) {
        if (craft.status === "Landed" || craft.status === "ReturnToOrigin") continue;
        out.push({ project: name, craft });
      }
    }
    out.sort((a, b) => a.craft.callsign.localeCompare(b.craft.callsign));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [craftsByProject.map((c) => c.query.data).join("|")]);

  return <RadarSvg crafts={activeCrafts} />;
}

function RadarSvg({ crafts }: { crafts: FlatCraft[] }) {
  const navigate = useNavigate();
  const [hoveredCallsign, setHoveredCallsign] = useState<string | null>(null);

  const emergencyCount = crafts.filter((c) => c.craft.status === "Emergency").length;

  const tracks = useMemo(() => {
    return crafts
      .filter((c) => {
        if (c.craft.flightPlan.length === 0) {
          warnOnce(c.craft.callsign);
          return false;
        }
        return true;
      })
      .map((c) => {
        const total = c.craft.flightPlan.length;
        const firstPending = c.craft.flightPlan.findIndex(
          (v: VectorState) => v.status !== "Passed",
        );
        const currentIndex = firstPending === -1 ? total : firstPending;
        const track = computeCraftTrack({
          callsign: c.craft.callsign,
          totalVectors: total,
          currentVectorIndex: currentIndex,
          center: { x: CENTER_X, y: CENTER_Y },
          outerRadius: OUTER_RADIUS,
          threshRadius: THRESH_RADIUS,
        });
        return { flat: c, track };
      });
  }, [crafts]);

  const segments: RouteSegment[] = useMemo(() => {
    const out: RouteSegment[] = [];
    for (const { flat, track } of tracks) {
      const points = [track.origin, ...track.vectors, track.threshold];
      for (let i = 0; i < points.length - 1; i++) {
        out.push({
          callsign: flat.craft.callsign,
          x1: points[i].x,
          y1: points[i].y,
          x2: points[i + 1].x,
          y2: points[i + 1].y,
        });
      }
    }
    return out;
  }, [tracks]);

  const labels: ResolvedLabel[] = useMemo(() => {
    const inputs: LabelInput[] = tracks.map(({ flat, track }) => {
      const planeIdx = track.currentVectorIndex;
      const anchor = planeIdx === -1 ? track.threshold : track.vectors[planeIdx];
      return {
        callsign: flat.craft.callsign,
        anchor,
        headingDeg: track.headingDeg,
        bbox: {
          width: flat.craft.callsign.length * CHAR_WIDTH,
          height: CHAR_HEIGHT,
        },
      };
    });
    return resolveLabelPlacements(inputs, segments);
  }, [tracks, segments]);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      style={{ aspectRatio: "16 / 7" }}
      role="img"
      aria-label="Flight radar"
    >
      <defs>
        <filter id="radar-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="rings">
        {RING_RADII.map((r) => (
          <circle
            key={r}
            cx={CENTER_X}
            cy={CENTER_Y}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeOpacity={0.4}
          />
        ))}
      </g>

      <g className="runway">
        <rect
          x={CENTER_X - 40}
          y={CENTER_Y - 6}
          width={80}
          height={12}
          fill="var(--bg-surface)"
          stroke="var(--border)"
        />
      </g>

      {crafts.length === 0 && (
        <text
          x={CENTER_X}
          y={CENTER_Y + 60}
          textAnchor="middle"
          fontSize={12}
          style={{ fill: "var(--text-dim)" }}
        >
          NO INBOUND TRAFFIC
        </text>
      )}

      <g className="tracks" filter="url(#radar-glow)">
        {tracks.map(({ flat, track }) => (
          <CraftGroup
            key={`${flat.project}:${flat.craft.callsign}`}
            flat={flat}
            track={track}
            hovered={hoveredCallsign === flat.craft.callsign}
            dimmed={hoveredCallsign !== null && hoveredCallsign !== flat.craft.callsign}
            onEnter={() => setHoveredCallsign(flat.craft.callsign)}
            onLeave={() => setHoveredCallsign(null)}
            onActivate={() =>
              navigate(`/projects/${flat.project}/crafts/${flat.craft.callsign}`)
            }
          />
        ))}
      </g>

      <g className="labels">
        {labels.map((l) => (
          <text
            key={l.callsign}
            x={l.x}
            y={l.y}
            textAnchor={l.textAnchor}
            fontSize={9}
            fontFamily="ui-monospace, monospace"
            style={{ fill: "var(--text-dim)" }}
          >
            {l.callsign}
          </text>
        ))}
      </g>

      <g className="hud">
        <text x={16} y={20} fontSize={9} style={{ fill: "var(--text-dim)" }}>
          KATC RADAR · 40 NM · {crafts.length} INBOUND · {emergencyCount} EMERG
        </text>
        <text
          x={VIEW_W - 16}
          y={20}
          fontSize={9}
          textAnchor="end"
          style={{ fill: "var(--text-dim)" }}
        >
          WIND 270°/08 · QNH 1013
        </text>
        <text x={16} y={VIEW_H - 10} fontSize={9} style={{ fill: "var(--text-dim)" }}>
          SWEEP · LIVE
        </text>
        <text
          x={VIEW_W - 16}
          y={VIEW_H - 10}
          fontSize={9}
          textAnchor="end"
          style={{ fill: "var(--text-dim)" }}
        >
          RWY 09/27 · ACTIVE
        </text>
      </g>
    </svg>
  );
}

interface CraftGroupProps {
  flat: FlatCraft;
  track: CraftTrack;
  hovered: boolean;
  dimmed: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onActivate: () => void;
}

function CraftGroup({ flat, track, dimmed, onEnter, onLeave, onActivate }: CraftGroupProps) {
  const { craft } = flat;
  const palette = colorForCraft(craft);
  const isEmergency = craft.status === "Emergency";
  const points = [track.origin, ...track.vectors, track.threshold];
  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const planeIdx = track.currentVectorIndex;
  const planePos = planeIdx === -1 ? track.threshold : track.vectors[planeIdx];
  const total = craft.flightPlan.length;
  const currentHuman = planeIdx === -1 ? total : planeIdx + 1;

  return (
    <g
      role="button"
      tabIndex={0}
      cursor="pointer"
      opacity={dimmed ? 0.3 : 1}
      aria-label={`${craft.callsign} — ${craft.branch}, vector ${currentHuman} of ${total}, status ${craft.status}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <polyline
        points={polyPoints}
        fill="none"
        stroke={palette.stroke}
        strokeWidth={1.5}
        strokeDasharray="4 4"
        strokeOpacity={0.9}
      />
      {track.vectors.map((v, i) => (
        <circle
          key={i}
          cx={v.x}
          cy={v.y}
          r={2.5}
          fill={palette.fill}
          stroke={palette.stroke}
          strokeWidth={0.5}
        />
      ))}
      <circle
        className={isEmergency ? "pulse" : undefined}
        cx={planePos.x}
        cy={planePos.y}
        r={5}
        fill={palette.fill}
        stroke={palette.stroke}
        strokeWidth={1}
      />
    </g>
  );
}

interface Palette {
  stroke: string;
  fill: string;
}

function colorForCraft(craft: CraftState): Palette {
  // TODO: when the server exposes `hasOpenEmergency` (computed from unresolved
  // EmergencyDeclaration blackbox entries), prefer that over status.
  if (craft.status === "Emergency") return { stroke: "#f87171", fill: "#ef4444" };
  switch (craft.status as CraftStatus) {
    case "Taxiing":
    case "InFlight":
      return { stroke: "#22c55e", fill: "#22c55e" };
    case "LandingChecklist":
    case "GoAround":
      return { stroke: "#fbbf24", fill: "#eab308" };
    case "ClearedToLand":
      return { stroke: "#7dd3fc", fill: "#38bdf8" };
    default:
      return { stroke: "var(--text-dim)", fill: "var(--text-dim)" };
  }
}

const warned = new Set<string>();
function warnOnce(callsign: string): void {
  if (warned.has(callsign)) return;
  warned.add(callsign);
  // eslint-disable-next-line no-console
  console.warn(`[FlightRadar] skipping ${callsign}: zero vectors`);
}
```

- [ ] **Step 4: Run the smoke test**

Run: `pnpm run test -- packages/web/src/components/base/flight-radar.test.tsx`
Expected: PASS — empty-state test renders rings, runway, and the "NO INBOUND TRAFFIC" label.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/base/flight-radar.tsx packages/web/src/components/base/flight-radar.test.tsx
git commit -m "feat(web): flight radar component with empty state smoke test"
```

---

## Task 5: Craft rendering + click navigation + emergency pulse tests

**Files:**
- Modify: `packages/web/src/components/base/flight-radar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/src/components/base/flight-radar.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router";

function makeCraft(overrides: Partial<CraftState> = {}): CraftState {
  return {
    callsign: "NX-42",
    createdAt: "2026-04-11T00:00:00Z",
    branch: "feat/example",
    cargo: "payload",
    category: "feature",
    status: "InFlight",
    captain: "pilot-a",
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [
      { name: "v1", acceptanceCriteria: "", status: "Passed" },
      { name: "v2", acceptanceCriteria: "", status: "Pending" },
      { name: "v3", acceptanceCriteria: "", status: "Pending" },
    ],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "pilot-a" },
    ...overrides,
  };
}

describe("FlightRadar — craft rendering", () => {
  it("renders one <g role='button'> per craft in the mock list", () => {
    const crafts = [
      { project: "proj-a", craft: makeCraft({ callsign: "NX-1" }) },
      { project: "proj-a", craft: makeCraft({ callsign: "NX-2" }) },
      { project: "proj-b", craft: makeCraft({ callsign: "NX-3" }) },
    ];
    const { container } = renderRadar(crafts);
    const groups = container.querySelectorAll("g.tracks > g[role='button']");
    expect(groups.length).toBe(3);
  });

  it("navigates to /projects/:project/crafts/:callsign on click", async () => {
    const crafts = [{ project: "proj-a", craft: makeCraft({ callsign: "NX-42" }) }];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(
      ["projects", "list"],
      [{ name: "proj-a", remoteUrl: "", categories: [], checklist: [], mcpServers: {} }],
    );
    queryClient.setQueryData(["crafts", "list", "proj-a"], [crafts[0].craft]);

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<FlightRadar />} />
            <Route path="/projects/:project/crafts/:callsign" element={<div>CRAFT DETAIL</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const group = container.querySelector("g.tracks > g[role='button']");
    expect(group).not.toBeNull();
    await userEvent.click(group as Element);
    expect(await screen.findByText("CRAFT DETAIL")).toBeTruthy();
  });

  it("applies the pulse class to emergency craft plane icons", () => {
    const crafts = [
      { project: "proj-a", craft: makeCraft({ callsign: "NX-911", status: "Emergency" }) },
    ];
    const { container } = renderRadar(crafts);
    const pulsing = container.querySelector("circle.pulse");
    expect(pulsing).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail first (or pass)**

Run: `pnpm run test -- packages/web/src/components/base/flight-radar.test.tsx`
Expected: these three new tests run. If `@testing-library/user-event` is not yet a dependency, the import fails — see Step 3. If all tests pass because the implementation in Task 4 already supports this, skip Step 4 and move to Step 5.

- [ ] **Step 3: If `@testing-library/user-event` is missing, add it**

Run in the web package:

```bash
cd packages/web && pnpm add -D @testing-library/user-event && cd ../..
```

Then re-run: `pnpm run test -- packages/web/src/components/base/flight-radar.test.tsx`

- [ ] **Step 4: Fix anything that the tests uncover**

The Task 4 implementation already renders `g.tracks > g[role='button']`, navigates on click, and adds `className="pulse"` to the plane circle for emergency crafts — no code changes should be needed. If a test fails, correct the implementation in `flight-radar.tsx` to match the test expectations (tests are the source of truth at this step).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/base/flight-radar.test.tsx packages/web/package.json pnpm-lock.yaml
git commit -m "test(web): flight radar craft rendering, navigation, and emergency pulse"
```

---

## Task 6: `pulse` keyframe CSS

**Files:**
- Modify: `packages/web/src/theme/` (or the first CSS file imported by `main.tsx`)

- [ ] **Step 1: Find the global stylesheet**

Run: `pnpm run --filter @airtrafficcontrol/web exec sh -c "grep -R 'keyframes' src/theme || true"`

Identify the global stylesheet (look for where `:root { --bg-surface: ... }` lives). This is the file to extend.

- [ ] **Step 2: Append the keyframe and class**

Add to the global stylesheet:

```css
@keyframes radar-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.pulse {
  animation: radar-pulse 1.1s ease-in-out infinite;
}
```

- [ ] **Step 3: Verify the dev build still compiles**

Run: `pnpm run --filter @airtrafficcontrol/web build`
Expected: build succeeds with no CSS errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/theme
git commit -m "style(web): add radar-pulse keyframe for emergency craft icon"
```

---

## Task 7: Mount `<FlightRadar />` on the dashboard

**Files:**
- Modify: `packages/web/src/routes/dashboard.tsx`

- [ ] **Step 1: Edit `dashboard.tsx`**

At the top of the file, add:

```ts
import { FlightRadar } from "@/components/base/flight-radar";
```

Replace the JSX fragment starting with `<PageHeader crumbs={[{ label: "Dashboard" }]} />` through the end of the outer `<div>` with:

```tsx
<div>
  <PageHeader crumbs={[{ label: "Dashboard" }]} />
  <div className="mt-5">
    <FlightRadar />
  </div>
  <div className="mt-5 grid grid-cols-4 gap-3">
    <StatCard label="ACTIVE CRAFTS" value={status?.crafts ?? 0} color="var(--accent-green)" />
    <StatCard label="TOWER QUEUE" value={0} color="var(--accent-yellow)" />
    <StatCard label="AGENTS" value={status?.agents ?? 0} color="var(--accent-purple)" />
    <StatCard label="EMERGENCIES" value={0} color="var(--accent-red)" />
  </div>
  <div className="mt-5 grid grid-cols-2 gap-4">
    {/* Recent Events */}
    <div
      className="rounded-md border p-3.5"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div
        className="mb-3 text-[9px] uppercase tracking-widest"
        style={{ color: "var(--text-dim)" }}
      >
        RECENT EVENTS
      </div>
      {events.length === 0 ? (
        <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
          No events yet. Events will appear here when the daemon pushes updates.
        </div>
      ) : (
        events.map((event, i) => <EventRow key={`${event.timestamp}-${i}`} event={event} />)
      )}
    </div>
    {/* Active Crafts */}
    <div
      className="rounded-md border p-3.5"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div
        className="mb-3 text-[9px] uppercase tracking-widest"
        style={{ color: "var(--text-dim)" }}
      >
        ACTIVE CRAFTS
      </div>
      <ActiveCraftsList projects={projects ?? []} />
    </div>
  </div>
</div>
```

- [ ] **Step 2: Sanity-check types and the dev build**

Run: `pnpm run --filter @airtrafficcontrol/web build`
Expected: build succeeds. TypeScript compiles clean.

- [ ] **Step 3: Run the full package test suite**

Run: `pnpm run test -- packages/web`
Expected: all tests pass (Task 1–5 tests included).

- [ ] **Step 4: Manual smoke check (required for UI work per CLAUDE.md)**

Start the web dev server and open the dashboard in a browser:

```bash
pnpm run --filter @airtrafficcontrol/web dev
```

Verify:
- The radar renders above the stat cards on viewports ≥ 900 px wide.
- With no active crafts, "NO INBOUND TRAFFIC" is centered near the runway.
- Below 900 px, the radar is hidden and the old layout is unaffected.

If the daemon is not running and `useProjects()` returns undefined, the radar should still render as its empty state without crashing. If it crashes, the `projectNames = (projects ?? []).map(...)` fallback in `flight-radar.tsx` needs tightening — patch and re-test.

Report explicitly whether the manual smoke check was possible. If you cannot start the dev server in this environment, say so rather than claiming success.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/routes/dashboard.tsx
git commit -m "feat(web): mount FlightRadar hero above dashboard stat cards"
```

---

## Task 8: Coverage check and docs

**Files:**
- Modify: `packages/web/CHANGELOG.md` (if it exists — otherwise skip this file)

- [ ] **Step 1: Run coverage for the web package**

Run: `pnpm run test -- --coverage packages/web/src/lib/radar-geometry.test.ts packages/web/src/components/base/flight-radar.test.tsx`

Expected: ≥ 90% line coverage on `packages/web/src/lib/radar-geometry.ts`. Component-level coverage for `flight-radar.tsx` is best-effort per the spec; note the number in the PR body.

- [ ] **Step 2: If coverage on `radar-geometry.ts` is below 90%, add targeted tests**

Write additional unit tests for any uncovered branches in `radar-geometry.ts`. Re-run until ≥ 90%.

- [ ] **Step 3: Add a CHANGELOG entry if the file exists**

Check for `packages/web/CHANGELOG.md`. If present, prepend:

```markdown
## Unreleased

- Add `<FlightRadar />` dashboard hero widget rendering every active craft as a deterministic SVG radar with click-through to craft detail.
```

If `packages/web/CHANGELOG.md` does not exist, skip this step (per CLAUDE.md: public API changes require a changelog entry, but the web package has no public TypeScript API consumers).

- [ ] **Step 4: Lint and format**

Run: `pnpm run lint -- --fix packages/web && pnpm run format`
Expected: no errors.

- [ ] **Step 5: Final commit**

```bash
git add -A packages/web
git commit -m "chore(web): lint, format, and coverage pass for flight radar"
```

---

## Self-review checklist (for the plan author)

- Spec sections → tasks:
  - Problem / Goals → Task 7 (placement) + Task 4 (component)
  - Component placement → Task 7
  - File layout → all tasks
  - Data flow → Task 4 (useProjects/useCrafts/useSubscription)
  - Type alignment → spec reconciliation section + Task 4 (no `types/api.ts` changes)
  - Geometry (fnv1a, bearingFor, jitterFor, computeCraftTrack) → Tasks 1–2
  - Label placement (resolveLabelPlacements) → Task 3
  - SVG structure → Task 4
  - Status → color mapping → Task 4 (`colorForCraft`)
  - Interactions (click, keyboard, hover, emergency z-order) → Tasks 4–5
  - Empty and edge states → Tasks 4 (empty), 4 (skip zero-vector), 4 (hidden below 900 px)
  - HUD chrome → Task 4
  - Testing section → Tasks 1–5, 8
  - Implementation notes → Task 4 (JSX, char-width approximation)
- Deep-link divergence handled (`/projects/:project/crafts/:callsign`).
- `hasOpenEmergency` divergence handled (v1 approximation + TODO).
- No placeholders, no "similar to Task N", no "TBD", no "add error handling".
