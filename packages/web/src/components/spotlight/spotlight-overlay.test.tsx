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

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(
      () => cb(performance.now()),
      0,
    ) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id as unknown as NodeJS.Timeout)) as typeof cancelAnimationFrame;
}

beforeEach(() => {
  localStorage.clear();
  (globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver;
  document.body.innerHTML = "";
});

afterEach(() => {
  delete (globalThis as unknown as { ResizeObserver?: typeof MockResizeObserver }).ResizeObserver;
});

function mountTarget(id: string) {
  const el = document.createElement("button");
  el.setAttribute("data-spotlight", id);
  el.getBoundingClientRect = () =>
    ({
      top: 100,
      left: 100,
      width: 120,
      height: 40,
      right: 220,
      bottom: 140,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const tour: SpotlightTour = {
  id: "t",
  steps: [
    { id: "welcome", targetId: null, title: "Welcome", body: "Hi." },
    { id: "s1", targetId: "btn", title: "Click me", body: "Here." },
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
    expect(screen.queryByRole("dialog", { name: "Welcome" })).not.toBeNull();
    expect(screen.queryByTestId("spotlight-shade-top")).not.toBeNull();
  });

  it("renders four shade rects when step has a visible target", async () => {
    mountTarget("btn");
    renderApp();
    fireEvent.click(screen.getByText("start"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByTestId("spotlight-shade-top")).not.toBeNull();
    expect(screen.queryByTestId("spotlight-shade-bottom")).not.toBeNull();
    expect(screen.queryByTestId("spotlight-shade-left")).not.toBeNull();
    expect(screen.queryByTestId("spotlight-shade-right")).not.toBeNull();
  });

  it("hides overlay when step has a targetId but target is not mounted", () => {
    renderApp();
    fireEvent.click(screen.getByText("start"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape key", () => {
    renderApp();
    fireEvent.click(screen.getByText("start"));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
