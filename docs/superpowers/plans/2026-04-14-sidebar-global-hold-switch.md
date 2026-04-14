# Sidebar Global Hold Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `<GlobalHoldSwitch />` component pinned to the bottom of the web sidebar that issues/lifts global TFRs via a two-click safety-cover interaction, and wire up a `tfr:global` WebSocket channel on the daemon so external TFR changes reflect in real time.

**Architecture:** A new React hook `useGlobalTfr()` encapsulates fetch + mutations + WebSocket state. A presentational `<GlobalHoldSwitch />` component consumes the hook and owns only the cover/interaction state machine. CSS Module provides the glass/cover visuals including `transform-style: preserve-3d` for the 3D flip animation. On the daemon side, `tfrRoutes` gains two `channelRegistry.publish` calls for global-scope issue and lift.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest + React Testing Library, CSS Modules, Fastify + WebSocket (daemon side).

**Spec:** `docs/superpowers/specs/2026-04-14-sidebar-global-hold-switch-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/web/src/hooks/use-global-tfr.ts` | Query active global TFRs, subscribe to `tfr:global`, expose `issue` / `lift` mutations |
| `packages/web/src/hooks/use-global-tfr.test.ts` | Unit tests for the hook |
| `packages/web/src/components/layout/global-hold-switch.tsx` | Presentational component with state machine |
| `packages/web/src/components/layout/global-hold-switch.module.css` | Glass, cover, switch visuals, animations |
| `packages/web/src/components/layout/global-hold-switch.test.tsx` | Component tests for interaction flow, accessibility, error paths |

### Modified files

| File | Change |
|------|--------|
| `packages/web/src/types/api.ts` | Add `TfrState` and `WsEvent` additions if missing |
| `packages/web/src/components/layout/sidebar.tsx` | Render `<GlobalHoldSwitch />` at the bottom via `mt-auto` |
| `packages/daemon/src/server/routes/tfr.ts` | Publish to `tfr:global` channel on global-scope issue and lift |
| `packages/daemon/src/server/routes/tfr.test.ts` | Assert publish is called with correct payload |
| `packages/daemon/CHANGELOG.md` | Document the new `tfr:global` WebSocket channel |
| `docs/rest_api.md` | Document the new channel under the TFR section |
| `packages/docs/docs/reference/rest-api.md` | Mirror the channel documentation |

---

### Task 1: Daemon — publish `tfr:global` channel events

**Files:**
- Modify: `packages/daemon/src/server/routes/tfr.ts`
- Modify: `packages/daemon/src/server/routes/tfr.test.ts`

- [ ] **Step 1: Write failing test for issue publish**

Add a new test to `packages/daemon/src/server/routes/tfr.test.ts` inside the existing `describe("tfr routes", ...)` block, after the existing `describe("POST /api/v1/tfrs", ...)` tests:

```ts
describe("WebSocket publish on tfr:global", () => {
  it("publishes tfr.issued on the tfr:global channel for global-scoped TFRs", async () => {
    const publish = vi.fn();
    // Replace the channel registry publish with a spy
    (app as unknown as { channelRegistry: { publish: typeof publish } }).channelRegistry.publish = publish;

    await app.inject({
      method: "POST",
      url: "/api/v1/tfrs",
      payload: {
        scope: "global",
        target: null,
        mode: "immediate",
        reason: "test",
        issuedBy: "user",
      },
    });

    expect(publish).toHaveBeenCalledWith(
      "tfr:global",
      expect.objectContaining({
        type: "event",
        channel: "tfr:global",
        event: "tfr.issued",
        data: expect.objectContaining({
          tfr: expect.objectContaining({ scope: "global" }),
        }),
      }),
    );
  });

  it("does not publish on tfr:global for project-scoped TFRs", async () => {
    const publish = vi.fn();
    (app as unknown as { channelRegistry: { publish: typeof publish } }).channelRegistry.publish = publish;

    await app.inject({
      method: "POST",
      url: "/api/v1/tfrs",
      payload: {
        scope: "project",
        target: "some-project",
        mode: "immediate",
        reason: "test",
        issuedBy: "user",
      },
    });

    expect(publish).not.toHaveBeenCalledWith("tfr:global", expect.anything());
  });

  it("publishes tfr.lifted on the tfr:global channel when a global TFR is lifted", async () => {
    const publish = vi.fn();
    (app as unknown as { channelRegistry: { publish: typeof publish } }).channelRegistry.publish = publish;

    tfrStore.set({
      identifier: "tfr-global-1",
      scope: "global",
      target: null,
      mode: "immediate",
      reason: "test",
      issuedBy: "user",
      issuedAt: new Date().toISOString(),
      liftedAt: null,
    });

    await app.inject({
      method: "POST",
      url: "/api/v1/tfrs/tfr-global-1/lift",
    });

    expect(publish).toHaveBeenCalledWith(
      "tfr:global",
      expect.objectContaining({
        type: "event",
        channel: "tfr:global",
        event: "tfr.lifted",
        data: expect.objectContaining({
          tfr: expect.objectContaining({ identifier: "tfr-global-1", scope: "global" }),
        }),
      }),
    );
  });
});
```

Note: `vi` must be imported at the top of the file. Check the existing `import { describe, it, expect, beforeEach, afterEach } from "vitest";` and add `vi`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run test -- packages/daemon/src/server/routes/tfr.test.ts`

Expected: FAIL with "expected publish to have been called" on the first two new tests.

- [ ] **Step 3: Add publish calls to tfr.ts**

In `packages/daemon/src/server/routes/tfr.ts`, modify the `POST /api/v1/tfrs` handler. Find the block that sets the tfr:

```ts
    app.tfrStore.set(tfr);

    // RULE-TFR-5: Set holdingPattern on affected crafts
    // RULE-TFRP-5: Record TFRIssued in black box
    applyTfrToCrafts(app, tfr, projectName);

    return reply.code(201).send(tfr);
```

Replace with:

```ts
    app.tfrStore.set(tfr);

    // RULE-TFR-5: Set holdingPattern on affected crafts
    // RULE-TFRP-5: Record TFRIssued in black box
    applyTfrToCrafts(app, tfr, projectName);

    // Publish to the tfr:global channel so clients can react in real time
    if (tfr.scope === "global") {
      app.channelRegistry.publish("tfr:global", {
        type: "event",
        channel: "tfr:global",
        event: "tfr.issued",
        timestamp: new Date().toISOString(),
        data: { tfr },
      });
    }

    return reply.code(201).send(tfr);
```

Now modify the `POST /api/v1/tfrs/:id/lift` handler. Find the block that sets the lifted tfr:

```ts
      app.tfrStore.set(lifted);

      // RULE-TFR-8: Clear holdingPattern on crafts not subject to another active TFR
      // RULE-TFRP-5: Record TFRLifted in black box
      clearTfrFromCrafts(app, lifted, projectName);

      return reply.send(lifted);
```

Replace with:

```ts
      app.tfrStore.set(lifted);

      // RULE-TFR-8: Clear holdingPattern on crafts not subject to another active TFR
      // RULE-TFRP-5: Record TFRLifted in black box
      clearTfrFromCrafts(app, lifted, projectName);

      // Publish to the tfr:global channel so clients can react in real time
      if (lifted.scope === "global") {
        app.channelRegistry.publish("tfr:global", {
          type: "event",
          channel: "tfr:global",
          event: "tfr.lifted",
          timestamp: new Date().toISOString(),
          data: { tfr: lifted },
        });
      }

      return reply.send(lifted);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run test -- packages/daemon/src/server/routes/tfr.test.ts`

Expected: PASS — all existing TFR tests plus the 3 new publish tests.

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run test`

Expected: PASS — no regressions anywhere.

- [ ] **Step 6: Commit**

```bash
cd /Users/mfoulks/Documents/git/atc && git add packages/daemon/src/server/routes/tfr.ts packages/daemon/src/server/routes/tfr.test.ts && git commit -m "$(cat <<'EOF'
feat(daemon): publish tfr:global WebSocket events for global-scope TFRs

On POST /api/v1/tfrs for global-scoped TFRs, publish a tfr.issued event
on the tfr:global channel. On POST /api/v1/tfrs/:id/lift for a global
TFR, publish a tfr.lifted event. Enables clients to react to global
TFR state changes in real time without polling.

Project- and craft-scoped TFRs do not publish on tfr:global.
EOF
)"
```

---

### Task 2: Web types — add TfrState

**Files:**
- Modify: `packages/web/src/types/api.ts`

- [ ] **Step 1: Check if TfrState already exists**

Run: `cd /Users/mfoulks/Documents/git/atc && grep -n "TfrState" packages/web/src/types/api.ts`

If any match is returned, the type exists — skip to Step 4. Otherwise continue.

- [ ] **Step 2: Add TfrState type**

Append to `packages/web/src/types/api.ts`:

```ts
/**
 * Daemon representation of a Temporary Flight Restriction.
 * Mirrors the TfrState interface in @airtrafficcontrol/daemon.
 */
export interface TfrState {
  identifier: string;
  scope: "global" | "project" | "craft";
  target: string | null;
  mode: "graceful" | "immediate";
  reason: string;
  issuedBy: "user" | "tower";
  issuedAt: string;
  liftedAt: string | null;
}
```

- [ ] **Step 3: Verify the file still builds**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm --filter @airtrafficcontrol/web exec tsc --noEmit 2>&1 | head -10`

Expected: no errors (or only pre-existing errors unrelated to api.ts).

- [ ] **Step 4: Commit**

```bash
cd /Users/mfoulks/Documents/git/atc && git add packages/web/src/types/api.ts && git commit -m "$(cat <<'EOF'
feat(web): add TfrState type to api types

Mirrors the daemon's TfrState interface for consumption by
useGlobalTfr and related UI components.
EOF
)"
```

---

### Task 3: Web — `useGlobalTfr` hook

**Files:**
- Create: `packages/web/src/hooks/use-global-tfr.ts`
- Create: `packages/web/src/hooks/use-global-tfr.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web/src/hooks/use-global-tfr.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useGlobalTfr } from "./use-global-tfr";
import type { TfrState } from "@/types/api";

// Mock api-client
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock ws-context
type WsListener = (event: {
  type: "event";
  channel: string;
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}) => void;

const mockWsManager = {
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  onEvent: vi.fn<(listener: WsListener) => () => void>(),
};

vi.mock("@/hooks/ws-context", () => ({
  useWsManager: () => mockWsManager,
}));

import { apiClient } from "@/lib/api-client";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeTfr(overrides: Partial<TfrState> = {}): TfrState {
  return {
    identifier: "tfr-1",
    scope: "global",
    target: null,
    mode: "immediate",
    reason: "test",
    issuedBy: "user",
    issuedAt: new Date().toISOString(),
    liftedAt: null,
    ...overrides,
  };
}

describe("useGlobalTfr", () => {
  let wsListener: WsListener | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    wsListener = null;
    mockWsManager.onEvent.mockImplementation((listener) => {
      wsListener = listener;
      return () => {
        wsListener = null;
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in loading state", () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    expect(result.current.state).toBe("loading");
  });

  it("transitions to idle when no global TFRs are active", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([]);
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(result.current.activeIds).toEqual([]);
  });

  it("transitions to active and filters for global scope only", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      makeTfr({ identifier: "tfr-a", scope: "global" }),
      makeTfr({ identifier: "tfr-b", scope: "project", target: "proj" }),
      makeTfr({ identifier: "tfr-c", scope: "global" }),
    ]);
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("active"));
    expect(result.current.activeIds).toEqual(["tfr-a", "tfr-c"]);
  });

  it("transitions to unknown when the initial fetch fails", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error("500: boom"));
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("unknown"));
  });

  it("issue() POSTs with hardcoded defaults and adds identifier on success", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([]);
    vi.mocked(apiClient.post).mockResolvedValue(makeTfr({ identifier: "new-tfr" }));

    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("idle"));

    await act(async () => {
      await result.current.issue();
    });

    expect(apiClient.post).toHaveBeenCalledWith("/api/v1/tfrs", {
      scope: "global",
      target: null,
      mode: "immediate",
      reason: "Sidebar kill switch",
      issuedBy: "user",
    });
    await waitFor(() => expect(result.current.state).toBe("active"));
    expect(result.current.activeIds).toEqual(["new-tfr"]);
  });

  it("lift() fires parallel POSTs for every active id and clears on all-success", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      makeTfr({ identifier: "tfr-a" }),
      makeTfr({ identifier: "tfr-b" }),
    ]);
    vi.mocked(apiClient.post).mockResolvedValue(makeTfr({ liftedAt: new Date().toISOString() }));

    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("active"));

    await act(async () => {
      await result.current.lift();
    });

    expect(apiClient.post).toHaveBeenCalledWith("/api/v1/tfrs/tfr-a/lift");
    expect(apiClient.post).toHaveBeenCalledWith("/api/v1/tfrs/tfr-b/lift");
    expect(result.current.state).toBe("idle");
    expect(result.current.activeIds).toEqual([]);
  });

  it("lift() keeps survivors and throws on partial failure", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      makeTfr({ identifier: "tfr-a" }),
      makeTfr({ identifier: "tfr-b" }),
    ]);
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path.includes("tfr-a")) return makeTfr({ liftedAt: new Date().toISOString() });
      throw new Error("500: boom");
    });

    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("active"));

    await act(async () => {
      await expect(result.current.lift()).rejects.toThrow();
    });

    expect(result.current.state).toBe("active");
    expect(result.current.activeIds).toEqual(["tfr-b"]);
  });

  it("adds id on tfr.issued WebSocket event for global-scope", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([]);
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("idle"));

    expect(mockWsManager.subscribe).toHaveBeenCalledWith("tfr:global");
    expect(wsListener).not.toBeNull();

    act(() => {
      wsListener!({
        type: "event",
        channel: "tfr:global",
        event: "tfr.issued",
        timestamp: new Date().toISOString(),
        data: { tfr: makeTfr({ identifier: "ws-tfr" }) },
      });
    });

    await waitFor(() => expect(result.current.activeIds).toEqual(["ws-tfr"]));
    expect(result.current.state).toBe("active");
  });

  it("removes id on tfr.lifted WebSocket event", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([makeTfr({ identifier: "tfr-a" })]);
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("active"));

    act(() => {
      wsListener!({
        type: "event",
        channel: "tfr:global",
        event: "tfr.lifted",
        timestamp: new Date().toISOString(),
        data: { tfr: makeTfr({ identifier: "tfr-a", liftedAt: new Date().toISOString() }) },
      });
    });

    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(result.current.activeIds).toEqual([]);
  });

  it("ignores duplicate id when WebSocket event arrives for known id", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([makeTfr({ identifier: "tfr-a" })]);
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("active"));

    act(() => {
      wsListener!({
        type: "event",
        channel: "tfr:global",
        event: "tfr.issued",
        timestamp: new Date().toISOString(),
        data: { tfr: makeTfr({ identifier: "tfr-a" }) },
      });
    });

    expect(result.current.activeIds).toEqual(["tfr-a"]);
  });

  it("unsubscribes from the channel on unmount", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([]);
    const { result, unmount } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    unmount();
    expect(mockWsManager.unsubscribe).toHaveBeenCalledWith("tfr:global");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run test -- packages/web/src/hooks/use-global-tfr.test.ts`

Expected: FAIL — module `./use-global-tfr` not found.

- [ ] **Step 3: Implement the hook**

Create `packages/web/src/hooks/use-global-tfr.ts`:

```ts
import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useWsManager } from "@/hooks/ws-context";
import type { TfrState } from "@/types/api";

const TFR_GLOBAL_CHANNEL = "tfr:global";
const KILL_SWITCH_REASON = "Sidebar kill switch";

export type GlobalTfrState = "loading" | "idle" | "active" | "unknown";

export interface UseGlobalTfrResult {
  /** Semantic state of the global hold. */
  state: GlobalTfrState;
  /** Identifiers of every currently-active global TFR. */
  activeIds: readonly string[];
  /** True while an issue or lift request is in flight. */
  pending: boolean;
  /** Most recent mutation or fetch error, or null. */
  error: Error | null;
  /** Issue a new global TFR with hardcoded kill-switch defaults. */
  issue: () => Promise<void>;
  /** Lift every currently-active global TFR in parallel. */
  lift: () => Promise<void>;
}

interface TfrGlobalWsEvent {
  type: "event";
  channel: string;
  event: string;
  timestamp: string;
  data: {
    tfr: TfrState;
  };
}

export function useGlobalTfr(): UseGlobalTfrResult {
  const wsManager = useWsManager();
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const query = useQuery<TfrState[]>({
    queryKey: ["tfrs", "active"],
    queryFn: () => apiClient.get<TfrState[]>("/api/v1/tfrs?active=true"),
  });

  // Sync activeIds from the initial fetch result (filtered to global scope).
  useEffect(() => {
    if (!query.data) return;
    const globalIds = query.data
      .filter((tfr) => tfr.scope === "global" && tfr.liftedAt === null)
      .map((tfr) => tfr.identifier);
    setActiveIds(globalIds);
  }, [query.data]);

  // Subscribe to tfr:global WebSocket channel.
  useEffect(() => {
    wsManager.subscribe(TFR_GLOBAL_CHANNEL);
    const unsub = wsManager.onEvent((event) => {
      const wsEvent = event as unknown as TfrGlobalWsEvent;
      if (wsEvent.channel !== TFR_GLOBAL_CHANNEL) return;
      const tfr = wsEvent.data?.tfr;
      if (!tfr || tfr.scope !== "global") return;

      if (wsEvent.event === "tfr.issued") {
        setActiveIds((ids) =>
          ids.includes(tfr.identifier) ? ids : [...ids, tfr.identifier],
        );
      } else if (wsEvent.event === "tfr.lifted") {
        setActiveIds((ids) => ids.filter((id) => id !== tfr.identifier));
      }
    });
    return () => {
      wsManager.unsubscribe(TFR_GLOBAL_CHANNEL);
      unsub();
    };
  }, [wsManager]);

  const issue = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const tfr = await apiClient.post<TfrState>("/api/v1/tfrs", {
        scope: "global",
        target: null,
        mode: "immediate",
        reason: KILL_SWITCH_REASON,
        issuedBy: "user",
      });
      setActiveIds((ids) =>
        ids.includes(tfr.identifier) ? ids : [...ids, tfr.identifier],
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setPending(false);
    }
  }, []);

  const lift = useCallback(async () => {
    if (activeIds.length === 0) return;
    setPending(true);
    setError(null);

    const results = await Promise.allSettled(
      activeIds.map((id) =>
        apiClient.post<TfrState>(`/api/v1/tfrs/${id}/lift`).then(() => id),
      ),
    );

    const lifted = new Set<string>();
    const failures: Error[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        lifted.add(result.value);
      } else {
        const reason = result.reason;
        failures.push(reason instanceof Error ? reason : new Error(String(reason)));
      }
    }

    setActiveIds((ids) => ids.filter((id) => !lifted.has(id)));
    setPending(false);

    if (failures.length > 0) {
      const message =
        failures.length === activeIds.length
          ? `Failed to lift ${failures.length} global TFRs: ${failures[0].message}`
          : `Failed to lift ${failures.length} of ${activeIds.length} global TFRs: ${failures[0].message}`;
      const e = new Error(message);
      setError(e);
      throw e;
    }
  }, [activeIds]);

  const state: GlobalTfrState = query.isLoading
    ? "loading"
    : query.isError
      ? "unknown"
      : activeIds.length > 0
        ? "active"
        : "idle";

  return {
    state,
    activeIds,
    pending,
    error,
    issue,
    lift,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run test -- packages/web/src/hooks/use-global-tfr.test.ts`

Expected: PASS — all 11 tests green.

- [ ] **Step 5: Commit**

```bash
cd /Users/mfoulks/Documents/git/atc && git add packages/web/src/hooks/use-global-tfr.ts packages/web/src/hooks/use-global-tfr.test.ts && git commit -m "$(cat <<'EOF'
feat(web): add useGlobalTfr hook for global TFR state

Queries active global TFRs on mount, subscribes to the tfr:global
WebSocket channel for real-time sync, and exposes issue/lift mutations.
Lift fires parallel POSTs and surfaces partial failures.
EOF
)"
```

---

### Task 4: Web — `<GlobalHoldSwitch />` component

**Files:**
- Create: `packages/web/src/components/layout/global-hold-switch.tsx`
- Create: `packages/web/src/components/layout/global-hold-switch.module.css`
- Create: `packages/web/src/components/layout/global-hold-switch.test.tsx`

- [ ] **Step 1: Create the CSS module**

Create `packages/web/src/components/layout/global-hold-switch.module.css`:

```css
.frame {
  position: relative;
  height: 72px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 3px;
  overflow: visible;
  perspective: 400px;
  transition: border-color 0.4s;
}

.labelTop {
  font-size: 8px;
  letter-spacing: 1.5px;
  color: var(--text-dim);
  padding: 6px 8px 0;
  text-transform: uppercase;
  position: relative;
  z-index: 1;
  pointer-events: none;
  transition: color 0.3s;
}

.labelTopPrefix {
  color: var(--accent-red);
  text-shadow: 0 0 4px rgba(255, 85, 85, 0.7);
}

.switchArea {
  position: absolute;
  inset: 18px 8px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 2px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.6);
  transition: background 0.4s, border-color 0.4s, box-shadow 0.4s;
}

.switchLabel {
  font-size: 10px;
  letter-spacing: 1px;
  color: var(--accent-green);
  opacity: 0.7;
  transition: color 0.3s;
  pointer-events: none;
  user-select: none;
}

.switch {
  width: 32px;
  height: 18px;
  border-radius: 9px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  position: relative;
  cursor: pointer;
  padding: 0;
  transition: background 0.4s, border-color 0.4s, box-shadow 0.3s;
}

.switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: left 0.3s, background 0.3s, box-shadow 0.3s;
}

.frame.open .switch {
  animation: switchHint 1.6s ease-in-out infinite;
}

@keyframes switchHint {
  0%, 100% {
    box-shadow: 0 0 0 1px rgba(0, 255, 136, 0.3), 0 0 6px rgba(0, 255, 136, 0.2);
  }
  50% {
    box-shadow: 0 0 0 1px rgba(0, 255, 136, 0.6), 0 0 12px rgba(0, 255, 136, 0.45);
  }
}

.glass {
  position: absolute;
  inset: 18px 8px 8px;
  background: linear-gradient(
    135deg,
    rgba(140, 180, 220, 0.18) 0%,
    rgba(140, 180, 220, 0.08) 45%,
    rgba(140, 180, 220, 0.22) 100%
  );
  border: 1px solid rgba(160, 200, 240, 0.35);
  border-radius: 2px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.25),
    0 1px 2px rgba(0, 0, 0, 0.3);
  transition:
    transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.1),
    box-shadow 0.3s,
    border-color 0.3s,
    background 0.4s;
  transform-origin: top center;
  transform-style: preserve-3d;
  transform: rotateX(4deg);
  cursor: pointer;
  padding: 0;
}

.glass::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    120deg,
    transparent 38%,
    rgba(255, 255, 255, 0.10) 50%,
    transparent 62%
  );
  pointer-events: none;
  transform: translateZ(0.1px);
}

.glass::after {
  content: "";
  position: absolute;
  top: -1px;
  left: 20%;
  right: 20%;
  height: 2px;
  background: linear-gradient(180deg, #3a434d 0%, var(--border) 100%);
  border-radius: 1px 1px 0 0;
}

.glassLabel {
  position: absolute;
  top: 44%;
  left: 50%;
  font-size: 9px;
  letter-spacing: 3px;
  color: rgba(180, 220, 240, 0.55);
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.4),
    0 -1px 0 rgba(255, 255, 255, 0.15);
  pointer-events: none;
  font-weight: 600;
  transform: translate(-50%, -50%) translateZ(0.5px) skewX(-4deg);
  transition: color 0.4s, text-shadow 0.4s;
}

.grip {
  position: absolute;
  bottom: 3px;
  left: 50%;
  width: 28px;
  height: 5px;
  background: repeating-linear-gradient(
    90deg,
    rgba(180, 210, 240, 0.4) 0 2px,
    rgba(180, 210, 240, 0.15) 2px 4px
  );
  border: 1px solid rgba(160, 200, 240, 0.4);
  border-radius: 1px;
  pointer-events: none;
  transform: translateX(-50%) translateZ(0.5px);
  transition: border-color 0.4s, background 0.4s;
}

/* Hover peek — only when cover is closed */
.frame:not(.open) .glass:hover {
  transform: translateY(-10px) rotateX(22deg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    inset 0 -1px 0 rgba(0, 0, 0, 0.25),
    0 6px 12px rgba(0, 0, 0, 0.4);
}

/* Open state */
.frame.open .glass {
  transform: translateY(-42px) rotateX(78deg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    inset 0 -1px 0 rgba(0, 0, 0, 0.25),
    0 12px 24px rgba(0, 0, 0, 0.5);
  border-color: rgba(0, 255, 136, 0.5);
}

/* Active state */
.frame.active .switch::after {
  left: 17px;
  background: var(--accent-red);
  box-shadow: 0 0 6px rgba(255, 85, 85, 0.9), 0 0 12px rgba(255, 85, 85, 0.4);
}
.frame.active .switch {
  background: #2a0a0a;
  border-color: #5a2020;
}
.frame.active .switchArea {
  background: #180808;
  border-color: #3a1010;
  box-shadow: inset 0 1px 3px rgba(60, 0, 0, 0.8), 0 0 12px rgba(200, 30, 30, 0.25);
}
.frame.active .switchLabel {
  color: var(--accent-red);
  opacity: 1;
}
.frame.active {
  border-color: rgba(180, 30, 30, 0.5);
}
.frame.active:not(.open) .glass {
  background: linear-gradient(
    135deg,
    rgba(255, 85, 85, 0.14) 0%,
    rgba(255, 85, 85, 0.06) 45%,
    rgba(255, 85, 85, 0.20) 100%
  );
  border-color: rgba(255, 100, 100, 0.5);
  animation: pulseRed 2s ease-in-out infinite;
}
.frame.active .glassLabel {
  color: rgba(255, 180, 180, 0.6);
}
.frame.active .grip {
  background: repeating-linear-gradient(
    90deg,
    rgba(255, 140, 140, 0.45) 0 2px,
    rgba(255, 140, 140, 0.2) 2px 4px
  );
  border-color: rgba(255, 140, 140, 0.45);
}
.frame.active.open .glass {
  border-color: rgba(255, 140, 140, 0.5);
}
.frame.active.open .switch {
  animation: switchHintRed 1.6s ease-in-out infinite;
}

@keyframes switchHintRed {
  0%, 100% {
    box-shadow: 0 0 0 1px rgba(255, 100, 100, 0.4), 0 0 6px rgba(255, 85, 85, 0.3);
  }
  50% {
    box-shadow: 0 0 0 1px rgba(255, 100, 100, 0.7), 0 0 14px rgba(255, 85, 85, 0.55);
  }
}

@keyframes pulseRed {
  0%, 100% {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      inset 0 -1px 0 rgba(0, 0, 0, 0.25),
      0 0 4px rgba(200, 30, 30, 0.3),
      0 1px 2px rgba(0, 0, 0, 0.3);
  }
  50% {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      inset 0 -1px 0 rgba(0, 0, 0, 0.25),
      0 0 18px rgba(255, 85, 85, 0.6),
      0 1px 2px rgba(0, 0, 0, 0.3);
  }
}

/* Error flash */
.frame.error {
  animation: errorFlash 600ms ease-in-out 1;
}

@keyframes errorFlash {
  0%, 100% { border-color: var(--border); }
  50% { border-color: var(--accent-red); box-shadow: 0 0 8px rgba(255, 85, 85, 0.6); }
}

.hint {
  font-size: 9px;
  color: var(--text-dim);
  text-align: center;
  margin-top: 6px;
  min-height: 12px;
  letter-spacing: 0.5px;
  pointer-events: none;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  .frame.active:not(.open) .glass { animation: none; }
  .frame.open .switch { animation: none; }
  .frame.active.open .switch { animation: none; }
  .frame.error { animation: none; }
  .glass {
    transition:
      transform 120ms linear,
      box-shadow 120ms linear,
      border-color 120ms linear;
  }
  .frame:not(.open) .glass:hover { transform: rotateX(4deg); }
}
```

- [ ] **Step 2: Write failing component tests**

Create `packages/web/src/components/layout/global-hold-switch.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { GlobalHoldSwitch } from "./global-hold-switch";
import type { UseGlobalTfrResult } from "@/hooks/use-global-tfr";

const hookState: { current: UseGlobalTfrResult } = {
  current: {
    state: "idle",
    activeIds: [],
    pending: false,
    error: null,
    issue: vi.fn(),
    lift: vi.fn(),
  },
};

vi.mock("@/hooks/use-global-tfr", () => ({
  useGlobalTfr: () => hookState.current,
}));

function setHook(overrides: Partial<UseGlobalTfrResult>) {
  hookState.current = { ...hookState.current, ...overrides };
}

describe("GlobalHoldSwitch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHook({
      state: "idle",
      activeIds: [],
      pending: false,
      error: null,
      issue: vi.fn(),
      lift: vi.fn(),
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renders the cover button with aria-expanded=false when closed", () => {
    render(<GlobalHoldSwitch />);
    const cover = screen.getByRole("button", { name: /safety cover/i });
    expect(cover.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking the cover opens it and sets aria-expanded=true", () => {
    render(<GlobalHoldSwitch />);
    const cover = screen.getByRole("button", { name: /safety cover/i });
    fireEvent.click(cover);
    expect(cover.getAttribute("aria-expanded")).toBe("true");
  });

  it("switch is role=switch with aria-checked=false when idle", () => {
    render(<GlobalHoldSwitch />);
    const swBtn = screen.getByRole("switch");
    expect(swBtn.getAttribute("aria-checked")).toBe("false");
  });

  it("switch has tabIndex -1 when cover is closed and 0 when open", () => {
    render(<GlobalHoldSwitch />);
    const swBtn = screen.getByRole("switch");
    expect(swBtn.getAttribute("tabindex")).toBe("-1");

    const cover = screen.getByRole("button", { name: /safety cover/i });
    fireEvent.click(cover);

    expect(swBtn.getAttribute("tabindex")).toBe("0");
  });

  it("clicking the switch when cover is open calls issue()", async () => {
    const issue = vi.fn().mockResolvedValue(undefined);
    setHook({ issue });
    render(<GlobalHoldSwitch />);

    fireEvent.click(screen.getByRole("button", { name: /safety cover/i }));
    fireEvent.click(screen.getByRole("switch"));

    expect(issue).toHaveBeenCalled();
  });

  it("clicking the switch when active calls lift()", async () => {
    const lift = vi.fn().mockResolvedValue(undefined);
    setHook({ state: "active", activeIds: ["tfr-1"], lift });
    render(<GlobalHoldSwitch />);

    fireEvent.click(screen.getByRole("button", { name: /safety cover/i }));
    fireEvent.click(screen.getByRole("switch"));

    expect(lift).toHaveBeenCalled();
  });

  it("clicking outside the component closes the cover", () => {
    render(
      <div>
        <GlobalHoldSwitch />
        <button data-testid="outside">outside</button>
      </div>,
    );
    const cover = screen.getByRole("button", { name: /safety cover/i });
    fireEvent.click(cover);
    expect(cover.getAttribute("aria-expanded")).toBe("true");

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(cover.getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape key closes the cover when open", () => {
    render(<GlobalHoldSwitch />);
    const cover = screen.getByRole("button", { name: /safety cover/i });
    fireEvent.click(cover);
    expect(cover.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(cover.getAttribute("aria-expanded")).toBe("false");
  });

  it("mouse leave closes the cover after 150ms grace period", () => {
    render(<GlobalHoldSwitch />);
    const cover = screen.getByRole("button", { name: /safety cover/i });
    fireEvent.click(cover);

    const frame = cover.closest("[data-testid='global-hold-frame']")!;
    fireEvent.mouseLeave(frame);

    // Before grace elapses, still open
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(cover.getAttribute("aria-expanded")).toBe("true");

    // After grace elapses, closed
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(cover.getAttribute("aria-expanded")).toBe("false");
  });

  it("mouse re-entry cancels the grace period", () => {
    render(<GlobalHoldSwitch />);
    const cover = screen.getByRole("button", { name: /safety cover/i });
    fireEvent.click(cover);

    const frame = cover.closest("[data-testid='global-hold-frame']")!;
    fireEvent.mouseLeave(frame);
    fireEvent.mouseEnter(frame);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(cover.getAttribute("aria-expanded")).toBe("true");
  });

  it("6 second inactivity closes the cover", () => {
    render(<GlobalHoldSwitch />);
    const cover = screen.getByRole("button", { name: /safety cover/i });
    fireEvent.click(cover);

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(cover.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders loading state", () => {
    setHook({ state: "loading" });
    render(<GlobalHoldSwitch />);
    // Cover is still clickable but the hint should reflect loading
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it("renders unknown state with warning dot", () => {
    setHook({ state: "unknown" });
    render(<GlobalHoldSwitch />);
    expect(screen.getByText(/unavailable/i)).toBeDefined();
  });

  it("shows error in hint text when hook error is set", () => {
    setHook({ error: new Error("500: boom") });
    render(<GlobalHoldSwitch />);
    expect(screen.getByText(/500: boom/i)).toBeDefined();
  });

  it("switch has aria-busy=true when pending", () => {
    setHook({ pending: true });
    render(<GlobalHoldSwitch />);
    expect(screen.getByRole("switch").getAttribute("aria-busy")).toBe("true");
  });

  it("auto-closes cover 400ms after successful issue", async () => {
    const issue = vi.fn().mockResolvedValue(undefined);
    setHook({ issue });
    render(<GlobalHoldSwitch />);

    fireEvent.click(screen.getByRole("button", { name: /safety cover/i }));
    fireEvent.click(screen.getByRole("switch"));

    // Let the promise resolve
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByRole("button", { name: /safety cover/i }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run test -- packages/web/src/components/layout/global-hold-switch.test.tsx`

Expected: FAIL — module `./global-hold-switch` not found.

- [ ] **Step 4: Implement the component**

Create `packages/web/src/components/layout/global-hold-switch.tsx`:

```tsx
import { useEffect, useRef, useState, useCallback, useId } from "react";
import { useGlobalTfr } from "@/hooks/use-global-tfr";
import { cn } from "@/lib/utils";
import styles from "./global-hold-switch.module.css";

const GRACE_PERIOD_MS = 150;
const INACTIVITY_TIMEOUT_MS = 6000;
const POST_COMMIT_CLOSE_MS = 400;
const ERROR_FLASH_MS = 600;

export function GlobalHoldSwitch() {
  const tfr = useGlobalTfr();
  const [coverOpen, setCoverOpen] = useState(false);
  const [errorFlash, setErrorFlash] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  const frameRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLButtonElement | null>(null);
  const switchRef = useRef<HTMLButtonElement | null>(null);

  const inactivityTimerRef = useRef<number | null>(null);
  const mouseleaveTimerRef = useRef<number | null>(null);
  const commitCloseTimerRef = useRef<number | null>(null);
  const errorFlashTimerRef = useRef<number | null>(null);

  const switchId = useId();

  const isActive = tfr.state === "active";

  const clearTimer = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const closeCover = useCallback(() => {
    setCoverOpen(false);
    clearTimer(inactivityTimerRef);
    clearTimer(mouseleaveTimerRef);
    // Return focus to the cover button
    coverRef.current?.focus();
  }, []);

  const openCover = useCallback(() => {
    if (tfr.state === "loading" || tfr.state === "unknown") return;
    setCoverOpen(true);
    clearTimer(inactivityTimerRef);
    inactivityTimerRef.current = window.setTimeout(() => {
      setCoverOpen(false);
    }, INACTIVITY_TIMEOUT_MS);
  }, [tfr.state]);

  // Focus switch when cover opens
  useEffect(() => {
    if (coverOpen) {
      switchRef.current?.focus();
    }
  }, [coverOpen]);

  // Click-outside and Escape handlers (only while open)
  useEffect(() => {
    if (!coverOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (frameRef.current && !frameRef.current.contains(e.target as Node)) {
        setCoverOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCoverOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [coverOpen]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimer(inactivityTimerRef);
      clearTimer(mouseleaveTimerRef);
      clearTimer(commitCloseTimerRef);
      clearTimer(errorFlashTimerRef);
    };
  }, []);

  const handleCoverClick = () => {
    if (!coverOpen) openCover();
  };

  const handleSwitchClick = async () => {
    if (!coverOpen || tfr.pending) return;
    try {
      if (isActive) {
        await tfr.lift();
        setLiveMessage("Global flight hold lifted");
      } else {
        await tfr.issue();
        setLiveMessage("Global flight hold issued");
      }
      // Auto-close after commit
      clearTimer(commitCloseTimerRef);
      commitCloseTimerRef.current = window.setTimeout(() => {
        setCoverOpen(false);
      }, POST_COMMIT_CLOSE_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      setLiveMessage(`Global flight hold failed: ${message}`);
      setErrorFlash(true);
      clearTimer(errorFlashTimerRef);
      errorFlashTimerRef.current = window.setTimeout(() => {
        setErrorFlash(false);
      }, ERROR_FLASH_MS);
    }
  };

  const handleMouseLeave = () => {
    if (!coverOpen) return;
    clearTimer(mouseleaveTimerRef);
    mouseleaveTimerRef.current = window.setTimeout(() => {
      setCoverOpen(false);
    }, GRACE_PERIOD_MS);
  };

  const handleMouseEnter = () => {
    clearTimer(mouseleaveTimerRef);
  };

  const headerLabel = isActive ? (
    <>
      <span className={styles.labelTopPrefix}>● HOLD ACTIVE —</span> GLOBAL HOLD
    </>
  ) : (
    "GLOBAL HOLD"
  );

  const hintText = (() => {
    if (tfr.error) return tfr.error.message;
    if (tfr.state === "loading") return "Loading hold status...";
    if (tfr.state === "unknown") return "TFR status unavailable";
    if (tfr.pending) return isActive ? "Lifting hold..." : "Issuing hold...";
    if (coverOpen) return isActive ? "Click switch to lift TFR" : "Click switch to issue TFR";
    if (isActive) return "Hold active — click glass to lift";
    return "Click the glass to open";
  })();

  return (
    <div className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
      <div
        ref={frameRef}
        data-testid="global-hold-frame"
        className={cn(
          styles.frame,
          coverOpen && styles.open,
          isActive && styles.active,
          errorFlash && styles.error,
        )}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
      >
        <div className={styles.labelTop}>{headerLabel}</div>
        <div className={styles.switchArea}>
          <span className={styles.switchLabel}>HOLD</span>
          <button
            ref={switchRef}
            id={switchId}
            type="button"
            role="switch"
            aria-checked={isActive}
            aria-label="Global flight hold"
            aria-busy={tfr.pending}
            tabIndex={coverOpen ? 0 : -1}
            disabled={!coverOpen || tfr.pending}
            className={styles.switch}
            onClick={(e) => {
              e.stopPropagation();
              void handleSwitchClick();
            }}
          />
        </div>
        <button
          ref={coverRef}
          type="button"
          aria-label="Global flight hold safety cover"
          aria-expanded={coverOpen}
          aria-controls={switchId}
          className={styles.glass}
          onClick={(e) => {
            e.stopPropagation();
            handleCoverClick();
          }}
        >
          <span className={styles.glassLabel}>LIFT</span>
          <span className={styles.grip} />
        </button>
      </div>
      <div className={styles.hint}>{hintText}</div>
      <div role="status" aria-live="polite" className={styles.srOnly}>
        {liveMessage}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run component tests**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run test -- packages/web/src/components/layout/global-hold-switch.test.tsx`

Expected: PASS — all component tests green. If a test fails because of `getByText` not finding hint text, check that the hint text assertion matches the output exactly.

- [ ] **Step 6: Run all web package tests**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run test -- packages/web`

Expected: PASS — no regressions.

- [ ] **Step 7: Commit**

```bash
cd /Users/mfoulks/Documents/git/atc && git add packages/web/src/components/layout/global-hold-switch.tsx packages/web/src/components/layout/global-hold-switch.module.css packages/web/src/components/layout/global-hold-switch.test.tsx && git commit -m "$(cat <<'EOF'
feat(web): add GlobalHoldSwitch component with two-click safety cover

Presentational component consuming useGlobalTfr. Implements the
cover open/close state machine, 150ms mouseleave grace period, 6s
inactivity timeout, Escape and click-outside bail-outs, and a
400ms post-commit auto-close. Red active state with header rewrite
and pulse animation. Accessible: cover is a button with
aria-expanded, switch has role=switch and aria-checked, pending
state sets aria-busy, live region announces state changes. Respects
prefers-reduced-motion.
EOF
)"
```

---

### Task 5: Sidebar integration

**Files:**
- Modify: `packages/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add import**

In `packages/web/src/components/layout/sidebar.tsx`, add the import near the existing imports at the top:

```ts
import { GlobalHoldSwitch } from "./global-hold-switch";
```

- [ ] **Step 2: Pin the component to the bottom of the sidebar**

Find the `Sidebar` function. Locate the closing `</aside>` tag. Immediately before it, insert the component wrapped in a `mt-auto` div so it pins to the bottom:

```tsx
      <div className="mt-auto">
        <GlobalHoldSwitch />
      </div>
    </aside>
  );
}
```

The final section of the `Sidebar` function should read:

```tsx
      {projectName && <ProjectNav name={projectName} />}
      {pilotSettingsId ? (
        <PilotSettingsNav id={pilotSettingsId} />
      ) : projectSettingsName ? (
        <ProjectSettingsNav name={projectSettingsName} />
      ) : (
        settingsMatch && <SettingsNav />
      )}
      <div className="mt-auto">
        <GlobalHoldSwitch />
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Start the dev server and verify the switch renders at the bottom**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm --filter @airtrafficcontrol/web run dev`

Open `http://localhost:5173` (or whatever port Vite prints). Visually confirm:
- The "GLOBAL HOLD" switch appears at the bottom of the sidebar on every route
- Hovering the glass lifts it slightly and springs back
- Clicking the glass opens the cover and the switch pulses green
- Clicking the switch issues/lifts a TFR (requires the daemon to be running; if not, error state shows)
- The cover closes when you move your mouse away
- Escape closes the cover

Stop the dev server with Ctrl+C.

- [ ] **Step 4: Run all web tests**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run test -- packages/web`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mfoulks/Documents/git/atc && git add packages/web/src/components/layout/sidebar.tsx && git commit -m "$(cat <<'EOF'
feat(web): pin GlobalHoldSwitch to the sidebar bottom

Renders the safety-cover hold switch as the last child of the sidebar
aside via mt-auto. Always visible regardless of the active route.
EOF
)"
```

---

### Task 6: Documentation

**Files:**
- Modify: `packages/daemon/CHANGELOG.md`
- Modify: `docs/rest_api.md`
- Modify: `packages/docs/docs/reference/rest-api.md`

- [ ] **Step 1: Update daemon CHANGELOG**

In `packages/daemon/CHANGELOG.md`, find the `### Added` section under `## Unreleased` and append:

```
- `tfr:global` WebSocket channel — published by the TFR routes when a
  global-scoped TFR is issued (`event: "tfr.issued"`) or lifted
  (`event: "tfr.lifted"`). Payload is a `WsEvent` with
  `data: { tfr: TfrState }`. Project- and craft-scoped TFRs do not
  publish on this channel. Enables dashboards and scripts to react to
  global TFR state changes without polling.
```

- [ ] **Step 2: Update docs/rest_api.md with the new channel**

In `docs/rest_api.md`, find the `## Temporary Flight Restrictions` section. After the `### POST /api/v1/tfrs/:id/lift` subsection, add:

```markdown
### WebSocket channel `tfr:global`

When a global-scoped TFR is issued or lifted, the daemon publishes a
`WsEvent` on the `tfr:global` channel. Subscribe via the standard
WebSocket subscribe message:

```json
{ "type": "subscribe", "channel": "tfr:global" }
```

Event shape:

```ts
{
  type: "event",
  channel: "tfr:global",
  event: "tfr.issued" | "tfr.lifted",
  timestamp: string,   // ISO-8601
  data: {
    tfr: TfrState
  }
}
```

Project- and craft-scoped TFRs do not publish on this channel.
```

- [ ] **Step 3: Mirror to packages/docs/docs/reference/rest-api.md**

In `packages/docs/docs/reference/rest-api.md`, find the `## Temporary Flight Restrictions` section and mirror the same addition. Use `--` in place of em-dashes to match the Docusaurus file's style:

```markdown
### WebSocket channel `tfr:global`

When a global-scoped TFR is issued or lifted, the daemon publishes a
`WsEvent` on the `tfr:global` channel. Subscribe via the standard
WebSocket subscribe message:

```json
{ "type": "subscribe", "channel": "tfr:global" }
```

Event shape:

```ts
{
  type: "event",
  channel: "tfr:global",
  event: "tfr.issued" | "tfr.lifted",
  timestamp: string,   // ISO-8601
  data: {
    tfr: TfrState
  }
}
```

Project- and craft-scoped TFRs do not publish on this channel.
```

- [ ] **Step 4: Commit**

```bash
cd /Users/mfoulks/Documents/git/atc && git add packages/daemon/CHANGELOG.md docs/rest_api.md packages/docs/docs/reference/rest-api.md && git commit -m "$(cat <<'EOF'
docs(tfr): document the tfr:global WebSocket channel

Daemon CHANGELOG entry and REST API reference (top-level + Docusaurus
mirror) for the new tfr:global channel published by tfrRoutes.
EOF
)"
```

---

### Task 7: Final validation

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run test`

Expected: PASS — all tests green. Should be ~760+ tests (was 740 before this plan).

- [ ] **Step 2: Run lint**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run lint`

Expected: No errors. Warnings in pre-existing files are OK.

- [ ] **Step 3: Run format check**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm run format:check`

Expected: No formatting issues in the files added by this plan. If any of the new files fail, run `pnpm run format` and commit the auto-fix.

- [ ] **Step 4: Typecheck the web and daemon packages**

Run: `cd /Users/mfoulks/Documents/git/atc && pnpm --filter @airtrafficcontrol/web exec tsc --noEmit && pnpm --filter @airtrafficcontrol/daemon exec tsc --noEmit`

Expected: Clean (ignoring the 2-3 pre-existing daemon errors in `checklist/runner.ts`, `layered-store.ts`, and `daemon.test.ts` which are unrelated to this work).

- [ ] **Step 5: Manual end-to-end browser check**

Start the daemon and dev server in two shells:

Shell 1:
```bash
cd /Users/mfoulks/Documents/git/atc && pnpm --filter @airtrafficcontrol/daemon run dev
```

Shell 2:
```bash
cd /Users/mfoulks/Documents/git/atc && pnpm --filter @airtrafficcontrol/web run dev
```

Open the web UI in a browser. Verify the full interaction:

1. Sidebar bottom shows "GLOBAL HOLD" with the glass cover. Hint text: "Click the glass to open".
2. Hover the glass → cover peeks up and springs back.
3. Click the glass → cover flips fully up, switch pulses green, hint: "Click switch to issue TFR".
4. Click the switch → the header flashes "● HOLD ACTIVE — GLOBAL HOLD" in red, cover returns to closed after ~400ms, glass gains a red gradient + pulse.
5. Open a second browser tab to the same URL. The second tab should also show the active red state within ~1 second (WebSocket sync).
6. In the first tab, click the red glass → it opens with a red-outlined cover.
7. Click the red switch → header returns to green, glass returns to blue, cover closes. Second tab also updates.
8. Mouse-leave test: click glass, move mouse off the component → cover closes after ~150ms.
9. Click glass, press Escape → cover closes.
10. Click glass, wait 6 seconds → cover closes from inactivity.

Stop both dev servers with Ctrl+C.

- [ ] **Step 6: Push the branch**

```bash
cd /Users/mfoulks/Documents/git/atc && git push origin main
```

Or, if working on a feature branch, substitute the branch name.

---

## Self-Review Notes

**Spec coverage check:** Every section of the design spec maps to at least one task:
- Summary + Design Decisions → covered by architecture choices in the hook and component
- Visual Design (idle/hover/open/active/pending/error states + timings + prefers-reduced-motion) → Task 4 Step 1 (CSS module) and Task 4 Step 4 (component JSX/classnames)
- Interaction Model (cover state, forward flow, abandon paths, direction semantics, external WebSocket changes) → Task 4 Step 4 (component) and Task 3 Step 3 (hook WebSocket handling)
- Server Integration (initial load, issue, lift, pessimistic commit, error handling, WebSocket sync) → Task 3 (hook) and Task 1 (daemon publish)
- Code Structure (hook contract, component contract, accessibility contract, tests) → Tasks 3 and 4
- Daemon changes (`tfr:global` channel publish) → Task 1
- Docs updates → Task 6

**Gaps:** None blocking. The out-of-scope section of the spec lists items that are NOT in this plan (enforcing `holdingPattern` across daemon handlers, graceful mode wind-down, etc.) — those are already on the roadmap and are not addressed here by design.

**Known trade-offs:**
- The hook's `lift()` uses `Promise.allSettled` for parallel lift requests. If a lift call fails, the error thrown is aggregated into a single Error with the first failure's message. The tests assert partial-failure behavior but not the aggregated error message shape.
- The component test for "hover over glass lifts cover" is not included because CSS `:hover` pseudo-classes are not easily testable with RTL (they require real layout). The hover peek is visual polish; functional behavior is locked behind click events which are fully tested.
- `prefers-reduced-motion` behavior is not unit-tested (would require mocking `matchMedia`); verified via manual browser check in Task 7 Step 5.
