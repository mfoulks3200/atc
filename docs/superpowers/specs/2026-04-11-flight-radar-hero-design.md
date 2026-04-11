# Flight Radar Hero Widget — Design

**Status:** Draft
**Date:** 2026-04-11
**Scope:** `@atc/web` dashboard

## Problem

The dashboard today leads with four stat cards (`ACTIVE CRAFTS`, `TOWER QUEUE`, `AGENTS`, `EMERGENCIES`) followed by two columns of lists (events + active crafts). It communicates counts but not shape: an operator cannot tell at a glance which crafts exist, how far along they are, or who is about to land. We want a hero visualization that frames the whole active fleet as a single aviation map the user can read without scrolling.

## Goals

- One-glance view of every active craft, its progress through its flight plan, and its status.
- Stable, deterministic layout: a craft's visual position is reproducible across renders and across operators looking at the same state.
- Live updates from WebSocket craft events without manual refresh.
- Clickable crafts that deep-link to the existing craft detail route.
- Zero domain logic in the web package — the widget reads typed API data and renders.

## Non-goals

- Geographic accuracy. Bearings are pseudo-random, not real compass headings.
- Sweep / flight animation beyond the pulsing emergency indicator.
- Runway selection, wind, QNH, or other HUD values wired to real data. HUD chrome displays flavor text only in v1.
- Mobile or narrow-viewport layout. Radar is hidden below 900 px.
- Configuration UI (ring count, color theme, etc.).

## Component

### Placement

The radar is a new component `<FlightRadar />` mounted in `packages/web/src/routes/dashboard.tsx` immediately after `<PageHeader>` and **above** the existing stat card row. The stat cards, recent events panel, and active crafts list remain unchanged below it.

Fixed 16:7 aspect ratio, full container width. The component owns its layout; the dashboard provides no width or height props.

### File layout

- `packages/web/src/components/base/flight-radar.tsx` — React component, SVG renderer, subscription wiring.
- `packages/web/src/lib/radar-geometry.ts` — Pure helpers (no React, no DOM).
- `packages/web/src/lib/radar-geometry.test.ts` — Vitest unit tests.

### Data flow

1. `FlightRadar` calls `useProjects()` to enumerate registered projects.
2. For each project, `useCrafts(project)` returns `CraftState[]`.
3. The list is flattened and filtered to crafts whose status is not `Landed` or `ReturnToOrigin`.
4. `useSubscription(wsManager, "craft.*")` listens for craft events; each event triggers `queryClient.invalidateQueries(["crafts", project])` for the affected project (already the pattern used elsewhere in the dashboard).
5. The radar re-renders whenever the flattened craft list changes by reference.

No polling. No local state beyond the hover-highlighted craft callsign.

### Type alignment

The radar consumes the existing `CraftState` type from `packages/web/src/types/api.ts`. It does not reach into `@atc/types` directly (the web package already maintains its own API-shaped types — see Known Spec Gaps). If `CraftState` is missing any field the radar needs, add it to `types/api.ts` as part of this work and keep the existing duplication convention.

Fields required per craft:
- `callsign: string` — stable identifier, drives bearing hash.
- `branch: string` — shown in the label.
- `status: CraftStatus` — drives color.
- `flightPlan.vectors: Vector[]` — ordered milestones.
- `hasOpenEmergency: boolean` — computed on the server from an unresolved `EmergencyDeclaration` blackbox entry; drives the red pulse. If not already exposed, add it.

If a craft has `flightPlan.vectors.length === 0`, the radar skips rendering it and logs a `console.warn` once per callsign.

### Geometry

Pure functions in `radar-geometry.ts`, unit-tested:

```ts
export function fnv1a(input: string): number;

// bearing in [0, 360)
export function bearingFor(callsign: string): number;

// per-vector angular jitter in [-5, 5] degrees
export function jitterFor(callsign: string, vectorIndex: number): number;

export interface TrackPoint { x: number; y: number; }

export interface CraftTrack {
  origin: TrackPoint;
  vectors: TrackPoint[];
  threshold: TrackPoint;
  // heading of the plane icon at its current vector, in SVG degrees (0 = east, 90 = south)
  headingDeg: number;
  // index into vectors[] where the plane icon sits; -1 if all vectors passed
  currentVectorIndex: number;
}

export function computeCraftTrack(input: {
  callsign: string;
  totalVectors: number;
  currentVectorIndex: number; // 0-based index of first non-passed vector
  center: TrackPoint;
  outerRadius: number;
  threshRadius: number;
}): CraftTrack;
```

`computeCraftTrack` is the single source of truth for where every dot, line, and plane icon renders. The React component consumes it and produces SVG elements; it never does geometry inline.

### Label placement

A second pure helper:

```ts
export interface LabelInput {
  callsign: string;
  anchor: TrackPoint;   // plane position
  headingDeg: number;   // inbound heading
  bbox: { width: number; height: number };
}

export interface RouteSegment {
  callsign: string;     // owning craft
  x1: number; y1: number; x2: number; y2: number;
}

export interface ResolvedLabel {
  callsign: string;
  x: number; y: number;        // leader attachment point in SVG coords
  textAnchor: "start" | "end"; // SVG text-anchor value
}

export function resolveLabelPlacements(
  labels: LabelInput[],
  segments: RouteSegment[],
): ResolvedLabel[];
```

Behavior (ported from the prototype, now deterministic and testable):
- Labels are placed along the perpendicular to each plane's heading.
- Minimum distance 36 px, maximum 120 px, 4 px steps.
- At each step try both perpendicular sides.
- Reject a candidate if its padded bbox overlaps any previously placed label bbox, or any route segment belonging to another craft.
- Text anchor rule: `start` only when the candidate is clearly below-right of the plane (`offX > 0 && offY >= 0 && |offX| > |offY|`). Otherwise `end`.
- Fall back to max-distance on the first perpendicular if no slot is found (graceful degradation; unit test captures this).

Input order is preserved so resolution is deterministic. The React component sorts crafts by callsign before calling the resolver.

### SVG structure

```
<svg viewBox="0 0 800 480" preserveAspectRatio="xMidYMid meet">
  <defs>
    <filter id="glow" .../>
    <!-- one linearGradient per craft for the fading final segment -->
  </defs>
  <g class="rings"> <!-- range rings + bearing spokes + bearing labels --> </g>
  <g class="runway"> <!-- runway rect, centerline, threshold bars, tower, labels --> </g>
  <g class="tracks" filter="url(#glow)">
    <!-- per-craft: dashed polyline, fading final segment, origin marker, vector dots, plane icon -->
  </g>
  <g class="labels"> <!-- resolved labels + leader lines --> </g>
</svg>
```

Constants live at the top of `flight-radar.tsx`: `CENTER_X = 400`, `CENTER_Y = 240`, `OUTER_RADIUS = 320`, `THRESH_RADIUS = 62`, `RING_RADII = [60, 120, 180, 240, 300]`.

### Status → color mapping

| `CraftStatus`                                         | Color role | Stroke     | Fill      |
| ----------------------------------------------------- | ---------- | ---------- | --------- |
| `Taxiing`, `InFlight`                                 | cruise     | `#22c55e`  | `#22c55e` |
| `LandingChecklist`, `GoAround`                        | hold       | `#fbbf24`  | `#eab308` |
| `ClearedToLand`                                       | final      | `#7dd3fc`  | `#38bdf8` |
| `Emergency` (or any craft with `hasOpenEmergency`)    | emergency  | `#f87171`  | `#ef4444` |

Terminal states (`Landed`, `ReturnToOrigin`) are filtered out upstream and never reach the radar. Emergency overrides any status color. The CSS class `.pulse` (1.1 s ease infinite, fades opacity to 0.3) is applied to the plane icon only.

The mapping lives as a single `colorForCraft(craft)` function in `flight-radar.tsx`, not in the geometry module.

### Interactions

- Each craft is a `<g>` wrapping the track, plane, and label. The group has `role="button"`, `tabIndex={0}`, `cursor: pointer`, and `aria-label={`${callsign} — ${branch}, vector ${n} of ${N}, status ${status}`}`.
- `onClick` / `onKeyDown` (Enter/Space) → `navigate(\`/crafts/${callsign}\`)` using `useNavigate()` from `react-router`.
- `onMouseEnter` → sets `hoveredCallsign` local state. Tracks and plane icons not matching `hoveredCallsign` drop to `opacity: 0.3`. The hovered craft renders at full opacity on top.
- `onMouseLeave` → clears hover. Keyboard focus behaves the same as hover.
- Emergency crafts are always painted last inside `.tracks` so their pulse is never occluded, regardless of hover state.

### Empty and edge states

- **Zero active crafts** — render the rings, runway, and HUD, with a centered muted text `"NO INBOUND TRAFFIC"` at the runway threshold. No tracks, no labels.
- **One craft** — no special case; the radar renders identically.
- **Viewport width < 900 px** — the hero is hidden via `className="hidden md:block"` (Tailwind). The dashboard falls back to today's layout.
- **Craft with zero vectors** — skipped with a `console.warn` (once per callsign per session), counted in the HUD total so the operator notices a discrepancy.

### HUD chrome

Corner labels remain flavor text in v1:
- Top-left: `"KATC RADAR · 40 NM"` + live inbound/emergency counts (these two are real).
- Top-right: `"WIND 270°/08"` + `"QNH 1013"` (static).
- Bottom-left: `"SWEEP · LIVE"` (static).
- Bottom-right: `"RWY 09/27 · ACTIVE"` (static).

## Testing

Per `docs/contributing.md`, 90% coverage on all changed files in `packages/web/src/lib/`. Coverage for `flight-radar.tsx` itself is best-effort via React Testing Library since SVG coordinate assertions are brittle.

- `radar-geometry.test.ts`:
  - `fnv1a` stability: same input → same hash; known-answer for at least three strings.
  - `bearingFor` determinism: same callsign → same bearing; different callsigns → (smoke-test) distribute across at least four quadrants for a fixed set of 20 sample names.
  - `jitterFor` bounds: always within `[-5, 5]`.
  - `computeCraftTrack` shape: `vectors.length === totalVectors`, first vector lies near origin ring, last vector lies near threshold ring, all vectors lie on or close to the base bearing within jitter tolerance.
  - `resolveLabelPlacements`:
    - Two labels with overlapping initial positions end up non-overlapping.
    - A label whose preferred perpendicular would cross another craft's segment is pushed out or flipped.
    - Text anchor rule cases: above, below-right, below-left, directly-above → asserts correct `textAnchor`.
    - Deterministic: same input order → same output twice in a row.

- `flight-radar.test.tsx` (React Testing Library):
  - Renders a runway + rings when given an empty craft list (smoke test).
  - Renders one SVG `<g>` per craft when given a fixed mock list.
  - Click on a craft group calls `navigate("/crafts/NX-42")` (mock router).
  - Craft with `hasOpenEmergency === true` has the `pulse` class on its plane icon.

## Implementation notes

- SVG rendering uses React JSX, not imperative `document.createElementNS`, because we have a typed data source and React's reconciler is the right tool. The imperative approach in the HTML prototype exists only because the mockup had no build step.
- The collision resolver needs DOM measurements only for *test* rendering; production text widths can be approximated from `text.length * charWidth` (char width = 6 px for the chosen 9 px monospace font). This keeps the resolver pure and testable without a headless browser. Accept the 1–2 px inaccuracy; 4 px padding absorbs it.
- Live WebSocket wiring should piggyback on whatever `useCrafts` already does for invalidation. If it does not yet invalidate on `craft.*` events, add that in the same change — note it in the PR description.
- The per-craft `<linearGradient>` for the fading final segment uses `gradientUnits="userSpaceOnUse"` with `x1/y1/x2/y2` set to the segment endpoints. One gradient per craft, id `fade-${callsign}` (stripped to alphanumerics).

## Out of scope / future work

- Animated sweep bar.
- Clicking a vector dot to jump to that vector in the craft detail.
- Hovering a track to show a tooltip with craft details (v2).
- Real wind / QNH / range sourced from config or project metadata.
- Tower-queue lane shown as a holding-pattern arc on the runway side.
- Responsive layout for sub-900 px viewports.

## Open questions

None. All decisions in the design above were confirmed during brainstorming (2026-04-11 session).
