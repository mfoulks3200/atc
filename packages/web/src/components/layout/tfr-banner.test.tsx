import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TfrBanner } from "./tfr-banner.js";
import type { UseGlobalTfrResult } from "@/hooks/use-global-tfr.js";

vi.mock("@/hooks/use-global-tfr", () => ({
  useGlobalTfr: vi.fn(),
}));

// Import after mock so the mock is in place.
import { useGlobalTfr } from "@/hooks/use-global-tfr.js";

const mockUseGlobalTfr = vi.mocked(useGlobalTfr);

function makeResult(overrides: Partial<UseGlobalTfrResult> = {}): UseGlobalTfrResult {
  return {
    state: "idle",
    activeIds: [],
    pending: false,
    error: null,
    issue: vi.fn(),
    lift: vi.fn(),
    ...overrides,
  };
}

describe("TfrBanner", () => {
  beforeEach(() => {
    mockUseGlobalTfr.mockReturnValue(makeResult());
  });

  // ---------------------------------------------------------------------------
  // Hidden states
  // ---------------------------------------------------------------------------

  it("renders nothing when state is idle", () => {
    mockUseGlobalTfr.mockReturnValue(makeResult({ state: "idle" }));
    const { container } = render(<TfrBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when state is loading", () => {
    mockUseGlobalTfr.mockReturnValue(makeResult({ state: "loading" }));
    const { container } = render(<TfrBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when state is unknown", () => {
    mockUseGlobalTfr.mockReturnValue(makeResult({ state: "unknown" }));
    const { container } = render(<TfrBanner />);
    expect(container.firstChild).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Active state — visibility
  // ---------------------------------------------------------------------------

  it("renders the banner when state is active", () => {
    mockUseGlobalTfr.mockReturnValue(makeResult({ state: "active", activeIds: ["tfr-001"] }));
    render(<TfrBanner />);
    // getByTestId throws if not found — existence assertion.
    expect(screen.getByTestId("tfr-banner")).toBeTruthy();
  });

  it("communicates that operations are restricted", () => {
    mockUseGlobalTfr.mockReturnValue(makeResult({ state: "active", activeIds: ["tfr-001"] }));
    render(<TfrBanner />);
    expect(screen.getByText(/operations restricted/i)).toBeTruthy();
  });

  it("displays TFR active label", () => {
    mockUseGlobalTfr.mockReturnValue(makeResult({ state: "active", activeIds: ["tfr-001"] }));
    render(<TfrBanner />);
    expect(screen.getByText(/tfr active/i)).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Accessibility
  // ---------------------------------------------------------------------------

  it("has role=alert for screen readers", () => {
    mockUseGlobalTfr.mockReturnValue(makeResult({ state: "active", activeIds: ["tfr-001"] }));
    render(<TfrBanner />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("has aria-live=assertive on the banner", () => {
    mockUseGlobalTfr.mockReturnValue(makeResult({ state: "active", activeIds: ["tfr-001"] }));
    render(<TfrBanner />);
    expect(screen.getByRole("alert").getAttribute("aria-live")).toBe("assertive");
  });

  it("has aria-atomic=true on the banner", () => {
    mockUseGlobalTfr.mockReturnValue(makeResult({ state: "active", activeIds: ["tfr-001"] }));
    render(<TfrBanner />);
    expect(screen.getByRole("alert").getAttribute("aria-atomic")).toBe("true");
  });

  // ---------------------------------------------------------------------------
  // Count badge
  // ---------------------------------------------------------------------------

  it("does not show count badge for a single active TFR", () => {
    mockUseGlobalTfr.mockReturnValue(makeResult({ state: "active", activeIds: ["tfr-001"] }));
    render(<TfrBanner />);
    expect(screen.queryByTestId("tfr-banner-count")).toBeNull();
  });

  it("shows count badge when two TFRs are active", () => {
    mockUseGlobalTfr.mockReturnValue(
      makeResult({ state: "active", activeIds: ["tfr-001", "tfr-002"] }),
    );
    render(<TfrBanner />);
    const badge = screen.getByTestId("tfr-banner-count");
    expect(badge.textContent).toBe("(2 active)");
  });

  it("shows count badge when three TFRs are active", () => {
    mockUseGlobalTfr.mockReturnValue(
      makeResult({ state: "active", activeIds: ["tfr-001", "tfr-002", "tfr-003"] }),
    );
    render(<TfrBanner />);
    const badge = screen.getByTestId("tfr-banner-count");
    expect(badge.textContent).toBe("(3 active)");
  });
});
