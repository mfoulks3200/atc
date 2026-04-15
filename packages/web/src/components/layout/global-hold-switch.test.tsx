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

  it("Escape key closes the cover when open and returns focus to the cover", () => {
    render(<GlobalHoldSwitch />);
    const cover = screen.getByRole("button", { name: /safety cover/i });
    fireEvent.click(cover);
    expect(cover.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(cover.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(cover);
  });

  it("mouse leave closes the cover after 150ms grace period", () => {
    render(<GlobalHoldSwitch />);
    const cover = screen.getByRole("button", { name: /safety cover/i });
    fireEvent.click(cover);

    const frame = cover.closest("[data-testid='global-hold-frame']")!;
    fireEvent.mouseLeave(frame);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(cover.getAttribute("aria-expanded")).toBe("true");

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
