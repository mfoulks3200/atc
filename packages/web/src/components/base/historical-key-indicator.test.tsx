import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { HistoricalKeyIndicator } from "./historical-key-indicator.js";

const KEY_CREATED_AT = "2026-01-15T08:00:00.000Z";
const KEY_ROTATED_AT = "2026-03-20T12:00:00.000Z";
const AUTHOR = "ghost-rider";

function renderIndicator() {
  return render(
    <HistoricalKeyIndicator
      author={AUTHOR}
      keyCreatedAt={KEY_CREATED_AT}
      keyRotatedAt={KEY_ROTATED_AT}
    />,
  );
}

describe("HistoricalKeyIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the trigger button with accessible label", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-label")).toContain("historical key");
  });

  it("does not show tooltip initially", () => {
    renderIndicator();
    expect(screen.queryByTestId("historical-key-tooltip")).toBeNull();
  });

  it("shows tooltip after 300 ms on mouse enter", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.mouseEnter(trigger);
    expect(screen.queryByTestId("historical-key-tooltip")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId("historical-key-tooltip")).toBeTruthy();
  });

  it("does not show tooltip before 300 ms have elapsed", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(299);
    });

    expect(screen.queryByTestId("historical-key-tooltip")).toBeNull();
  });

  it("hides tooltip on mouse leave before timer fires", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByTestId("historical-key-tooltip")).toBeNull();
  });

  it("hides tooltip when mouse leaves after tooltip is visible", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId("historical-key-tooltip")).toBeTruthy();

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByTestId("historical-key-tooltip")).toBeNull();
  });

  it("shows tooltip after 300 ms on focus", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.focus(trigger);
    expect(screen.queryByTestId("historical-key-tooltip")).toBeNull();

    act(() => { vi.advanceTimersByTime(300); });

    expect(screen.getByTestId("historical-key-tooltip")).toBeTruthy();
  });

  it("hides tooltip on blur", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.focus(trigger);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId("historical-key-tooltip")).toBeTruthy();

    fireEvent.blur(trigger);
    expect(screen.queryByTestId("historical-key-tooltip")).toBeNull();
  });

  it("tooltip has role=tooltip", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(300); });

    const tooltip = screen.getByTestId("historical-key-tooltip");
    expect(tooltip.getAttribute("role")).toBe("tooltip");
  });

  it("trigger has aria-describedby pointing to tooltip id when open", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(300); });

    const tooltip = screen.getByTestId("historical-key-tooltip");
    const describedBy = trigger.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(describedBy).toBe(tooltip.id);
  });

  it("trigger has no aria-describedby when tooltip is closed", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    expect(trigger.getAttribute("aria-describedby")).toBeNull();
  });

  it("tooltip text includes author callsign", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(300); });

    const tooltip = screen.getByTestId("historical-key-tooltip");
    expect(tooltip.textContent).toContain(AUTHOR);
  });

  it("tooltip text includes 'Signature is valid'", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(300); });

    const tooltip = screen.getByTestId("historical-key-tooltip");
    expect(tooltip.textContent).toContain("Signature is valid");
  });

  it("tooltip text includes formatted key creation date", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(300); });

    const tooltip = screen.getByTestId("historical-key-tooltip");
    // en-GB format: "15 Jan 2026"
    expect(tooltip.textContent).toMatch(/Jan 2026/);
  });

  it("tooltip text includes formatted key rotation date", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(300); });

    const tooltip = screen.getByTestId("historical-key-tooltip");
    expect(tooltip.textContent).toMatch(/Mar 2026/);
  });

  it("tooltip text follows the specified format", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(300); });

    const tooltip = screen.getByTestId("historical-key-tooltip");
    expect(tooltip.textContent).toMatch(
      /^Signed with ghost-rider's key from .+\. Key rotated .+\. Signature is valid\.$/,
    );
  });

  it("places tooltip above when trigger has enough space above (top > 56)", () => {
    renderIndicator();
    const trigger = screen.getByTestId("historical-key-trigger");

    // Simulate trigger well below the top of the viewport (top > 56) → top placement
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: 200,
      bottom: 216,
      left: 0,
      right: 16,
      width: 16,
      height: 16,
      x: 0,
      y: 200,
      toJSON: () => ({}),
    });

    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(300); });

    const tooltip = screen.getByTestId("historical-key-tooltip");
    expect(tooltip).toBeTruthy();
    // Top placement sets `bottom` style on the tooltip
    expect(tooltip.style.bottom).toBeTruthy();
  });
});
