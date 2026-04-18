import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpotlightProvider, useSpotlight } from "./spotlight-provider";
import { SpotlightAutoStart } from "./spotlight-auto-start";
import type { SpotlightTour } from "./types";
import { STORAGE_KEY } from "./persistence";

class MockResizeObserver {
  constructor(_: ResizeObserverCallback) {}
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

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
  (globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver;
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
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "first-run": { status: "completed", at: "x" } }),
    );
    render(
      <SpotlightProvider tours={{ "first-run": tour }}>
        <ActiveReadout />
        <SpotlightAutoStart tourId="first-run" when={true} />
      </SpotlightProvider>,
    );
    expect(screen.getByTestId("active").textContent).toBe("none");
  });
});
