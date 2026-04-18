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
  (globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver;
  document.body.innerHTML = "";
});

afterEach(() => {
  delete (globalThis as unknown as { ResizeObserver?: typeof MockResizeObserver }).ResizeObserver;
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

  it("returns rect when target is mounted before hook", async () => {
    mountTarget("foo", { top: 10, left: 20, width: 100, height: 30 });
    const { result } = renderHook(() => useTargetRect("foo"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current?.top).toBe(10);
    expect(result.current?.width).toBe(100);
  });

  it("updates rect when target mounts after hook", async () => {
    const { result } = renderHook(() => useTargetRect("late"));
    expect(result.current).toBeNull();
    await act(async () => {
      mountTarget("late", { top: 50, left: 0, width: 80, height: 20 });
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current?.top).toBe(50);
  });

  it("returns null when target is removed", async () => {
    const el = mountTarget("bye", { top: 0, left: 0, width: 100, height: 30 });
    const { result } = renderHook(() => useTargetRect("bye"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current).not.toBeNull();
    await act(async () => {
      el.remove();
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current).toBeNull();
  });

  it("returns null when targetId is null", () => {
    const { result } = renderHook(() => useTargetRect(null));
    expect(result.current).toBeNull();
  });
});
