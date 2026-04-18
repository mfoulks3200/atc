# Spotlight Onboarding Component — Design Spec

**Date:** 2026-04-18
**Status:** Approved
**Related Roadmap:** `docs/roadmap.md` — "First-run seeding / onboarding" (MVP)

## Summary

A reusable `<Spotlight>` primitive in `packages/web` that highlights a target element with a cut-out shade and a popover containing a header, body, and optional Back/Next navigation. Ships with one concrete consumer: a first-run onboarding tour.

Tours are plain data (`SpotlightTour` objects) registered with a `<SpotlightProvider>` at the app root. Any component can start a tour via `useSpotlight().start(tourId)`, or declare an auto-trigger with `<SpotlightAutoStart tourId when={...} />`. The user drives navigation — the tour never invokes the router; when a step's target isn't mounted, the overlay hides and reappears when the element returns.

The design is scoped to the web SPA. No changes to `@airtrafficcontrol/types` or other packages — the spotlight has no domain meaning.

## Design Decisions

- **Reusable primitive plus one tour.** The component library is generic; the first-run tour is its first consumer. Future tours (feature intros, contextual help) can be added without touching the primitive.
- **Target binding via `data-spotlight` attribute.** Steps reference targets by string ID (e.g., `targetId: "dashboard-new-craft"`). Target components render `<button data-spotlight="dashboard-new-craft">`. Decouples tour content from component refs and handles mount/unmount cleanly.
- **User-driven navigation across routes.** Tours never call the router. Steps may point to elements on any route; when the target is not mounted, the overlay is hidden and the tour stays active. When the target mounts, the overlay reappears. The highlighted element remains fully interactive — the UI itself is the CTA.
- **Cut-out shade with interactive target.** The overlay is rendered as four absolute-positioned rectangles around the target's bounding rect (top, bottom, left-strip, right-strip). The target has no overlay on top of it, so clicks pass through naturally. No CSS masks, no `pointer-events` gotchas.
- **Persistence via `localStorage`.** Completed or dismissed tours are remembered under key `atc.spotlight.v1` so they don't re-trigger. A `restart(tourId)` method clears the entry. No server-side persistence.
- **Auto-placement popover with override.** Placement tries `preferredSide` first, then falls back `bottom → top → right → left`, first fit wins. Tiny viewports center the popover with no arrow.
- **Minimal visual style (Variant B).** Popover is a compact card with no arrow and no accent bar. Progress shown as dots. Back/Next buttons right-aligned, `×` close button top-right. Keeps attention on the target, not the popover.

## Architecture

All new code lives in `packages/web/src/components/spotlight/`:

```
spotlight/
├── spotlight-provider.tsx   — <SpotlightProvider> at app root; owns tour state + persistence
├── spotlight-overlay.tsx    — 4-rect shade + popover, rendered via portal to document.body
├── spotlight-popover.tsx    — the popover card (title, body, dots, Back/Next/×)
├── spotlight-auto-start.tsx — <SpotlightAutoStart tourId when /> declarative trigger
├── use-spotlight.ts         — { start, stop, restart, next, back, activeTourId, activeStepIndex }
├── use-target-rect.ts       — tracks [data-spotlight="..."] rect via RO + scroll + MutationObserver
├── use-popover-placement.ts — picks side given rect + viewport + preferredSide
├── tours/
│   ├── index.ts             — registry: { "first-run": firstRunTour }
│   └── first-run.ts         — the concrete onboarding tour
├── types.ts                 — SpotlightTour, SpotlightStep, TourStatus
└── *.test.tsx               — colocated tests
```

The provider is added once in `main.tsx`, alongside `<BrowserRouter>` and `<QueryClientProvider>`. Pages opt into auto-start by dropping `<SpotlightAutoStart tourId="first-run" when={isFirstVisit} />` into their JSX. Any element can become a target by adding `data-spotlight="some-id"`.

## Public API

```ts
// types.ts
export interface SpotlightStep {
  id: string;                    // stable within the tour
  targetId: string | null;       // matches [data-spotlight="..."]; null for a centered welcome step with no target
  title: string;
  body: string;
  preferredSide?: "top" | "right" | "bottom" | "left";
}

export interface SpotlightTour {
  id: string;                    // stable forever; used as localStorage key
  steps: SpotlightStep[];
}

export type TourStatus = "completed" | "dismissed";
```

```ts
// use-spotlight.ts
export interface SpotlightController {
  activeTourId: string | null;
  activeStepIndex: number;
  start(tourId: string): void;         // no-op if tour already completed or dismissed
  restart(tourId: string): void;       // clears persistence then starts
  stop(): void;                        // marks dismissed, ends tour
  complete(): void;                    // marks completed, called after final Next
  next(): void;                        // advances; calls complete() at end
  back(): void;                        // clamped at 0
  isComplete(tourId: string): boolean;
}

export function useSpotlight(): SpotlightController;
```

```tsx
// usage
<SpotlightProvider tours={{ "first-run": firstRunTour }}>
  <App />
</SpotlightProvider>

// inside a page
<SpotlightAutoStart tourId="first-run" when={isFirstVisit} />

// inside any component that wants to trigger
const spotlight = useSpotlight();
<button onClick={() => spotlight.restart("first-run")}>Replay tour</button>
```

## Persistence

Storage key: `atc.spotlight.v1`

Shape:

```json
{
  "first-run": { "status": "completed", "at": "2026-04-18T12:00:00Z" }
}
```

- `status` is `"completed"` (user reached the final Next) or `"dismissed"` (user hit × or `stop()` was called).
- Both statuses prevent `start()` from triggering the tour again; only `restart()` clears the entry.
- The `.v1` suffix reserves the shape — a future migration bumps to `.v2` rather than mutating in place.
- Persistence failures (quota exceeded, storage disabled) are swallowed with a `console.warn`. The tour still runs; it just won't remember completion.

## Rendering

### Overlay

Rendered into a portal on `document.body` so it escapes page stacking contexts:

- Four absolutely-positioned `<div>`s, one for each rectangle around the target rect (top, bottom, left-strip, right-strip).
- Backdrop color `rgba(0, 0, 0, 0.6)`, 150ms fade-in on tour start.
- The target element itself has no overlay on top, so it remains fully interactive with normal pointer events.
- No `pointer-events: none` anywhere — clicks on the shade hit the shade (no-op); clicks on the target hit the target.
- When a step has `targetId: null`, the overlay renders a single full-viewport shade rect with no cut-out, and the popover is centered in the viewport (the "welcome" layout).

### Popover (Variant B — minimal + dots)

- Card: `background: #10182a`, 1px border `#2a3a5a`, 10px radius, soft drop shadow.
- Padding 16px; title 14px/600 weight in `#fff`; body 12px in `#a8b4c8`, 1.55 line-height.
- Bottom row: progress dots on the left (filled for completed steps, highlighted for current, empty for future), Back/Next buttons on the right.
- `×` close button top-right; calls `stop()`.
- No arrow, no accent bar — keeps visual weight low.
- Width 260px, max-width 90vw.

### Keyboard

- `Esc` — calls `stop()`.
- `→` / `Enter` — calls `next()` when the popover has focus.
- `←` — calls `back()` when the popover has focus.
- Popover auto-focuses its primary button on step change so keyboard navigation works immediately.
- No focus trap — the user should be able to tab to the highlighted target.

## Placement algorithm

`use-popover-placement.ts` accepts target rect, popover dimensions, and viewport size, returns `{ top, left, side }`:

1. If `preferredSide` is set and the popover plus a 12px gutter fits fully on-screen there, use it.
2. Otherwise try `bottom`, `top`, `right`, `left` in order — first that fits wins.
3. If none fit (very small viewport, or target fills screen), center the popover in the viewport.
4. Along the perpendicular axis, align the popover's center with the target's center, then clamp to stay 12px inside the viewport edge.

The hook re-runs on every rect update so the popover follows the target if the page scrolls or resizes.

## Target tracking

`use-target-rect(targetId)` returns the current `DOMRect` of the element matching `[data-spotlight="${targetId}"]`, or `null` if no such element is in the DOM:

- One `ResizeObserver` observes the target.
- `window.addEventListener("scroll", ..., { passive: true, capture: true })` catches scrolls on any ancestor.
- `window.addEventListener("resize", ...)` catches viewport changes.
- A single `MutationObserver` on `document.body` (childList + subtree) watches for the target appearing or disappearing. When it appears, rebind the `ResizeObserver`. When it disappears, return `null` and the overlay hides itself.
- All updates funnel through `requestAnimationFrame` to coalesce bursts.

When `useTargetRect` returns `null`:
- The overlay renders nothing (no shade, no popover).
- The tour stays active — `activeTourId` and `activeStepIndex` are unchanged.
- After 30s with a null rect for the current step, `stop()` is called and a `console.warn` is emitted. Prevents a tour from being permanently orphaned if a target was removed.

## First-run tour content

`tours/first-run.ts`:

```ts
export const firstRunTour: SpotlightTour = {
  id: "first-run",
  steps: [
    { id: "welcome",       targetId: null,                      title: "Welcome to ATC",
      body: "ATC coordinates autonomous agents working on your code. Let's set up your first project." },
    { id: "projects-nav",  targetId: "sidebar-projects",        title: "Start with a project",
      body: "Projects are the repos ATC manages. Click Projects in the sidebar to continue." },
    { id: "new-project",   targetId: "projects-new-button",     title: "Create your first project",
      body: "Point ATC at a local repo. You can use a scratch repo to try things out." },
    { id: "new-craft",     targetId: "dashboard-new-craft",     title: "Launch your first craft",
      body: "A craft is a unit of work. Click New Craft when you're ready to assign a pilot." },
  ],
};
```

The tour is triggered from the dashboard page with:

```tsx
<SpotlightAutoStart tourId="first-run" when={!hasAnyProject} />
```

`hasAnyProject` comes from the existing projects query. The tour runs once; after completion or dismissal it does not re-appear.

Targets needed: `data-spotlight="sidebar-projects"` on the sidebar Projects link, `data-spotlight="projects-new-button"` on the New Project button, `data-spotlight="dashboard-new-craft"` on the dashboard's New Craft button.

## Testing plan

Colocated `*.test.tsx` files using Vitest + @testing-library/react, matching existing `packages/web/src/**/*.test.{ts,tsx}` patterns:

- `use-target-rect.test.ts` — rect updates on simulated resize, returns `null` when target unmounts, re-binds when target remounts.
- `use-popover-placement.test.ts` — respects `preferredSide` when it fits, falls back in order when it doesn't, centers on tiny viewports, clamps to viewport edges.
- `spotlight-overlay.test.tsx` — renders four shade rects with correct geometry for a given target rect, popover appears in the portal, `Esc` calls `stop()`, arrow keys call `next()`/`back()`.
- `spotlight-provider.test.tsx` — `start()` is a no-op for completed tours, `restart()` clears persistence and starts, `stop()` marks dismissed, `<SpotlightAutoStart>` triggers only when `when` is true and no persisted entry exists.
- `tours/first-run.test.ts` — tour progresses through all steps, `complete()` is called after final Next, step `targetId`s are non-empty strings.

Coverage target: 90% on new files, matching the repo contribution rules.

No Playwright e2e test in this spec. The existing smoke suite will continue to pass (spotlight is opt-in). A dedicated e2e for the tour is a follow-up in `docs/roadmap.md` if we want it.

## Out of scope

These are explicitly not in this spec; tracked separately in `docs/roadmap.md` if pursued:

- Analytics / telemetry on tour completion rates.
- Internationalization (tour content is English-only).
- A "Help → restart tour" menu UI. The `restart()` API exists; the UI to surface it ships later.
- Multi-tour queueing. Only one tour can be active at a time; calling `start()` while a tour is active is a no-op and logs a warning.
- Server-side persistence of tour state (e.g., synced per user account). Scoped to the browser for now.
- Tour authoring UI. Tours are code.

## Dependencies

None beyond what `packages/web` already uses:

- React 18 (existing)
- React portals via `react-dom` (existing)
- No new npm packages

## Risks

- **Target ID collisions.** Two elements with the same `data-spotlight` would cause the overlay to bind to whichever `querySelector` returns first. Mitigated by using namespaced IDs (`dashboard-new-craft`, not `new-craft`) and a console warning when `document.querySelectorAll` finds more than one match.
- **Layout shifts during a tour.** If the target's size changes mid-step (e.g., content loads in), the cut-out follows via `ResizeObserver`. If the popover placement becomes invalid, the placement hook re-runs and relocates the popover.
- **First-run detection.** `!hasAnyProject` is a proxy for "new user" — a user who deleted all their projects would see the tour again. Acceptable for this scope; a dedicated "has seen tour" bit is already implied by the persistence layer.
