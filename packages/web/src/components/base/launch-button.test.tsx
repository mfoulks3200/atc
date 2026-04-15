import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LaunchButton, evaluatePreconditions } from "./launch-button.js";
import type { CraftState } from "@/types/api";

function baseCraft(overrides: Partial<CraftState> = {}): CraftState {
  return {
    callsign: "NX-42",
    branch: "feat/test",
    cargo: "test cargo",
    category: "feature",
    status: "Taxiing",
    captain: "pilot-alice",
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [
      { name: "v1", acceptanceCriteria: "criteria", status: "Pending" },
    ],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "pilot-alice" },
    ...(overrides as object),
  } as CraftState;
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("evaluatePreconditions", () => {
  it("passes when craft is ready", () => {
    expect(evaluatePreconditions(baseCraft()).ok).toBe(true);
  });

  it("rejects non-Taxiing crafts", () => {
    const pre = evaluatePreconditions(baseCraft({ status: "InFlight" }));
    expect(pre.ok).toBe(false);
    expect(pre.message).toMatch(/Taxiing/);
  });

  it("rejects when captain is missing", () => {
    const pre = evaluatePreconditions(baseCraft({ captain: "" }));
    expect(pre.ok).toBe(false);
    expect(pre.message).toMatch(/captain/i);
  });

  it("rejects when flight plan is empty", () => {
    const pre = evaluatePreconditions(baseCraft({ flightPlan: [] }));
    expect(pre.ok).toBe(false);
    expect(pre.message).toMatch(/flight plan|vector/i);
  });

  it("rejects when cargo is missing", () => {
    const pre = evaluatePreconditions(baseCraft({ cargo: "" }));
    expect(pre.ok).toBe(false);
    expect(pre.message).toMatch(/cargo/i);
  });
});

describe("LaunchButton", () => {
  it("does not render outside Taxiing", () => {
    const { container } = renderWithClient(
      <LaunchButton project="p" craft={baseCraft({ status: "InFlight" })} />,
    );
    expect(container.querySelector('[data-testid="launch-button"]')).toBeNull();
  });

  it("renders enabled button and opens a confirmation dialog on click", async () => {
    renderWithClient(<LaunchButton project="p" craft={baseCraft()} />);
    const btn = screen.getByTestId("launch-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    await userEvent.click(btn);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Launch NX-42/)).toBeTruthy();
    expect(screen.getByText("pilot-alice")).toBeTruthy();
    expect(screen.getByText(/1 vector/)).toBeTruthy();
  });

  it("disables the button and shows a reason when the flight plan is empty", () => {
    renderWithClient(
      <LaunchButton project="p" craft={baseCraft({ flightPlan: [] })} />,
    );
    const btn = screen.getByTestId("launch-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId("launch-button-disabled-reason").textContent).toMatch(
      /flight plan|vector/i,
    );
  });

  it("disables the button and shows a reason when captain is missing", () => {
    renderWithClient(
      <LaunchButton project="p" craft={baseCraft({ captain: "" })} />,
    );
    const btn = screen.getByTestId("launch-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId("launch-button-disabled-reason").textContent).toMatch(
      /captain/i,
    );
  });

  it("POSTs to the launch endpoint on confirmation", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...baseCraft(), status: "InFlight" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderWithClient(<LaunchButton project="proj-x" craft={baseCraft()} />);
    await userEvent.click(screen.getByTestId("launch-button"));
    await userEvent.click(screen.getByTestId("launch-confirm-button"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/v1/projects/proj-x/crafts/NX-42/launch");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("surfaces 400 errors (missing captain/cargo/flightPlan) from the daemon", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error:
            "Launch requires captain, cargo, and at least one vector in flightPlan",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderWithClient(<LaunchButton project="p" craft={baseCraft()} />);
    await userEvent.click(screen.getByTestId("launch-button"));
    await userEvent.click(screen.getByTestId("launch-confirm-button"));

    const alert = await screen.findByTestId("launch-error");
    expect(alert.textContent).toMatch(/Launch failed/);
    expect(alert.textContent).toMatch(/captain|cargo|flightPlan/);
    // Dialog stays open so the user can see the error.
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("surfaces 409 errors when the craft is not Taxiing anymore", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "Craft is not Taxiing, current status: InFlight" }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderWithClient(<LaunchButton project="p" craft={baseCraft()} />);
    await userEvent.click(screen.getByTestId("launch-button"));
    await userEvent.click(screen.getByTestId("launch-confirm-button"));

    const alert = await screen.findByTestId("launch-error");
    expect(alert.textContent).toMatch(/409|Taxiing/);
  });

  it("surfaces generic 5xx errors", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderWithClient(<LaunchButton project="p" craft={baseCraft()} />);
    await userEvent.click(screen.getByTestId("launch-button"));
    await userEvent.click(screen.getByTestId("launch-confirm-button"));

    const alert = await screen.findByTestId("launch-error");
    expect(alert.textContent).toMatch(/500|boom/);
  });

  it("closes the dialog on Cancel without firing a request", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    renderWithClient(<LaunchButton project="p" craft={baseCraft()} />);
    await userEvent.click(screen.getByTestId("launch-button"));
    await userEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
