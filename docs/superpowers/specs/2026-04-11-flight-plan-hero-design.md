# Flight Plan Hero Widget

**Date:** 2026-04-11
**Scope:** `@atc/web` craft detail page, `@atc/daemon` craft state
**Status:** Design

## Goal

Add a new hero widget to the craft detail page that makes the flight plan the primary focus point. The arc visualization encodes real segment durations geometrically — segments you spent longer on appear longer — so a glance at the widget communicates both progress and where time went. Aesthetic matches the existing tactical/HUD theme. The existing FLIGHT PLAN card (the tabular vector list with status chips) stays in place below the hero and serves the detailed view.

## Non-Goals

- Not replacing the existing detailed vector card (FLIGHT PLAN) with status chips and evidence — that stays below the hero as the detailed tabular view.
- Not introducing server-side pre-computed history records. The client derives durations from timestamps.
- Not handling real-time animation of the plane icon between renders. The plane snaps to its computed position on each data update.
- Not adding interactivity (clicking a waypoint, hovering tooltips) in this iteration.

## Aesthetic Direction

Tactical HUD / radar display. Dark navy (`--bg-base`), phosphor-green passed segments with soft glow, amber current segment with stronger glow, dim dashed blue pending segments, monospace `JetBrains Mono` labels. Faint radar rings and crosshair grid in the background.

This is a continuation of the existing theme in `packages/web/src/theme/variables.css` — no new global tokens required.

## Geometry

All positions are derived mathematically; no magic numbers beyond the few tunable constants. The widget is rendered as a single `<svg>` with a fixed viewBox of `0 0 900 320`.

### The Arc

```
cx = 450
cy = 560
r  = 400
arcStartDeg = -124    // left endpoint
arcEndDeg   = -56     // right endpoint
arcSweepDeg = 68      // arcEndDeg - arcStartDeg
```

Point at normalized position `t ∈ [0,1]` along the arc:

```
angleDeg(t) = arcStartDeg + arcSweepDeg * t
angleRad    = angleDeg * π / 180
P(t) = (cx + r·cos(angleRad), cy + r·sin(angleRad))
```

At `t=0` the point is `(226.32, 228.40)` (depart); at `t=1` it's `(673.68, 228.40)` (land); at `t=0.5` it sits at `(450, 160)` (top of the arc).

### Segment Layout

Given N vectors with segment durations `d[0]..d[N-1]` (where segment `i` is the span of work from the previous waypoint to vector `i`, and segment 0 is depart → V1), compute normalized cumulative fractions:

```
total = sum(d)
t[i] = (d[0] + d[1] + ... + d[i]) / total   // waypoint i sits at t[i]
t[-1] = 0                                    // depart is at t=0
```

Each segment is rendered as an SVG path:

```
M P(t[i-1])  A r r 0 0 1  P(t[i])
```

Since all endpoints lie on the same circle of radius `r`, consecutive segments share tangents and read as a single continuous arc.

### Waypoints

At each `P(t[i])`, render a circle:

- **Passed**: fill `--bg-base`, stroke `--accent-green`, r=5
- **Current** (the first non-passed, non-failed vector): fill `--accent-yellow`, stroke `--accent-yellow`, r=6
- **Pending**: fill `--bg-base`, stroke `--text-dim`, r=5, stroke-width=1.5
- **Failed**: fill `--accent-red`, stroke `--accent-red`, r=6, with a small white X centered inside

A small `--accent-green` dot at depart (t=0). No special marker at land (t=1) beyond the final vector's waypoint.

### Plane Glyph

The plane uses this fixed path, drawn locally around the origin with the nose pointing up (-y):

```
M 0 -8 L 2 3 L 9 5 L 9 8 L 2 7 L 0 12 L -2 7 L -9 8 L -9 5 L -2 3 Z
```

Position and rotation depend on craft state:

- **InFlight / LandingChecklist / ClearedToLand**: position at the midpoint of the current segment. If the current segment is segment `i`, midpoint is `P((t[i-1] + t[i]) / 2)`.
- **Taxiing**: position at `P(0)` (depart).
- **Landed**: position at `P(1)` (land).
- **GoAround**: position at the failed vector's waypoint (loitering).
- **Emergency**: position at the midpoint of the current segment, recolored red, segment pulses (1.2s `ease-in-out infinite`).

Rotation to align with the flight direction at angle `θ`:

```
tangent = (-sin θ, cos θ)               // for SVG y-down, sweep=1
headingDeg = atan2(tangent.y, tangent.x) * 180 / π
planeRotation = headingDeg + 90         // path nose is at local -90°
```

### Label Rail

Vector labels live on a single horizontal rail above the arc. For N vectors, label x-positions are **equally spaced** regardless of segment durations:

```
leftMargin  = 90
rightMargin = 90
labelX(i) = leftMargin + (i / (N - 1)) * (width - leftMargin - rightMargin)
```

For N=6 on a 900-wide canvas: `90, 234, 378, 522, 666, 810`.

Each label is two lines:

- **Vector name** at y=68, font 10px, `--text-secondary` (or `--accent-yellow` if current, `--accent-red` if failed, `--accent-green` if all landed).
- **Duration** at y=79, font 8px, muted status-specific color: passed `#3a5a88`, pending `#2e4468`, current `#a88845`, failed `#8a3a3a`.

Durations format: `XXh XXm` for measured durations, `~XXh XXm` for pending estimates, `—` when the craft hasn't departed.

### Leader Callouts

Each label connects to its waypoint via a two-segment polyline:

```
points = [
  (labelX, 85),   // start (just below the duration text)
  (labelX, 100),  // short vertical drop (15px)
  waypoint.x, waypoint.y
]
```

Stroke `#2a3a5a`, 1px, no fill. Failed-vector leaders use `#6a2a2a` for a muted red tint.

### Background Decoration

- Three radar rings centered at `(cx, cy)`: radii `340`, `400`, `460`. Stroke `#162033`, 1px.
- Grid crosshair: horizontal line at y=228.4 (arc baseline), vertical line at x=450. Stroke `#0f1a2e`, 1px.
- Endpoint labels: "◆ DEPART" at `(226.32, 252)`, "LAND ◆" at `(673.68, 252)`. Font 9px letter-spaced, `--text-dim`.

### Four-Corner Stats

Four readouts, one in each corner of the widget, each with a small uppercase label and a larger value:

| Corner         | Label      | Value (normal)                       | Value (landed)      | Value (taxiing)       |
|----------------|------------|--------------------------------------|---------------------|-----------------------|
| top-left       | `ELAPSED`  | total elapsed since depart           | `TOTAL`, total flight time | `—`              |
| top-right      | `ETA`      | projected total time                 | `—`                 | `—`                   |
| bottom-left    | `PROGRESS` | `X / N VECTORS`                      | `N / N VECTORS`     | `0 / N VECTORS`       |
| bottom-right   | `STATUS`   | craft status text, amber             | `★ LANDED`, green   | `TAXIING`, dim        |

Labels `stat-lbl`: 8px, `--text-dim`, letter-spaced. Values `stat-val`: 13px, `--text-primary`, `tabular-nums`. Color overrides for Emergency (red), Landed (green), Current (amber).

## Duration Computation

### Data Source

1. **Segment end timestamps** come from `vector.reportedAt` in the existing API response (`@/types/api` `VectorState.reportedAt`). Already present.
2. **Segment start timestamps** are the previous vector's `reportedAt`, except for segment 0 which needs the craft creation timestamp. **This is not currently in `CraftState`** — we add it.

### Schema Change: `CraftState.createdAt`

Add a new required field `createdAt: string` (ISO-8601) to:

- `packages/daemon/src/types.ts`:`CraftState`
- `packages/daemon/src/server/routes/crafts.ts`: set `createdAt: new Date().toISOString()` in the creation block at line 85.
- `packages/web/src/types/api.ts`:`CraftState`

Since this is a new required field and existing persisted craft JSON files won't have it, the daemon's state loader should backfill missing `createdAt` with a sensible default on read — the earliest `blackBox` entry timestamp if one exists, otherwise the current time. The backfill lives in the craft store's read path. Persisted records are rewritten with the backfilled value on the next write.

No changes to `@atc/types` or `@atc/core` — `createdAt` is a daemon persistence / observation concern, not a domain rule.

### Segment Duration Algorithm (client-side)

Given `craft.createdAt`, `craft.flightPlan[i].reportedAt`, and `craft.flightPlan[i].status`, compute an array of segments:

```
segments[0].startTime = craft.createdAt
segments[i].startTime = flightPlan[i-1].reportedAt   // for i > 0
segments[i].endTime   = flightPlan[i].reportedAt     // or undefined if not reported
segments[i].status    = flightPlan[i].status
segments[i].isCurrent = (status === "Pending" && all prior are "Passed")
```

For each segment, determine `durationMs`:

1. If `endTime` is defined: `durationMs = endTime - startTime` (measured).
2. If segment is **current**: `durationMs = now - startTime` (live elapsed). Optionally update via a `setInterval(1000)` inside the component for the current segment only.
3. If segment is **pending**: `durationMs = averageMeasured` (see below).
4. If all segments are pending (Taxiing): every segment gets equal weight of 1.

`averageMeasured` = arithmetic mean of all segments in categories 1 and 2. Failed segments are included in the average (they represent real work done). If there are no measured segments yet, all pending segments use equal weight of 1.

Normalize to produce `t[i]` values as described in the Geometry section.

### Stats Computation

- **Elapsed**: `now - craft.createdAt` when the craft has departed, formatted as `Xh Ym` (or `Xh Ym Zs` if under 10 minutes total).
- **ETA**: `craft.createdAt + totalDurationMs` where `totalDurationMs` is the sum of measured + estimated segments. When landed, replaced by total flight time shown in the ELAPSED slot as TOTAL.
- **Progress**: `passedCount / totalVectors`.
- **Status**: derived from `craft.status` (`CraftStatus` enum) with a visual override table.

## State Variants

| Craft state         | Arc current seg | Plane position        | Stats color override | Special |
|---------------------|-----------------|-----------------------|----------------------|---------|
| Taxiing             | —               | depart (t=0)          | all dim              | durations = `—`, elapsed = `—` |
| InFlight            | amber glow      | mid current segment   | status amber         |         |
| LandingChecklist    | amber glow      | mid current segment   | status amber         |         |
| ClearedToLand       | amber glow      | mid current segment   | status amber         |         |
| GoAround            | red, no pulse   | at failed waypoint    | status red           | failed vector X mark  |
| Emergency           | red, pulsing    | mid current, red      | status red           | segment pulse animation |
| Landed              | —               | at t=1                | all green            | ELAPSED → TOTAL         |
| ReturnToOrigin      | treated as Landed visually | at t=1     | all dim              | status "RTO" dim        |

## Component Structure

New files under `packages/web/src/components/base/`:

- `flight-plan-hero.tsx` — the top-level `<FlightPlanHero craft={craft} />` component. Accepts the `CraftState` and renders the SVG.
- `flight-plan-hero.utils.ts` — pure functions: `computeSegments(craft)`, `computeWaypoints(segments, geom)`, `computeStats(craft, segments)`, `formatDuration(ms)`, `planeTransform(theta)`. Fully unit-testable without React.

Geometry constants live in `flight-plan-hero.utils.ts` as a single exported object:

```ts
export const HERO_GEOMETRY = {
  cx: 450, cy: 560, r: 400,
  arcStartDeg: -124, arcEndDeg: -56,
  viewBox: { w: 900, h: 320 },
  labelRail: { y: 68, dy: 11, margin: 90 },
  leaderKinkY: 100,
  leaderExitY: 85,
} as const;
```

### Styling

All colors reference `var(--*)` tokens from `theme/variables.css` except the four muted duration colors (`#3a5a88`, `#2e4468`, `#a88845`, `#8a3a3a`), which are defined as local constants in `flight-plan-hero.tsx`. If the team later wants these in the global token set, that's a followup.

The glow effects use SVG `filter` with `feDropShadow` on segment paths rather than CSS `drop-shadow` filters on the container, so they don't bleed into labels or layer over each other unexpectedly. Emergency pulse uses CSS `@keyframes emerg-pulse` scoped to the component via a CSS module or styled block.

### Live Ticking

A single `useEffect` starts a `setInterval(1000)` when the craft is in an active flight state (InFlight, LandingChecklist, ClearedToLand, Emergency, GoAround) to update the current segment's elapsed duration and the ELAPSED stat. No ticking in Taxiing or Landed.

## Integration

On `packages/web/src/routes/crafts/detail.tsx`, the new hero is inserted between the header block (line ~56) and the existing 2-column grid (line ~70):

```tsx
<div className="mt-5 flex items-start justify-between border-b pb-4" ...>
  ...header...
</div>
<div className="mt-4">
  <FlightPlanHero craft={craft} />
</div>
<div className="mt-4 grid grid-cols-2 gap-4">
  ...existing CREW + FLIGHT PLAN cards...
</div>
```

The existing FLIGHT PLAN card stays untouched — it serves the tabular vector list with status chips as the detail view.

## Testing

Unit tests in `flight-plan-hero.utils.test.ts`:

- `computeSegments`: measured durations, current live duration, pending fallback to average, all-pending fallback to equal weights, failed vectors counted in average.
- `computeWaypoints`: points lie on circle (distance to center = r within float tolerance), continuous tangents across segments, proportional to input weights, monotonic along the arc.
- `planeTransform`: rotation math produces tangent-aligned plane at each angle.
- `formatDuration`: covers seconds, minutes, hours, edge cases (0ms, negative guard).
- `computeStats`: ELAPSED/ETA/PROGRESS/STATUS per craft state.

Component-level: a handful of `@testing-library/react` renders per state variant (Taxiing, InFlight, GoAround, Emergency, Landed) using fixture CraftState objects. Assertions target rendered label text and SVG element presence rather than pixel positions.

Coverage target: 90% on changed files per `docs/contributing.md`.

## Files Changed

```
NEW  packages/web/src/components/base/flight-plan-hero.tsx
NEW  packages/web/src/components/base/flight-plan-hero.utils.ts
NEW  packages/web/src/components/base/flight-plan-hero.utils.test.ts
NEW  packages/web/src/components/base/flight-plan-hero.test.tsx
MOD  packages/web/src/routes/crafts/detail.tsx          (insert hero)
MOD  packages/web/src/types/api.ts                       (add createdAt to CraftState)
MOD  packages/daemon/src/types.ts                        (add createdAt to CraftState)
MOD  packages/daemon/src/server/routes/crafts.ts         (stamp createdAt on creation)
MOD  packages/daemon/src/state/craft-store.ts            (backfill on read)
MOD  packages/daemon/src/types.test.ts                   (update test fixtures)
MOD  packages/daemon/src/server/routes/*.test.ts         (update test fixtures that construct CraftState)
```

## Open Questions (for implementation planning)

- Should the ETA stat disappear in Taxiing, or show "—"? Current plan: `—`.
- When a flight plan has only 1 vector, how is the label rail distributed? Current plan: single label centered at width/2.
- How does the hero behave on narrow viewports? The SVG is responsive via `width: 100%` scaling of a fixed viewBox, so aspect ratio is preserved. No explicit mobile layout planned.
