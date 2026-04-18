# Spotlight Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reusable `<Spotlight>` primitive in `packages/web` plus a first-run onboarding tour that highlights Projects → New Project → New Craft.

**Architecture:** A `<SpotlightProvider>` at the app root owns tour state, persistence (`localStorage`), and portal-rendered overlay. Tours are plain-data `SpotlightTour` objects referencing targets by string ID. Targets opt in by adding `data-spotlight="<id>"`. The overlay renders four shade rectangles around the target rect so the target stays interactive. Placement picks a side that fits; target tracking uses `ResizeObserver` + scroll listeners + a `MutationObserver` to re-bind across route changes.

**Tech Stack:** React 19, React Router 7, Vitest, @testing-library/react, jsdom, Tailwind v4. Existing CSS custom properties (`--bg-surface`, `--border`, `--accent-green`, etc.) reused for theming.

**Related Spec:** `docs/superpowers/specs/2026-04-18-spotlight-design.md`

---

## Pre-flight

All file paths in this plan are relative to repo root `/Users/mfoulks/Documents/git/atc`.

Path alias: the repo uses `@/` for `packages/web/src` (configured in `vite.config.ts` and root `vitest.config.ts`). Imports inside `packages/web/src` should use `@/...` absolute paths. Colocated imports (`./foo`) are fine within the same directory.

Test runner: root-level `pnpm run test` runs Vitest across all packages. To run a single file during development:

```bash
pnpm run test -- packages/web/src/components/spotlight/use-target-rect.test.ts
```

Existing test patterns to follow: see `packages/web/src/components/layout/global-hold-switch.test.tsx` for React component testing style (Vitest + `@testing-library/react`, `vi.mock` for dependencies, `vi.useFakeTimers` for timers).

**Commit style:** The repo uses conventional commits (`feat(web):`, `fix(web):`, `test(web):`, `chore(web):`). Match this.

---

## File Structure

All new files live under `packages/web/src/components/spotlight/`:

| File | Responsibility |
|---|---|
| `types.ts` | `SpotlightStep`, `SpotlightTour`, `TourStatus`, `TourRecord` interfaces |
| `persistence.ts` | Read/write `localStorage` under `atc.spotlight.v1` |
| `use-target-rect.ts` | Hook: tracks `[data-spotlight="<id>"]` bounding rect |
| `use-target-rect.test.ts` | Hook tests |
| `use-popover-placement.ts` | Hook: picks side + coordinates for popover |
| `use-popover-placement.test.ts` | Placement tests |
| `spotlight-popover.tsx` | Popover card component (title/body/dots/Back/Next/×) |
| `spotlight-popover.test.tsx` | Popover tests |
| `spotlight-overlay.tsx` | Portal root: shade rects + popover, handles keyboard |
| `spotlight-overlay.test.tsx` | Overlay tests |
| `spotlight-provider.tsx` | `SpotlightProvider` context + `useSpotlight` hook |
| `spotlight-provider.test.tsx` | Provider + hook tests |
| `spotlight-auto-start.tsx` | `<SpotlightAutoStart tourId when />` component |
| `spotlight-auto-start.test.tsx` | Auto-start tests |
| `tours/first-run.ts` | First-run tour definition |
| `tours/index.ts` | Tour registry export |
| `index.ts` | Barrel export for consumers |

Modified files:

| File | Change |
|---|---|
| `packages/web/src/main.tsx` | Wrap `<App>` with `<SpotlightProvider tours={tours}>` |
| `packages/web/src/components/layout/sidebar.tsx` | Add `data-spotlight="sidebar-projects"` to Projects NavLink |
| `packages/web/src/routes/projects/list.tsx` | Add `data-spotlight="projects-new-button"` to New Project button |
| `packages/web/src/routes/projects/detail.tsx` | Add `data-spotlight="project-new-craft-button"` to New Craft link |
| `packages/web/src/routes/dashboard.tsx` | Add `<SpotlightAutoStart tourId="first-run" when={!hasAnyProject} />` |

Note on target ID: the spec uses `dashboard-new-craft` but the actual "+ New Craft" button lives on the project detail page, not the dashboard. This plan uses `project-new-craft-button` instead — if the user disagrees, flag it before starting Task 8.

---

## Task 1: Scaffolding — directory, types, barrel

**Files:**
- Create: `packages/web/src/components/spotlight/types.ts`
- Create: `packages/web/src/components/spotlight/index.ts`

- [ ] **Step 1: Create the spotlight directory**

```bash
mkdir -p packages/web/src/components/spotlight/tours
```

- [ ] **Step 2: Create `types.ts`**

```ts
// packages/web/src/components/spotlight/types.ts
export interface SpotlightStep {
  id: string;
  targetId: string | null;
  title: string;
  body: string;
  preferredSide?: "top" | "right" | "bottom" | "left";
}

export interface SpotlightTour {
  id: string;
  steps: SpotlightStep[];
}

export type TourStatus = "completed" | "dismissed";

export interface TourRecord {
  status: TourStatus;
  at: string;
}

export type PersistedTours = Record<string, TourRecord>;
```

- [ ] **Step 3: Create barrel `index.ts` with placeholder exports**

```ts
// packages/web/src/components/spotlight/index.ts
export type { SpotlightStep, SpotlightTour, TourStatus, TourRecord } from "./types";
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm --filter @airtrafficcontrol/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/spotlight/
git commit -m "feat(web): scaffold spotlight component directory and types"
```

---

## Task 2: Persistence helpers

**Files:**
- Create: `packages/web/src/components/spotlight/persistence.ts`
- Create: `packages/web/src/components/spotlight/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/components/spotlight/persistence.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadTours, saveTourRecord, clearTourRecord, STORAGE_KEY } from "./persistence";

describe("spotlight persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty object when no record exists", () => {
    expect(loadTours()).toEqual({});
  });

  it("returns empty object when JSON is malformed", () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    expect(loadTours()).toEqual({});
  });

  it("persists a tour record", () => {
    saveTourRecord("first-run", "completed");
    const tours = loadTours();
    expect(tours["first-run"]?.status).toBe("completed");
    expect(tours["first-run"]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("overwrites an existing record", () => {
    saveTourRecord("first-run", "dismissed");
    saveTourRecord("first-run", "completed");
    expect(loadTours()["first-run"]?.status).toBe("completed");
  });

  it("clears a specific tour", () => {
    saveTourRecord("first-run", "completed");
    saveTourRecord("intro-crafts", "dismissed");
    clearTourRecord("first-run");
    expect(loadTours()["first-run"]).toBeUndefined();
    expect(loadTours()["intro-crafts"]?.status).toBe("dismissed");
  });

  it("survives localStorage write failures without throwing", () => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => saveTourRecord("first-run", "completed")).not.toThrow();
    Storage.prototype.setItem = originalSetItem;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/components/spotlight/persistence.test.ts`
Expected: FAIL — `Cannot find module './persistence'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/web/src/components/spotlight/persistence.ts
import type { PersistedTours, TourStatus } from "./types";

export const STORAGE_KEY = "atc.spotlight.v1";

export function loadTours(): PersistedTours {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as PersistedTours;
    return {};
  } catch {
    return {};
  }
}

export function saveTourRecord(tourId: string, status: TourStatus): void {
  try {
    const tours = loadTours();
    tours[tourId] = { status, at: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tours));
  } catch (err) {
    console.warn("[spotlight] failed to persist tour record", err);
  }
}

export function clearTourRecord(tourId: string): void {
  try {
    const tours = loadTours();
    delete tours[tourId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tours));
  } catch (err) {
    console.warn("[spotlight] failed to clear tour record", err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/web/src/components/spotlight/persistence.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/spotlight/persistence.ts packages/web/src/components/spotlight/persistence.test.ts
git commit -m "feat(web): add spotlight tour persistence to localStorage"
```

---

## Task 3: `useTargetRect` hook

**Files:**
- Create: `packages/web/src/components/spotlight/use-target-rect.ts`
- Create: `packages/web/src/components/spotlight/use-target-rect.test.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/components/spotlight/use-target-rect.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTargetRect } from "./use-target-rect";

class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  (globalThis as any).ResizeObserver = MockResizeObserver;
  document.body.innerHTML = "";
});

afterEach(() => {
  delete (globalThis as any).ResizeObserver;
});

function mountTarget(id: string, rect: Partial<DOMRect>) {
  const el = document.createElement("div");
  el.setAttribute("data-spotlight", id);
  el.getBoundingClientRect = () =>
    ({
      top: rect.top ?? 0,
      left: rect.left ?? 0,
      width: rect.width ?? 100,
      height: rect.height ?? 30,
      right: (rect.left ?? 0) + (rect.width ?? 100),
      bottom: (rect.top ?? 0) + (rect.height ?? 30),
      x: rect.left ?? 0,
      y: rect.top ?? 0,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe("useTargetRect", () => {
  it("returns null when no target with matching id exists", () => {
    const { result } = renderHook(() => useTargetRect("missing"));
    expect(result.current).toBeNull();
  });

  it("returns rect when target is mounted before hook", () => {
    mountTarget("foo", { top: 10, left: 20, width: 100, height: 30 });
    const { result } = renderHook(() => useTargetRect("foo"));
    expect(result.current?.top).toBe(10);
    expect(result.current?.width).toBe(100);
  });

  it("updates rect when target mounts after hook", async () => {
    const { result } = renderHook(() => useTargetRect("late"));
    expect(result.current).toBeNull();
    await act(async () => {
      mountTarget("late", { top: 50, left: 0, width: 80, height: 20 });
      // give MutationObserver a chance
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current?.top).toBe(50);
  });

  it("returns null when target is removed", async () => {
    const el = mountTarget("bye", { top: 0, left: 0, width: 100, height: 30 });
    const { result } = renderHook(() => useTargetRect("bye"));
    expect(result.current).not.toBeNull();
    await act(async () => {
      el.remove();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current).toBeNull();
  });

  it("returns null when targetId is null", () => {
    const { result } = renderHook(() => useTargetRect(null));
    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/components/spotlight/use-target-rect.test.ts`
Expected: FAIL — `Cannot find module './use-target-rect'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/web/src/components/spotlight/use-target-rect.ts
import { useEffect, useState } from "react";

function findTarget(id: string): Element | null {
  const matches = document.querySelectorAll(`[data-spotlight="${CSS.escape(id)}"]`);
  if (matches.length > 1) {
    console.warn(`[spotlight] multiple targets with id "${id}" — using the first match`);
  }
  return matches[0] ?? null;
}

export function useTargetRect(targetId: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (targetId === null) {
      setRect(null);
      return;
    }

    let frame = 0;
    let currentEl: Element | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const update = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = currentEl;
        if (!el || !el.isConnected) {
          setRect(null);
          return;
        }
        setRect(el.getBoundingClientRect());
      });
    };

    const bind = () => {
      const el = findTarget(targetId);
      if (el === currentEl) return;
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      currentEl = el;
      if (!el) {
        setRect(null);
        return;
      }
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(el);
      update();
    };

    bind();

    const mutationObserver = new MutationObserver(() => {
      const el = findTarget(targetId);
      if (el !== currentEl) bind();
      else if (el) update();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    const onScroll = () => update();
    const onResize = () => update();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onResize);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (resizeObserver) resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onResize);
    };
  }, [targetId]);

  return rect;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/web/src/components/spotlight/use-target-rect.test.ts`
Expected: PASS, 5/5.

If the late-mount test fails because jsdom's `requestAnimationFrame` is synchronous or missing, add this at the top of the test file before `beforeEach`:

```ts
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id as unknown as NodeJS.Timeout);
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/spotlight/use-target-rect.ts packages/web/src/components/spotlight/use-target-rect.test.ts
git commit -m "feat(web): add useTargetRect hook for spotlight target tracking"
```

---

## Task 4: `usePopoverPlacement` hook

**Files:**
- Create: `packages/web/src/components/spotlight/use-popover-placement.ts`
- Create: `packages/web/src/components/spotlight/use-popover-placement.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/components/spotlight/use-popover-placement.test.ts
import { describe, it, expect } from "vitest";
import { pickPlacement, GUTTER } from "./use-popover-placement";

const POPOVER = { width: 260, height: 160 };
const VIEWPORT = { width: 1200, height: 800 };

function rect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top, left, width, height,
    right: left + width, bottom: top + height,
    x: left, y: top, toJSON: () => ({}),
  } as DOMRect;
}

describe("pickPlacement", () => {
  it("returns side='center' when target rect is null", () => {
    const result = pickPlacement(null, POPOVER, VIEWPORT);
    expect(result.side).toBe("center");
  });

  it("uses preferredSide when it fits", () => {
    const target = rect(400, 500, 120, 40);
    const result = pickPlacement(target, POPOVER, VIEWPORT, "top");
    expect(result.side).toBe("top");
  });

  it("falls back to bottom when preferredSide=top does not fit", () => {
    const target = rect(10, 500, 120, 40);
    const result = pickPlacement(target, POPOVER, VIEWPORT, "top");
    expect(result.side).toBe("bottom");
  });

  it("falls back through bottom → top → right → left order", () => {
    const target = rect(400, 0, 100, 40);
    const result = pickPlacement(target, POPOVER, VIEWPORT);
    expect(["bottom", "top", "right"]).toContain(result.side);
  });

  it("centers in viewport when no side fits", () => {
    const tiny = { width: 200, height: 200 };
    const target = rect(80, 40, 60, 40);
    const result = pickPlacement(target, POPOVER, tiny);
    expect(result.side).toBe("center");
  });

  it("clamps horizontal position to keep popover on-screen", () => {
    const target = rect(400, 1180, 40, 20);
    const result = pickPlacement(target, POPOVER, VIEWPORT);
    expect(result.left + POPOVER.width).toBeLessThanOrEqual(VIEWPORT.width - GUTTER + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/components/spotlight/use-popover-placement.test.ts`
Expected: FAIL — `Cannot find module './use-popover-placement'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/web/src/components/spotlight/use-popover-placement.ts
export const GUTTER = 12;

export type PlacementSide = "top" | "right" | "bottom" | "left" | "center";

export interface Placement {
  side: PlacementSide;
  top: number;
  left: number;
}

export interface PopoverSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tryPlacement(
  target: DOMRect,
  side: Exclude<PlacementSide, "center">,
  popover: PopoverSize,
  viewport: ViewportSize,
): Placement | null {
  let top = 0;
  let left = 0;

  switch (side) {
    case "top":
      top = target.top - popover.height - GUTTER;
      left = target.left + target.width / 2 - popover.width / 2;
      break;
    case "bottom":
      top = target.bottom + GUTTER;
      left = target.left + target.width / 2 - popover.width / 2;
      break;
    case "left":
      top = target.top + target.height / 2 - popover.height / 2;
      left = target.left - popover.width - GUTTER;
      break;
    case "right":
      top = target.top + target.height / 2 - popover.height / 2;
      left = target.right + GUTTER;
      break;
  }

  const clampedLeft = clamp(left, GUTTER, viewport.width - popover.width - GUTTER);
  const clampedTop = clamp(top, GUTTER, viewport.height - popover.height - GUTTER);

  const fits =
    top >= GUTTER &&
    top + popover.height <= viewport.height - GUTTER &&
    left >= -popover.width &&
    left + popover.width <= viewport.width + popover.width;

  if (!fits) return null;

  if (side === "top" || side === "bottom") {
    if (top < GUTTER || top + popover.height > viewport.height - GUTTER) return null;
  }
  if (side === "left" || side === "right") {
    if (left < GUTTER || left + popover.width > viewport.width - GUTTER) return null;
  }

  return { side, top: clampedTop, left: clampedLeft };
}

export function pickPlacement(
  target: DOMRect | null,
  popover: PopoverSize,
  viewport: ViewportSize,
  preferredSide?: Exclude<PlacementSide, "center">,
): Placement {
  if (!target) {
    return {
      side: "center",
      top: viewport.height / 2 - popover.height / 2,
      left: viewport.width / 2 - popover.width / 2,
    };
  }

  const order: Exclude<PlacementSide, "center">[] = preferredSide
    ? [preferredSide, ...(["bottom", "top", "right", "left"] as const).filter((s) => s !== preferredSide)]
    : ["bottom", "top", "right", "left"];

  for (const side of order) {
    const result = tryPlacement(target, side, popover, viewport);
    if (result) return result;
  }

  return {
    side: "center",
    top: viewport.height / 2 - popover.height / 2,
    left: viewport.width / 2 - popover.width / 2,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/web/src/components/spotlight/use-popover-placement.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/spotlight/use-popover-placement.ts packages/web/src/components/spotlight/use-popover-placement.test.ts
git commit -m "feat(web): add popover placement algorithm for spotlight"
```

---

## Task 5: `SpotlightPopover` component

**Files:**
- Create: `packages/web/src/components/spotlight/spotlight-popover.tsx`
- Create: `packages/web/src/components/spotlight/spotlight-popover.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/components/spotlight/spotlight-popover.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpotlightPopover } from "./spotlight-popover";

function renderPopover(overrides: Partial<React.ComponentProps<typeof SpotlightPopover>> = {}) {
  const onNext = vi.fn();
  const onBack = vi.fn();
  const onClose = vi.fn();
  render(
    <SpotlightPopover
      title="Launch your first craft"
      body="Click New Craft to start."
      stepIndex={1}
      stepCount={4}
      onNext={onNext}
      onBack={onBack}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onNext, onBack, onClose };
}

describe("SpotlightPopover", () => {
  it("renders title and body", () => {
    renderPopover();
    expect(screen.getByText("Launch your first craft")).toBeInTheDocument();
    expect(screen.getByText("Click New Craft to start.")).toBeInTheDocument();
  });

  it("renders progress dots matching stepCount", () => {
    renderPopover({ stepCount: 5, stepIndex: 2 });
    expect(screen.getAllByTestId("spotlight-dot")).toHaveLength(5);
  });

  it("calls onNext when Next is clicked", () => {
    const { onNext } = renderPopover();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("calls onBack when Back is clicked", () => {
    const { onBack } = renderPopover();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("disables Back on first step", () => {
    renderPopover({ stepIndex: 0 });
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();
  });

  it("shows 'Done' instead of 'Next' on last step and calls onNext when clicked", () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(
      <SpotlightPopover
        title="T" body="B"
        stepIndex={3} stepCount={4}
        onNext={onNext} onBack={onBack} onClose={onClose}
      />,
    );
    expect(screen.queryByRole("button", { name: /^next$/i })).toBeNull();
    const done = screen.getByRole("button", { name: /done/i });
    fireEvent.click(done);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when × is clicked", () => {
    const { onClose } = renderPopover();
    fireEvent.click(screen.getByRole("button", { name: /close tour/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/components/spotlight/spotlight-popover.test.tsx`
Expected: FAIL — `Cannot find module './spotlight-popover'`.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/web/src/components/spotlight/spotlight-popover.tsx
import { forwardRef } from "react";

export interface SpotlightPopoverProps {
  title: string;
  body: string;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

export const SpotlightPopover = forwardRef<HTMLDivElement, SpotlightPopoverProps>(
  ({ title, body, stepIndex, stepCount, onNext, onBack, onClose, style }, ref) => {
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === stepCount - 1;
    return (
      <div
        ref={ref}
        role="dialog"
        aria-label={title}
        className="pointer-events-auto relative rounded-[10px] border p-4 shadow-xl"
        style={{
          width: 260,
          maxWidth: "90vw",
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
          ...style,
        }}
      >
        <button
          type="button"
          aria-label="Close tour"
          onClick={onClose}
          className="absolute right-2.5 top-2 bg-transparent px-1.5 py-0.5 text-base leading-none"
          style={{ color: "var(--text-dim)" }}
        >
          ×
        </button>
        <h4 className="mb-1.5 pr-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h4>
        <p className="mb-3.5 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {body}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: stepCount }).map((_, i) => (
              <span
                key={i}
                data-testid="spotlight-dot"
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor:
                    i === stepIndex ? "var(--accent-green)" : "var(--border)",
                }}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onBack}
              disabled={isFirst}
              className="rounded-md border px-2.5 py-1 text-xs disabled:opacity-40"
              style={{
                backgroundColor: "transparent",
                borderColor: "var(--border)",
                color: "var(--text-muted)",
              }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={onNext}
              autoFocus
              className="rounded-md border px-2.5 py-1 text-xs font-semibold"
              style={{
                backgroundColor: "var(--accent-green)",
                borderColor: "var(--accent-green)",
                color: "var(--bg-base)",
              }}
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    );
  },
);
SpotlightPopover.displayName = "SpotlightPopover";
```

Note: The final-step "Done" button calls `onNext`, not `onClose`. The provider's `next()` (Task 6) detects "past the last step" and records the tour as `completed`. Clicking × always calls `onClose` which records `dismissed`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/web/src/components/spotlight/spotlight-popover.test.tsx`
Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/spotlight/spotlight-popover.tsx packages/web/src/components/spotlight/spotlight-popover.test.tsx
git commit -m "feat(web): add SpotlightPopover presentational component"
```

---

## Task 6: `SpotlightProvider` + `useSpotlight` hook

**Files:**
- Create: `packages/web/src/components/spotlight/spotlight-provider.tsx`
- Create: `packages/web/src/components/spotlight/spotlight-provider.test.tsx`

This task introduces both the provider and the hook. The overlay component in Task 7 will consume the context.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/components/spotlight/spotlight-provider.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SpotlightProvider, useSpotlight } from "./spotlight-provider";
import type { SpotlightTour } from "./types";
import { STORAGE_KEY } from "./persistence";

const firstRun: SpotlightTour = {
  id: "first-run",
  steps: [
    { id: "a", targetId: null, title: "A", body: "A" },
    { id: "b", targetId: "t1", title: "B", body: "B" },
    { id: "c", targetId: "t2", title: "C", body: "C" },
  ],
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <SpotlightProvider tours={{ "first-run": firstRun }}>{children}</SpotlightProvider>;
}

beforeEach(() => {
  localStorage.clear();
});

describe("useSpotlight", () => {
  it("is inactive by default", () => {
    const { result } = renderHook(() => useSpotlight(), { wrapper });
    expect(result.current.activeTourId).toBeNull();
  });

  it("start() activates the tour at step 0", () => {
    const { result } = renderHook(() => useSpotlight(), { wrapper });
    act(() => result.current.start("first-run"));
    expect(result.current.activeTourId).toBe("first-run");
    expect(result.current.activeStepIndex).toBe(0);
  });

  it("next() advances the step index", () => {
    const { result } = renderHook(() => useSpotlight(), { wrapper });
    act(() => result.current.start("first-run"));
    act(() => result.current.next());
    expect(result.current.activeStepIndex).toBe(1);
  });

  it("back() decrements the step index and clamps at 0", () => {
    const { result } = renderHook(() => useSpotlight(), { wrapper });
    act(() => result.current.start("first-run"));
    act(() => result.current.back());
    expect(result.current.activeStepIndex).toBe(0);
  });

  it("complete() persists 'completed' and ends the tour", () => {
    const { result } = renderHook(() => useSpotlight(), { wrapper });
    act(() => result.current.start("first-run"));
    act(() => result.current.complete());
    expect(result.current.activeTourId).toBeNull();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw["first-run"].status).toBe("completed");
  });

  it("stop() persists 'dismissed' and ends the tour", () => {
    const { result } = renderHook(() => useSpotlight(), { wrapper });
    act(() => result.current.start("first-run"));
    act(() => result.current.stop());
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw["first-run"].status).toBe("dismissed");
  });

  it("start() is a no-op when tour is already completed", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "first-run": { status: "completed", at: "x" } }));
    const { result } = renderHook(() => useSpotlight(), { wrapper });
    act(() => result.current.start("first-run"));
    expect(result.current.activeTourId).toBeNull();
  });

  it("restart() clears persistence and starts", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "first-run": { status: "completed", at: "x" } }));
    const { result } = renderHook(() => useSpotlight(), { wrapper });
    act(() => result.current.restart("first-run"));
    expect(result.current.activeTourId).toBe("first-run");
  });

  it("warns and no-ops when starting an unknown tour id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useSpotlight(), { wrapper });
    act(() => result.current.start("does-not-exist"));
    expect(result.current.activeTourId).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("next() past the last step calls complete()", () => {
    const { result } = renderHook(() => useSpotlight(), { wrapper });
    act(() => result.current.start("first-run"));
    act(() => result.current.next()); // step 1
    act(() => result.current.next()); // step 2 (last)
    act(() => result.current.next()); // complete
    expect(result.current.activeTourId).toBeNull();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw["first-run"].status).toBe("completed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/components/spotlight/spotlight-provider.test.tsx`
Expected: FAIL — `Cannot find module './spotlight-provider'`.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/web/src/components/spotlight/spotlight-provider.tsx
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { SpotlightTour } from "./types";
import { clearTourRecord, loadTours, saveTourRecord } from "./persistence";

export interface SpotlightController {
  activeTourId: string | null;
  activeStepIndex: number;
  start: (tourId: string) => void;
  restart: (tourId: string) => void;
  stop: () => void;
  complete: () => void;
  next: () => void;
  back: () => void;
  isComplete: (tourId: string) => boolean;
  getTour: (tourId: string) => SpotlightTour | undefined;
}

const Ctx = createContext<SpotlightController | null>(null);

export interface SpotlightProviderProps {
  tours: Record<string, SpotlightTour>;
  children: ReactNode;
}

export function SpotlightProvider({ tours, children }: SpotlightProviderProps) {
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const isComplete = useCallback((tourId: string) => {
    return Boolean(loadTours()[tourId]);
  }, []);

  const endTour = useCallback(() => {
    setActiveTourId(null);
    setActiveStepIndex(0);
  }, []);

  const start = useCallback(
    (tourId: string) => {
      const tour = tours[tourId];
      if (!tour) {
        console.warn(`[spotlight] unknown tour id: ${tourId}`);
        return;
      }
      if (loadTours()[tourId]) return;
      if (activeTourId && activeTourId !== tourId) {
        console.warn(`[spotlight] tour "${activeTourId}" already active; ignoring start("${tourId}")`);
        return;
      }
      setActiveTourId(tourId);
      setActiveStepIndex(0);
    },
    [tours, activeTourId],
  );

  const restart = useCallback(
    (tourId: string) => {
      const tour = tours[tourId];
      if (!tour) {
        console.warn(`[spotlight] unknown tour id: ${tourId}`);
        return;
      }
      clearTourRecord(tourId);
      setActiveTourId(tourId);
      setActiveStepIndex(0);
    },
    [tours],
  );

  const stop = useCallback(() => {
    if (!activeTourId) return;
    saveTourRecord(activeTourId, "dismissed");
    endTour();
  }, [activeTourId, endTour]);

  const complete = useCallback(() => {
    if (!activeTourId) return;
    saveTourRecord(activeTourId, "completed");
    endTour();
  }, [activeTourId, endTour]);

  const next = useCallback(() => {
    if (!activeTourId) return;
    const tour = tours[activeTourId];
    if (!tour) return;
    setActiveStepIndex((idx) => {
      if (idx >= tour.steps.length - 1) {
        saveTourRecord(activeTourId, "completed");
        setActiveTourId(null);
        return 0;
      }
      return idx + 1;
    });
  }, [activeTourId, tours]);

  const back = useCallback(() => {
    setActiveStepIndex((idx) => Math.max(0, idx - 1));
  }, []);

  const getTour = useCallback((tourId: string) => tours[tourId], [tours]);

  const value = useMemo<SpotlightController>(
    () => ({
      activeTourId,
      activeStepIndex,
      start,
      restart,
      stop,
      complete,
      next,
      back,
      isComplete,
      getTour,
    }),
    [activeTourId, activeStepIndex, start, restart, stop, complete, next, back, isComplete, getTour],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSpotlight(): SpotlightController {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useSpotlight must be used inside <SpotlightProvider>");
  }
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/web/src/components/spotlight/spotlight-provider.test.tsx`
Expected: PASS, 10/10.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/spotlight/spotlight-provider.tsx packages/web/src/components/spotlight/spotlight-provider.test.tsx
git commit -m "feat(web): add SpotlightProvider context and useSpotlight hook"
```

---

## Task 7: `SpotlightOverlay` — portal rendering, shade, keyboard

**Files:**
- Create: `packages/web/src/components/spotlight/spotlight-overlay.tsx`
- Create: `packages/web/src/components/spotlight/spotlight-overlay.test.tsx`
- Modify: `packages/web/src/components/spotlight/spotlight-provider.tsx` (render `<SpotlightOverlay>` inside the provider)

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/components/spotlight/spotlight-overlay.test.tsx
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SpotlightProvider, useSpotlight } from "./spotlight-provider";
import type { SpotlightTour } from "./types";

class MockResizeObserver {
  constructor(_: ResizeObserverCallback) {}
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  localStorage.clear();
  (globalThis as any).ResizeObserver = MockResizeObserver;
  document.body.innerHTML = "";
});

afterEach(() => {
  delete (globalThis as any).ResizeObserver;
});

function mountTarget(id: string) {
  const el = document.createElement("button");
  el.setAttribute("data-spotlight", id);
  el.getBoundingClientRect = () =>
    ({
      top: 100, left: 100, width: 120, height: 40,
      right: 220, bottom: 140, x: 100, y: 100, toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const tour: SpotlightTour = {
  id: "t",
  steps: [
    { id: "welcome", targetId: null, title: "Welcome", body: "Hi." },
    { id: "s1",      targetId: "btn", title: "Click me", body: "Here." },
  ],
};

function Starter() {
  const s = useSpotlight();
  return <button onClick={() => s.start("t")}>start</button>;
}

function renderApp() {
  return render(
    <SpotlightProvider tours={{ t: tour }}>
      <Starter />
    </SpotlightProvider>,
  );
}

describe("SpotlightOverlay", () => {
  it("renders nothing when no tour is active", () => {
    renderApp();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders popover for centered welcome step with no target", () => {
    renderApp();
    fireEvent.click(screen.getByText("start"));
    expect(screen.getByRole("dialog", { name: "Welcome" })).toBeInTheDocument();
    expect(screen.queryByTestId("spotlight-shade-top")).not.toBeNull();
  });

  it("renders four shade rects when step has a visible target", () => {
    mountTarget("btn");
    renderApp();
    fireEvent.click(screen.getByText("start"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByTestId("spotlight-shade-top")).toBeInTheDocument();
    expect(screen.getByTestId("spotlight-shade-bottom")).toBeInTheDocument();
    expect(screen.getByTestId("spotlight-shade-left")).toBeInTheDocument();
    expect(screen.getByTestId("spotlight-shade-right")).toBeInTheDocument();
  });

  it("hides overlay when step has a targetId but target is not mounted", () => {
    renderApp();
    fireEvent.click(screen.getByText("start"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    // target "btn" is not in DOM; overlay should hide
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape key", () => {
    renderApp();
    fireEvent.click(screen.getByText("start"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/components/spotlight/spotlight-overlay.test.tsx`
Expected: FAIL — `Cannot find module './spotlight-overlay'` (until Step 3 creates it and Step 4 wires it into the provider).

- [ ] **Step 3: Write the overlay implementation**

```tsx
// packages/web/src/components/spotlight/spotlight-overlay.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SpotlightPopover } from "./spotlight-popover";
import { useSpotlight } from "./spotlight-provider";
import { useTargetRect } from "./use-target-rect";
import { pickPlacement, type Placement } from "./use-popover-placement";

const DEFAULT_POPOVER_SIZE = { width: 260, height: 180 };

export function SpotlightOverlay() {
  const spotlight = useSpotlight();
  const popoverRef = useRef<HTMLDivElement>(null);

  const tour = spotlight.activeTourId ? spotlight.getTour(spotlight.activeTourId) : undefined;
  const step = tour?.steps[spotlight.activeStepIndex];
  const rect = useTargetRect(step?.targetId ?? null);

  const [popoverSize, setPopoverSize] = useState(DEFAULT_POPOVER_SIZE);
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined"
      ? { width: 1024, height: 768 }
      : { width: window.innerWidth, height: window.innerHeight },
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    if (popoverRef.current) {
      const { width, height } = popoverRef.current.getBoundingClientRect();
      if (width && height) setPopoverSize({ width, height });
    }
  }, [step?.id, rect]);

  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") spotlight.stop();
      else if (e.key === "ArrowRight") spotlight.next();
      else if (e.key === "ArrowLeft") spotlight.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, spotlight]);

  if (!tour || !step) return null;

  // Step has a target but target is not mounted — hide overlay, stay active.
  if (step.targetId !== null && !rect) return null;

  const placement: Placement = pickPlacement(rect, popoverSize, viewport, step.preferredSide);

  const stepCount = tour.steps.length;
  const stepIndex = spotlight.activeStepIndex;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[1000]">
      {rect ? (
        <>
          <div
            data-testid="spotlight-shade-top"
            className="pointer-events-auto absolute"
            style={{
              top: 0, left: 0, right: 0, height: rect.top,
              backgroundColor: "rgba(0, 0, 0, 0.6)",
            }}
          />
          <div
            data-testid="spotlight-shade-bottom"
            className="pointer-events-auto absolute"
            style={{
              top: rect.bottom, left: 0, right: 0, bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.6)",
            }}
          />
          <div
            data-testid="spotlight-shade-left"
            className="pointer-events-auto absolute"
            style={{
              top: rect.top, left: 0, width: rect.left, height: rect.height,
              backgroundColor: "rgba(0, 0, 0, 0.6)",
            }}
          />
          <div
            data-testid="spotlight-shade-right"
            className="pointer-events-auto absolute"
            style={{
              top: rect.top, left: rect.right, right: 0, height: rect.height,
              backgroundColor: "rgba(0, 0, 0, 0.6)",
            }}
          />
        </>
      ) : (
        <div
          data-testid="spotlight-shade-top"
          className="pointer-events-auto absolute inset-0"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
        />
      )}
      <div
        className="absolute"
        style={{ top: placement.top, left: placement.left }}
      >
        <SpotlightPopover
          ref={popoverRef}
          title={step.title}
          body={step.body}
          stepIndex={stepIndex}
          stepCount={stepCount}
          onNext={spotlight.next}
          onBack={spotlight.back}
          onClose={spotlight.stop}
        />
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Wire the overlay into the provider**

Edit `packages/web/src/components/spotlight/spotlight-provider.tsx`:

Replace the closing line:

```tsx
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
```

with:

```tsx
  return (
    <Ctx.Provider value={value}>
      {children}
      <SpotlightOverlay />
    </Ctx.Provider>
  );
```

And add this import at the top of the file (near the other imports):

```tsx
import { SpotlightOverlay } from "./spotlight-overlay";
```

- [ ] **Step 5: Run the overlay tests**

Run: `pnpm run test -- packages/web/src/components/spotlight/spotlight-overlay.test.tsx`
Expected: PASS, 5/5.

- [ ] **Step 6: Run the full spotlight test suite**

Run: `pnpm run test -- packages/web/src/components/spotlight/`
Expected: PASS, all files from Tasks 2–7.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/spotlight/spotlight-overlay.tsx packages/web/src/components/spotlight/spotlight-overlay.test.tsx packages/web/src/components/spotlight/spotlight-provider.tsx
git commit -m "feat(web): add SpotlightOverlay with portal, shade, and keyboard handling"
```

---

## Task 8: `SpotlightAutoStart` component

**Files:**
- Create: `packages/web/src/components/spotlight/spotlight-auto-start.tsx`
- Create: `packages/web/src/components/spotlight/spotlight-auto-start.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/components/spotlight/spotlight-auto-start.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpotlightProvider, useSpotlight } from "./spotlight-provider";
import { SpotlightAutoStart } from "./spotlight-auto-start";
import type { SpotlightTour } from "./types";
import { STORAGE_KEY } from "./persistence";

const tour: SpotlightTour = {
  id: "first-run",
  steps: [{ id: "a", targetId: null, title: "A", body: "A" }],
};

function ActiveReadout() {
  const s = useSpotlight();
  return <div data-testid="active">{s.activeTourId ?? "none"}</div>;
}

beforeEach(() => {
  localStorage.clear();
});

describe("SpotlightAutoStart", () => {
  it("starts the tour when `when` is true and tour has no persisted record", () => {
    render(
      <SpotlightProvider tours={{ "first-run": tour }}>
        <ActiveReadout />
        <SpotlightAutoStart tourId="first-run" when={true} />
      </SpotlightProvider>,
    );
    expect(screen.getByTestId("active").textContent).toBe("first-run");
  });

  it("does not start when `when` is false", () => {
    render(
      <SpotlightProvider tours={{ "first-run": tour }}>
        <ActiveReadout />
        <SpotlightAutoStart tourId="first-run" when={false} />
      </SpotlightProvider>,
    );
    expect(screen.getByTestId("active").textContent).toBe("none");
  });

  it("does not start when tour is already completed", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "first-run": { status: "completed", at: "x" } }));
    render(
      <SpotlightProvider tours={{ "first-run": tour }}>
        <ActiveReadout />
        <SpotlightAutoStart tourId="first-run" when={true} />
      </SpotlightProvider>,
    );
    expect(screen.getByTestId("active").textContent).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/components/spotlight/spotlight-auto-start.test.tsx`
Expected: FAIL — `Cannot find module './spotlight-auto-start'`.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/web/src/components/spotlight/spotlight-auto-start.tsx
import { useEffect, useRef } from "react";
import { useSpotlight } from "./spotlight-provider";

export interface SpotlightAutoStartProps {
  tourId: string;
  when: boolean;
}

export function SpotlightAutoStart({ tourId, when }: SpotlightAutoStartProps) {
  const spotlight = useSpotlight();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!when) return;
    if (firedRef.current) return;
    firedRef.current = true;
    spotlight.start(tourId);
  }, [when, tourId, spotlight]);

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test -- packages/web/src/components/spotlight/spotlight-auto-start.test.tsx`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/spotlight/spotlight-auto-start.tsx packages/web/src/components/spotlight/spotlight-auto-start.test.tsx
git commit -m "feat(web): add SpotlightAutoStart declarative trigger"
```

---

## Task 9: First-run tour content + registry

**Files:**
- Create: `packages/web/src/components/spotlight/tours/first-run.ts`
- Create: `packages/web/src/components/spotlight/tours/index.ts`
- Create: `packages/web/src/components/spotlight/tours/first-run.test.ts`
- Modify: `packages/web/src/components/spotlight/index.ts` (add exports)

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/components/spotlight/tours/first-run.test.ts
import { describe, it, expect } from "vitest";
import { firstRunTour } from "./first-run";

describe("firstRunTour", () => {
  it("has id 'first-run'", () => {
    expect(firstRunTour.id).toBe("first-run");
  });

  it("has at least one step", () => {
    expect(firstRunTour.steps.length).toBeGreaterThan(0);
  });

  it("all steps have non-empty title and body", () => {
    for (const step of firstRunTour.steps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it("has unique step ids", () => {
    const ids = firstRunTour.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references the expected target ids", () => {
    const targets = firstRunTour.steps.map((s) => s.targetId).filter((t): t is string => t !== null);
    expect(targets).toEqual([
      "sidebar-projects",
      "projects-new-button",
      "project-new-craft-button",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test -- packages/web/src/components/spotlight/tours/first-run.test.ts`
Expected: FAIL — `Cannot find module './first-run'`.

- [ ] **Step 3: Write the tour definition**

```ts
// packages/web/src/components/spotlight/tours/first-run.ts
import type { SpotlightTour } from "../types";

export const firstRunTour: SpotlightTour = {
  id: "first-run",
  steps: [
    {
      id: "welcome",
      targetId: null,
      title: "Welcome to ATC",
      body: "ATC coordinates autonomous agents working on your code. Let's set up your first project.",
    },
    {
      id: "sidebar-projects",
      targetId: "sidebar-projects",
      title: "Start with a project",
      body: "Projects are the repos ATC manages. Click Projects in the sidebar to continue.",
      preferredSide: "right",
    },
    {
      id: "new-project",
      targetId: "projects-new-button",
      title: "Create your first project",
      body: "Point ATC at a local repo. You can use a scratch repo to try things out.",
      preferredSide: "bottom",
    },
    {
      id: "new-craft",
      targetId: "project-new-craft-button",
      title: "Launch your first craft",
      body: "A craft is a unit of work. Click New Craft when you're ready to assign a pilot.",
      preferredSide: "bottom",
    },
  ],
};
```

- [ ] **Step 4: Write the registry**

```ts
// packages/web/src/components/spotlight/tours/index.ts
import type { SpotlightTour } from "../types";
import { firstRunTour } from "./first-run";

export const tours: Record<string, SpotlightTour> = {
  "first-run": firstRunTour,
};

export { firstRunTour };
```

- [ ] **Step 5: Update the barrel export**

Replace the contents of `packages/web/src/components/spotlight/index.ts`:

```ts
export type { SpotlightStep, SpotlightTour, TourStatus, TourRecord } from "./types";
export { SpotlightProvider, useSpotlight } from "./spotlight-provider";
export { SpotlightAutoStart } from "./spotlight-auto-start";
export { tours, firstRunTour } from "./tours";
```

- [ ] **Step 6: Run the tour tests**

Run: `pnpm run test -- packages/web/src/components/spotlight/tours/first-run.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/spotlight/tours/ packages/web/src/components/spotlight/index.ts
git commit -m "feat(web): add first-run onboarding tour definition"
```

---

## Task 10: Wire `SpotlightProvider` into the app root

**Files:**
- Modify: `packages/web/src/main.tsx`

- [ ] **Step 1: Read the current `main.tsx`**

Run: `cat packages/web/src/main.tsx`
Note the structure: `<StrictMode><QueryClientProvider><App /></QueryClientProvider></StrictMode>`, where `<App>` is `<WsProvider><RouterProvider /></WsProvider>`.

- [ ] **Step 2: Add the `SpotlightProvider` import**

Add this import alongside the existing imports in `packages/web/src/main.tsx`:

```tsx
import { SpotlightProvider, tours } from "@/components/spotlight";
```

- [ ] **Step 3: Wrap `<RouterProvider>` with `<SpotlightProvider>`**

Inside the `App` function, change:

```tsx
  return (
    <WsProvider value={wsContext}>
      <RouterProvider router={router} />
    </WsProvider>
  );
```

to:

```tsx
  return (
    <WsProvider value={wsContext}>
      <SpotlightProvider tours={tours}>
        <RouterProvider router={router} />
      </SpotlightProvider>
    </WsProvider>
  );
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @airtrafficcontrol/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/main.tsx
git commit -m "feat(web): mount SpotlightProvider at app root"
```

---

## Task 11: Add `data-spotlight` attributes to tour targets

**Files:**
- Modify: `packages/web/src/components/layout/sidebar.tsx`
- Modify: `packages/web/src/routes/projects/list.tsx`
- Modify: `packages/web/src/routes/projects/detail.tsx`

- [ ] **Step 1: Add `data-spotlight="sidebar-projects"` to the sidebar Projects NavLink**

In `packages/web/src/components/layout/sidebar.tsx`, the main `NAV_ITEMS` are rendered in a map around line 203. Change the map to attach a data attribute when the item is the Projects link. Replace:

```tsx
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
            style={({ isActive }) => ({
              color: isActive ? "var(--accent-green)" : "var(--text-muted)",
              backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
              borderLeft: isActive ? "2px solid var(--accent-green)" : "2px solid transparent",
            })}
          >
            {item.icon} {item.label}
          </NavLink>
        ))}
```

with:

```tsx
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            data-spotlight={item.to === "/projects" ? "sidebar-projects" : undefined}
            className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
            style={({ isActive }) => ({
              color: isActive ? "var(--accent-green)" : "var(--text-muted)",
              backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
              borderLeft: isActive ? "2px solid var(--accent-green)" : "2px solid transparent",
            })}
          >
            {item.icon} {item.label}
          </NavLink>
        ))}
```

- [ ] **Step 2: Add `data-spotlight="projects-new-button"` to the "New Project" button**

In `packages/web/src/routes/projects/list.tsx`, find the button around line 16. Replace:

```tsx
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
          >
            + New Project
          </button>
```

with:

```tsx
          <button
            onClick={() => setShowCreate(true)}
            data-spotlight="projects-new-button"
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
          >
            + New Project
          </button>
```

- [ ] **Step 3: Add `data-spotlight="project-new-craft-button"` to the "New Craft" link**

In `packages/web/src/routes/projects/detail.tsx`, find the `+ New Craft` Link (around line 45-51). Replace:

```tsx
            <Link
              to={`/projects/${name}/crafts/new`}
              className="rounded-md px-3 py-1.5 text-xs font-semibold no-underline"
              style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
            >
              + New Craft
            </Link>
```

with:

```tsx
            <Link
              to={`/projects/${name}/crafts/new`}
              data-spotlight="project-new-craft-button"
              className="rounded-md px-3 py-1.5 text-xs font-semibold no-underline"
              style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
            >
              + New Craft
            </Link>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @airtrafficcontrol/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layout/sidebar.tsx packages/web/src/routes/projects/list.tsx packages/web/src/routes/projects/detail.tsx
git commit -m "feat(web): add data-spotlight attributes to onboarding tour targets"
```

---

## Task 12: Auto-start first-run tour from the dashboard

**Files:**
- Modify: `packages/web/src/routes/dashboard.tsx`

- [ ] **Step 1: Read the current dashboard**

Run: `cat packages/web/src/routes/dashboard.tsx`

Note the hooks already used: `useProjects()` — perfect, we can derive `!hasAnyProject` from its result.

- [ ] **Step 2: Add the SpotlightAutoStart import and element**

Add this import alongside the existing imports in `packages/web/src/routes/dashboard.tsx`:

```tsx
import { SpotlightAutoStart } from "@/components/spotlight";
```

Then inside the `Component` function, add a boolean computed from `projects`:

```tsx
  const hasAnyProject = (projects?.length ?? 0) > 0;
  const projectsLoaded = projects !== undefined;
```

And add the `<SpotlightAutoStart />` near the top of the returned JSX, right below the opening `<div>`:

```tsx
    <div>
      <SpotlightAutoStart tourId="first-run" when={projectsLoaded && !hasAnyProject} />
      <PageHeader crumbs={[{ label: "Dashboard" }]} />
```

The `projectsLoaded` guard avoids triggering the tour during the brief moment where `useProjects()` has no data yet and `hasAnyProject` defaults to false.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @airtrafficcontrol/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/dashboard.tsx
git commit -m "feat(web): auto-start first-run tour on empty dashboard"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm run test`
Expected: all existing tests still pass, plus the new spotlight test files.

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`
Expected: no errors in new files. If lint complains about anything in the new files, fix it. Lint complaints in unrelated files are not this task's problem.

- [ ] **Step 3: Run format check**

Run: `pnpm run format:check`
Expected: all new files formatted. If anything fails, run `pnpm run format` and re-commit.

- [ ] **Step 4: Build the web package**

Run: `pnpm --filter @airtrafficcontrol/web build`
Expected: exits 0, produces `packages/web/dist/`. If this fails with TS6305/TS6306 composite errors from other packages (mentioned in `docs/roadmap.md` as pre-existing), note it but do not block on it — the spotlight code itself building clean is what matters.

- [ ] **Step 5: Manual smoke test (recommended but optional)**

Run: `pnpm --filter @airtrafficcontrol/web dev` (assumes the daemon is running, or skip if not available)
Open the dashboard in a browser with `localStorage.clear()` run in DevTools console beforehand. The first-run tour should auto-start, walk through 4 steps (welcome → Projects → New Project → New Craft), and remember completion across a reload. The highlighted sidebar link should remain clickable.

If no daemon is running, mock the empty projects response or skip this step — `pnpm run test` covers the behavior under test.

- [ ] **Step 6: Final commit (if any format/lint fixes)**

```bash
git status
# If anything changed:
git add -u
git commit -m "chore(web): format spotlight files"
```

---

## Appendix: Out-of-scope (do NOT implement)

These are explicitly excluded. If you find yourself wanting to do them, stop and flag it for a follow-up:

- Analytics / telemetry on tour completion rates.
- Internationalization (tour content is English-only; hardcoded strings are fine).
- A "Help → restart tour" menu item in the UI.
- Multi-tour queueing or concurrency. Only one tour active at a time.
- Server-side persistence of tour state.
- A tour authoring UI.
- The 30-second "target never appeared" auto-dismiss timer (mentioned in the spec as a safety net). Not needed for MVP — the `×` button and `localStorage.clear()` workarounds are adequate for now. If we see orphaned tours in practice, add it in a follow-up.

## Appendix: Related files for context

Read these before you start if you're unfamiliar with the codebase:

- `docs/superpowers/specs/2026-04-18-spotlight-design.md` — the spec this plan implements.
- `packages/web/src/components/layout/global-hold-switch.test.tsx` — testing pattern for React components (Vitest + @testing-library/react).
- `packages/web/src/main.tsx` — where the provider mounts.
- `vitest.config.ts` (repo root) — the `@/` alias and jsdom environment config.
- `docs/contributing.md` — coverage and JSDoc requirements for the repo (not every file in `packages/web` has JSDoc, so follow the local convention: add JSDoc to exported API of the spotlight package, not every internal helper).
