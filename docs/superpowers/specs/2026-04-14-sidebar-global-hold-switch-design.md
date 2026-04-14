# Sidebar Global Hold Switch — Design Spec

**Date:** 2026-04-14
**Status:** Approved
**Related Spec:** `docs/specification.md` §2.6 Temporary Flight Restriction, §4.5 TFR Protocol

## Summary

A `<GlobalHoldSwitch />` component pinned to the bottom of the web dashboard sidebar. It displays the state of the daemon's active global Temporary Flight Restrictions and offers a safety-cover interaction to issue or lift a global TFR in a single purposeful gesture. Always visible, regardless of the current route.

The switch is a surgical addition: it does not replace a general TFR management UI (deferred). It is the equivalent of a cockpit master-arm switch — one action, one purpose, intentionally hard to hit by accident.

## Design Decisions

- **Instant kill, hardcoded defaults.** When the switch is flipped ON, the component issues a TFR with `scope: "global"`, `target: null`, `mode: "immediate"`, `reason: "Sidebar kill switch"`, `issuedBy: "user"`. No reason prompt. The cover flip is the deliberate moment — adding a confirmation dialog would defeat the point of a panic switch.
- **Cover gates both activation and deactivation.** Accidentally lifting a TFR mid-debug is arguably worse than accidentally triggering one. The cover is about the switch itself, not one direction. Symmetric interaction model is easier to learn and matches real aircraft covers.
- **Aggregate state, bulk-lift.** The switch reflects "any active global TFR" rather than tracking a single TFR it personally issued. Flipping OFF lifts _all_ active global TFRs in parallel. Simple mental model for a panic switch. Sophisticated multi-TFR management belongs in a dedicated screen.
- **Two discrete clicks.** Click the cover to open it, click the switch to toggle. Hovering the cover previews the lift motion as a hint but does not commit. A single click-and-confirm would be faster but would lose the "cover is an object you open" mental model.
- **Mouse leave closes the cover.** If the user abandons the component while the cover is open, it re-closes after a 150ms grace period. The switch is protected by default; exposing it is a deliberate, sustained act.
- **Red active state with textual label rewrite.** When a TFR is active, the glass pulses red and the header rewrites to "● HOLD ACTIVE — GLOBAL HOLD". The information is carried in text, not color alone — accessible to color-blind users and screen readers.
- **Pessimistic commit with WebSocket sync.** UI waits for the server to confirm issue/lift before flipping state — no optimistic rollback races. A `tfr:global` WebSocket channel pushes external TFR changes so the switch reflects reality even when state is mutated by other clients or scripts.

## Visual Design

The component is ~72px tall, sits at the bottom of the sidebar via `mt-auto`, and renders within the existing 220px sidebar width. It uses the existing CSS custom properties (`--bg-surface`, `--border`, `--accent-green`, `--text-muted`, `--text-dim`) for theming consistency.

### Layers

1. **Frame** — dark surface with subtle border, 72px tall, relative position, `perspective: 400px` for the 3D glass rotation.
2. **Header label** — "GLOBAL HOLD" (8px, letter-spaced, dim gray) at the top.
3. **Switch area** — recessed inset-shadow panel containing the label "HOLD" and a macOS-style toggle switch.
4. **Glass cover** — absolutely positioned over the switch area. `transform-style: preserve-3d`, permanent 4° rest tilt. Children (LIFT label, grip tab) have `translateZ(0.5px)` so they rotate with the glass as a single 3D object.
5. **Etched LIFT label** — 9px letter-spaced, subtle `skewX(-4deg)`, sits just above the glass plane.
6. **Grip tab** — 28×5px ribbed bar at the bottom edge of the glass, mimicking a physical finger grip.

### States

| State | Cover | Switch | Glass tint | Header |
|---|---|---|---|---|
| `idle` | closed, 4° tilt | off | cool blue-white | "GLOBAL HOLD" (gray) |
| `hover` | rising ~10px, tilting to 22° | off | same | same |
| `open-idle` | flipped up (-42px, 78°) | off + pulsing green halo | warmer | same |
| `active` | closed, 4° tilt | on (red thumb + halo) | red gradient, 2s pulse | "● HOLD ACTIVE — GLOBAL HOLD" (red bullet, gray label) |
| `open-active` | flipped up | on + pulsing red halo | red outline on glass | same |
| `pending` (during POST) | as current | indeterminate sweep | same | same |
| `error` | forced open | as current | red border flash 600ms | hint text shows error |

### Animation timings

- Cover hover peek: 400ms cubic-bezier(0.2, 0.9, 0.3, 1.1)
- Cover open/close: 400ms, same curve
- Switch toggle: 300ms ease
- Active pulse: 2s ease-in-out infinite
- Halo pulse (open state): 1.6s ease-in-out infinite
- Post-commit cover auto-close: 400ms delay after response, then 400ms transition

### `prefers-reduced-motion`

When the user's OS prefers reduced motion:
- Disable the 2s active pulse
- Disable the halo pulses
- Drop the cover open/close transition to 120ms
- Disable the hover peek entirely
- Keep all state changes instantaneous but semantically identical

## Interaction Model

### States

The component tracks two axes of state:
- `cover`: `closed | open`
- `tfr`: `inactive | active`

Yielding four visible states plus transient `pending` and `error` overlays.

### Forward flow

1. User clicks the glass cover. Local state: `cover = open`. Start 6s inactivity timer, register document click-outside listener, Escape key listener, and mouseleave grace-period timer.
2. Focus automatically moves to the switch button (`ref.current.focus()` in a `useEffect`).
3. User clicks the switch. Component enters `pending` state, disables further switch clicks, shows a sweep animation on the thumb and hint text "Issuing hold..." or "Lifting hold...".
4. POST request fires. See Server Integration below.
5. On success: commit `tfr` state change, schedule 400ms `setTimeout` → `cover = closed`.
6. On error: render `error` overlay for 600ms, leave cover open with an error hint.

### Abandon paths (cover open, no commit)

| Trigger | Behavior |
|---|---|
| Mouse leaves frame bounding box | 150ms grace timer starts. Re-entry cancels. Timeout closes cover. |
| Click outside the frame | Close cover immediately. |
| Escape key | Close cover immediately, return focus to cover button. |
| 6s inactivity timer elapses | Close cover. Belt-and-suspenders safety net. |

### Direction semantics

- `tfr: inactive → active`: POST `/api/v1/tfrs` once. On success, add `identifier` to local active list.
- `tfr: active → inactive`: Iterate every id in the local active list, POST `/api/v1/tfrs/:id/lift` in parallel via `Promise.all`. On all-success, clear the list. On partial failure, keep surviving ids and surface the error.

### External changes (WebSocket)

- If a `tfr:global` event arrives while cover is closed: update `tfr` state silently, use the normal transition animation.
- If a `tfr:global` event arrives while cover is open: update `tfr` state but do not close the cover. The user opened the cover to act; don't steal focus.

## Server Integration

### Initial load

On component mount:

```
GET /api/v1/tfrs?active=true
```

Filter client-side for `scope === "global"`. Cache the `identifier` of each matching record. Set `tfr = active` if the list is non-empty, `idle` otherwise.

On 5xx or network error: render `idle` with a small warning dot near the header and tooltip "TFR status unavailable". The switch remains operable; errors surface at commit time.

### Issue (inactive → active)

```
POST /api/v1/tfrs
Content-Type: application/json

{
  "scope": "global",
  "target": null,
  "mode": "immediate",
  "reason": "Sidebar kill switch",
  "issuedBy": "user"
}
```

Expect `201 Created` with a `TfrState` body. Append `identifier` to the local active list, flip `tfr = active`.

### Lift (active → inactive)

For each `id` in the local active list:

```
POST /api/v1/tfrs/:id/lift
```

Requests fire in parallel via `Promise.all`. Outcomes:

- **All-success:** clear the local active list, flip `tfr = inactive`.
- **Partial failure:** remove only the successful ids from the list. Keep `tfr = active`. Show an error in the hint text: "Failed to lift N of M global TFRs." Red outline flash on the frame for 600ms.
- **Total failure:** leave `tfr = active`, show error in the hint text, cover stays open for retry.

### Pessimistic commit UX

During the POST:
- Replace the switch halo pulse with a thin indeterminate sweep on the thumb
- Hint text: "Issuing hold..." or "Lifting hold..."
- Switch button gets `aria-busy="true"` and pointer-events disabled
- On response, clear the loading state and commit (or show error)

### Error handling

- Catch POST errors at the hook level.
- On failure, the hook throws; the component catches, flashes a red outline on the frame for 600ms, updates hint text to the error message, leaves the cover open.
- Log to `console.error` with the request context.
- **No automatic retry.** Kill switches should fail loudly.

### WebSocket sync: `tfr:global` channel

This requires a new daemon-side publication.

**Daemon changes** (`packages/daemon/src/server/routes/tfr.ts`):

1. After `app.tfrStore.set(tfr)` in the POST route, if `tfr.scope === "global"`:
   ```ts
   app.channelRegistry.publish("tfr:global", {
     type: "tfr.issued",
     tfr,
   });
   ```
2. After `app.tfrStore.set(lifted)` in the lift route, if `lifted.scope === "global"`:
   ```ts
   app.channelRegistry.publish("tfr:global", {
     type: "tfr.lifted",
     tfr: lifted,
   });
   ```

No new code in `channels.ts` — the `ChannelRegistry` matches channel names dynamically.

**Client subscribes** via the existing `useSubscription` hook pattern:

- On `{ type: "tfr.issued", tfr }`: add `tfr.identifier` to the local active list, set `tfr = active`.
- On `{ type: "tfr.lifted", tfr }`: remove `tfr.identifier` from the local active list; if empty, set `tfr = inactive`.

### Race condition handling

- User-initiated POST in flight + WebSocket event for the same id arrives: reconcile by identifier. Idempotent; duplicate handling is a no-op.
- WebSocket arrives before POST resolves: WS handler updates state first; POST resolution confirms the already-known id.

## Code Structure

### New files

```
packages/web/src/components/layout/global-hold-switch.tsx
packages/web/src/components/layout/global-hold-switch.module.css
packages/web/src/components/layout/global-hold-switch.test.tsx
packages/web/src/hooks/use-global-tfr.ts
packages/web/src/hooks/use-global-tfr.test.ts
```

### Modified files

```
packages/web/src/components/layout/sidebar.tsx           (add <GlobalHoldSwitch /> at bottom via mt-auto)
packages/daemon/src/server/routes/tfr.ts                 (publish on tfr:global channel)
packages/daemon/src/server/routes/tfr.test.ts            (assert pub/sub payload on issue/lift)
packages/daemon/CHANGELOG.md                             (document new channel)
docs/rest_api.md                                         (document new channel under TFR section)
packages/docs/docs/reference/rest-api.md                 (mirror)
```

### `useGlobalTfr()` hook contract

```ts
export type GlobalTfrState = "loading" | "idle" | "active" | "unknown";

export function useGlobalTfr(): {
  state: GlobalTfrState;
  activeIds: readonly string[];
  pending: boolean;
  error: Error | null;
  issue(): Promise<void>;
  lift(): Promise<void>;
};
```

Internals:
- TanStack Query for initial `GET /api/v1/tfrs?active=true` fetch, filtered client-side for `scope === "global"`.
- `useSubscription("tfr:global", handler)` for WebSocket events.
- Mutations wrap the POST calls; `pending` is true while any mutation is in-flight.
- `error` is the most recent failure; cleared on next successful action.

### `<GlobalHoldSwitch />` component contract

- Consumes `useGlobalTfr()`.
- Owns only UI state: `coverOpen`, local mirror of `pending`/`error`, refs for auto-focus.
- Effects:
  - Click-outside: bound while `coverOpen`, targets `document`.
  - Escape key: bound while `coverOpen`, targets `document`.
  - 6s inactivity timer: started when `coverOpen` becomes true, cleared on close.
  - 150ms mouseleave grace timer: started on `mouseleave`, cancelled on `mouseenter`.
  - 400ms post-commit close timer: triggered after successful mutation.
  - Focus management: move focus to switch on open, back to cover button on close.

### Accessibility contract

- **Cover** is a `<button>` with:
  - `aria-label="Global flight hold safety cover"`
  - `aria-expanded={coverOpen}`
  - `aria-controls={switchId}`
  - Focusable, Enter/Space opens the cover.
- **Switch** is a `<button>` with:
  - `role="switch"`
  - `aria-checked={tfrActive}`
  - `aria-label="Global flight hold"`
  - `aria-busy={pending}`
  - `tabIndex={coverOpen ? 0 : -1}` — not a tab stop when cover is closed.
- **When cover opens**, focus moves to the switch.
- **Escape** closes cover and returns focus to the cover button.
- **Live region** (`<div className="sr-only" aria-live="polite">`) announces:
  - "Global flight hold issued"
  - "Global flight hold lifted"
  - "Global flight hold failed: {message}"
- **`prefers-reduced-motion`** disables pulse animations, shortens cover transitions, disables hover peek.

### Testing

**Unit — `use-global-tfr.test.ts`:**
- Initial fetch populates `activeIds` correctly (filters out non-global).
- Fetch error sets `state = "unknown"`.
- `issue()` POSTs with correct body, appends returned id, flips state.
- `lift()` fires parallel lift requests, clears on all-success, keeps survivors on partial failure.
- WebSocket `tfr.issued` event updates state.
- WebSocket `tfr.lifted` event removes id; clears state when last id lifted.
- Race: WS event arrives before mutation resolves — state remains consistent.

**Component — `global-hold-switch.test.tsx`:**
- Initial render in each state (`loading`, `idle`, `active`, `unknown`).
- Click cover → opens; focus moves to switch.
- Click switch → calls `issue()` or `lift()`; cover auto-closes on success.
- Click outside → closes cover.
- Escape → closes cover, focus returns.
- Mouse leave → grace period; re-entry cancels; timeout closes.
- 6s inactivity timer closes cover.
- `pending` shows loading indicator and sets `aria-busy`.
- Error path shows red flash and hint text.
- `prefers-reduced-motion` disables pulses.

**Daemon — `tfr.test.ts` additions:**
- Assert `channelRegistry.publish` is called with `tfr:global` and the correct payload on issue and lift of global-scoped TFRs.
- Assert **no** publish on `tfr:global` for project/craft-scoped TFRs.

## Out of Scope

The following are **explicitly out of scope** for this spec. Each is already tracked on `docs/roadmap.md` under "Temporary Flight Restrictions":

- Enforcing `holdingPattern` across daemon action handlers (RULE-TFR-6).
- Graceful-mode wind-down window (RULE-TFRP-1).
- Agent auto-resume on lift (RULE-TFRP-4).
- Intercom notifications for TFR events (RULE-TFRP-6).
- Tower-initiated TFR gating via project config (RULE-TFR-4).
- Cross-project fan-out for global-scope TFRs on craft `holdingPattern` (the route currently only updates crafts when `projectName` is supplied).
- General TFR management UI (list all TFRs, filter, issue project/craft scope, view history).

This spec is a surgical addition. The broader TFR integration work is separate.
