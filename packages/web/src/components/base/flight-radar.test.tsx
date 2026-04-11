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
