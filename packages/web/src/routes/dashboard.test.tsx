import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component as Dashboard } from "./dashboard.js";
import type { CraftState } from "@/types/api";

// ---------------------------------------------------------------------------
// Module mocks (ws-context and use-subscription have no QueryClient equivalent)
// ---------------------------------------------------------------------------

vi.mock("@/hooks/ws-context", () => ({
  useWsManager: () => ({ subscribe: vi.fn(), unsubscribe: vi.fn(), onEvent: () => () => {} }),
}));

vi.mock("@/hooks/use-subscription", () => ({ useSubscription: vi.fn() }));

vi.mock("@/components/base/flight-radar", () => ({
  FlightRadar: () => <div data-testid="flight-radar" />,
}));

vi.mock("@/components/spotlight", () => ({
  SpotlightAutoStart: () => null,
}));

vi.mock("@/components/base/page-header", () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

vi.mock("@/components/base/flight-strip", () => ({
  FlightStrip: ({ craft }: { craft: CraftState }) => (
    <div data-testid={`flight-strip-${craft.callsign}`} />
  ),
}));

vi.mock("@/components/base/event-row", () => ({
  EventRow: () => <div data-testid="event-row" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CraftWithProject = CraftState & { projectName: string };

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
    flightPlan: [],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "pilot-a" },
    ...overrides,
  };
}

/** Build a QueryClient that never refetches seeded data in tests. */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchInterval: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
}

function renderDashboard(allCrafts: CraftWithProject[] | undefined) {
  const queryClient = makeQueryClient();

  queryClient.setQueryData(["status"], { profile: "test", projects: 1, crafts: 3, agents: 2 });
  queryClient.setQueryData(["health"], { version: "1.0.0", uptime: 100 });
  queryClient.setQueryData(["projects"], [
    { name: "proj-a", remoteUrl: "", categories: [], checklist: [], mcpServers: {} },
  ]);

  if (allCrafts !== undefined) {
    queryClient.setQueryData(["crafts", "all"], allCrafts);
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Returns the numeric value shown in the EMERGENCIES stat card. */
function getEmergencyCount(): number {
  // StatCard renders label div then value div as siblings inside the card container
  const labelEl = screen.getByText(/emergencies/i);
  const valueEl = labelEl.nextElementSibling as HTMLElement;
  return Number(valueEl.textContent);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Dashboard — EMERGENCIES stat card", () => {
  it("shows 0 when no craft data has loaded yet", () => {
    renderDashboard(undefined);
    expect(getEmergencyCount()).toBe(0);
  });

  it("shows 0 when the all-crafts list is empty", () => {
    renderDashboard([]);
    expect(getEmergencyCount()).toBe(0);
  });

  it("shows 0 when all crafts have non-Emergency statuses", () => {
    renderDashboard([
      { ...makeCraft({ callsign: "NX-1", status: "InFlight" }), projectName: "proj-a" },
      { ...makeCraft({ callsign: "NX-2", status: "Taxiing" }), projectName: "proj-a" },
      { ...makeCraft({ callsign: "NX-3", status: "Landed" }), projectName: "proj-b" },
    ]);
    expect(getEmergencyCount()).toBe(0);
  });

  it("shows 1 when exactly one craft has Emergency status", () => {
    renderDashboard([
      { ...makeCraft({ callsign: "NX-911", status: "Emergency" }), projectName: "proj-a" },
      { ...makeCraft({ callsign: "NX-2", status: "InFlight" }), projectName: "proj-a" },
    ]);
    expect(getEmergencyCount()).toBe(1);
  });

  it("shows the correct count across multiple projects with mixed statuses", () => {
    renderDashboard([
      { ...makeCraft({ callsign: "NX-1", status: "Emergency" }), projectName: "proj-a" },
      { ...makeCraft({ callsign: "NX-2", status: "InFlight" }), projectName: "proj-a" },
      { ...makeCraft({ callsign: "NX-3", status: "Emergency" }), projectName: "proj-b" },
      { ...makeCraft({ callsign: "NX-4", status: "LandingChecklist" }), projectName: "proj-b" },
      { ...makeCraft({ callsign: "NX-5", status: "Emergency" }), projectName: "proj-c" },
    ]);
    expect(getEmergencyCount()).toBe(3);
  });
});
