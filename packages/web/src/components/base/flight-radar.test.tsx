import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
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
  const projectNames = Array.from(new Set(crafts.map((c) => c.project)));
  queryClient.setQueryData(
    ["projects"],
    projectNames.map((n) => ({
      name: n,
      remoteUrl: "",
      categories: [],
      checklist: [],
      mcpServers: {},
    })),
  );
  for (const name of projectNames) {
    queryClient.setQueryData(
      ["crafts", name],
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
    const craft = makeCraft({ callsign: "NX-42" });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ["projects"],
      [
        {
          name: "proj-a",
          remoteUrl: "",
          categories: [],
          checklist: [],
          mcpServers: {},
        },
      ],
    );
    queryClient.setQueryData(["crafts", "proj-a"], [craft]);

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<FlightRadar />} />
            <Route
              path="/projects/:project/crafts/:callsign"
              element={<div>CRAFT DETAIL</div>}
            />
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
      {
        project: "proj-a",
        craft: makeCraft({ callsign: "NX-911", status: "Emergency" }),
      },
    ];
    const { container } = renderRadar(crafts);
    const pulsing = container.querySelector("circle.pulse");
    expect(pulsing).not.toBeNull();
  });
});
