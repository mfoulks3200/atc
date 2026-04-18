import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SpotlightProvider, useSpotlight } from "./spotlight-provider";
import type { SpotlightTour } from "./types";
import { STORAGE_KEY } from "./persistence";

class MockResizeObserver {
  constructor(_: ResizeObserverCallback) {}
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  localStorage.clear();
  (globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver;
});

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
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "first-run": { status: "completed", at: "x" } }),
    );
    const { result } = renderHook(() => useSpotlight(), { wrapper });
    act(() => result.current.start("first-run"));
    expect(result.current.activeTourId).toBeNull();
  });

  it("restart() clears persistence and starts", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "first-run": { status: "completed", at: "x" } }),
    );
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
    act(() => result.current.next());
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.activeTourId).toBeNull();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw["first-run"].status).toBe("completed");
  });
});
