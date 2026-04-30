import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component as TowerPage } from "./tower.js";
import type { CraftState, QueueEntry } from "@/types/api";

vi.mock("@/hooks/ws-context", () => ({
  useWsManager: () => ({ subscribe: vi.fn(), unsubscribe: vi.fn(), onEvent: () => () => {} }),
}));

vi.mock("@/hooks/use-subscription", () => ({ useSubscription: vi.fn() }));

vi.mock("@/components/base/page-header", () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

vi.mock("@/components/base/queue-card", () => ({
  QueueCard: ({ craft, position }: { craft: CraftState; position: number }) => (
    <div data-testid={`queue-card-${craft.callsign}`}>position-{position}</div>
  ),
}));

import { useSubscription } from "@/hooks/use-subscription.js";

function makeCraft(overrides: Partial<CraftState> = {}): CraftState {
  return {
    callsign: "NX-42",
    createdAt: "2024-01-01T00:00:00.000Z",
    branch: "feat/test",
    cargo: "payload",
    category: "feature",
    status: "ClearedToLand",
    captain: "pilot-alice",
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "pilot-alice" },
    ...(overrides as object),
  } as CraftState;
}

function renderTowerPage(
  project: string,
  queue: QueueEntry[] | undefined,
  crafts: CraftState[] | undefined,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });

  if (queue !== undefined) queryClient.setQueryData(["tower", project], queue);
  if (crafts !== undefined) queryClient.setQueryData(["crafts", project], crafts);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/projects/${project}/tower`]}>
        <Routes>
          <Route path="/projects/:name/tower" element={<TowerPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Tower queue page", () => {
  it("shows empty state when queue data is not yet loaded", () => {
    renderTowerPage("proj", undefined, []);
    expect(screen.getByText(/Queue is empty/)).toBeTruthy();
  });

  it("shows empty state when queue is an empty array", () => {
    renderTowerPage("proj", [], []);
    expect(screen.getByText(/Queue is empty/)).toBeTruthy();
  });

  it("renders a QueueCard for each craft in the queue", () => {
    const crafts = [makeCraft({ callsign: "NX-1" }), makeCraft({ callsign: "NX-2" })];
    const queue: QueueEntry[] = [
      { callsign: "NX-1", requestedAt: "2024-01-01T00:00:00Z" },
      { callsign: "NX-2", requestedAt: "2024-01-01T00:01:00Z" },
    ];
    renderTowerPage("proj", queue, crafts);
    expect(screen.getByTestId("queue-card-NX-1")).toBeTruthy();
    expect(screen.getByTestId("queue-card-NX-2")).toBeTruthy();
  });

  it("assigns 1-based position to each QueueCard", () => {
    const crafts = [makeCraft({ callsign: "NX-1" })];
    const queue: QueueEntry[] = [{ callsign: "NX-1", requestedAt: "2024-01-01T00:00:00Z" }];
    renderTowerPage("proj", queue, crafts);
    expect(screen.getByTestId("queue-card-NX-1").textContent).toContain("position-1");
  });

  it("renders the runway endpoint marker when the queue has crafts", () => {
    const crafts = [makeCraft({ callsign: "NX-1" })];
    const queue: QueueEntry[] = [{ callsign: "NX-1", requestedAt: "2024-01-01T00:00:00Z" }];
    renderTowerPage("proj", queue, crafts);
    expect(screen.getByText("RUNWAY")).toBeTruthy();
  });

  it("subscribes to the tower:project channel format", () => {
    renderTowerPage("myproject", [], []);
    const mockCalls = vi.mocked(useSubscription).mock.calls;
    expect(mockCalls.some(([, channel]) => channel === "tower:myproject")).toBe(true);
  });
});
