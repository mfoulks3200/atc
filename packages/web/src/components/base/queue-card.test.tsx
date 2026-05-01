import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueueCard } from "./queue-card.js";
import type { CraftState } from "@/types/api";

function baseCraft(overrides: Partial<CraftState> = {}): CraftState {
  return {
    callsign: "ALPHA-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    branch: "feat/alpha",
    cargo: "Add auth",
    category: "backend",
    status: "ClearedToLand",
    captain: "pilot-bob",
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [
      { name: "v1", acceptanceCriteria: "Done", status: "Passed", evidence: "ok", reportedAt: "" },
    ],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "pilot-bob" },
    ...(overrides as object),
  } as CraftState;
}

describe("QueueCard", () => {
  it("renders callsign, cargo, captain and vector count", () => {
    render(<QueueCard position={1} craft={baseCraft()} label="CLEARED" />);
    expect(screen.getByText("ALPHA-1")).toBeTruthy();
    expect(screen.getByText("Add auth")).toBeTruthy();
    expect(screen.getByText(/pilot-bob/)).toBeTruthy();
    expect(screen.getByText(/1\/1/)).toBeTruthy();
    expect(screen.getByText(/POSITION 1 — CLEARED/i)).toBeTruthy();
  });

  it("shows a checkmark when all vectors passed", () => {
    const { container } = render(<QueueCard position={1} craft={baseCraft()} label="CLEARED" />);
    expect(container.textContent).toContain("✓");
  });

  it("does not show action buttons when no callbacks provided", () => {
    render(<QueueCard position={1} craft={baseCraft()} label="CLEARED" />);
    expect(screen.queryByTestId("grant-clearance-button")).toBeNull();
    expect(screen.queryByTestId("deny-button")).toBeNull();
  });

  it("renders Grant Clearance and Deny buttons when callbacks provided", () => {
    render(
      <QueueCard
        position={1}
        craft={baseCraft()}
        label="CLEARED"
        onMerge={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(screen.getByTestId("grant-clearance-button")).toBeTruthy();
    expect(screen.getByTestId("deny-button")).toBeTruthy();
  });

  it("calls onMerge when Grant Clearance is clicked", async () => {
    const onMerge = vi.fn();
    render(
      <QueueCard
        position={1}
        craft={baseCraft()}
        label="CLEARED"
        onMerge={onMerge}
        onDeny={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId("grant-clearance-button"));
    expect(onMerge).toHaveBeenCalledTimes(1);
  });

  it("calls onDeny when Deny is clicked", async () => {
    const onDeny = vi.fn();
    render(
      <QueueCard
        position={1}
        craft={baseCraft()}
        label="CLEARED"
        onMerge={vi.fn()}
        onDeny={onDeny}
      />,
    );
    await userEvent.click(screen.getByTestId("deny-button"));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons and shows pending label when mergeIsPending", () => {
    render(
      <QueueCard
        position={1}
        craft={baseCraft()}
        label="CLEARED"
        onMerge={vi.fn()}
        onDeny={vi.fn()}
        mergeIsPending
      />,
    );
    const mergeBtn = screen.getByTestId("grant-clearance-button") as HTMLButtonElement;
    const denyBtn = screen.getByTestId("deny-button") as HTMLButtonElement;
    expect(mergeBtn.disabled).toBe(true);
    expect(denyBtn.disabled).toBe(true);
    expect(mergeBtn.textContent).toMatch(/Merging/);
  });

  it("disables both buttons when denyIsPending", () => {
    render(
      <QueueCard
        position={1}
        craft={baseCraft()}
        label="CLEARED"
        onMerge={vi.fn()}
        onDeny={vi.fn()}
        denyIsPending
      />,
    );
    const mergeBtn = screen.getByTestId("grant-clearance-button") as HTMLButtonElement;
    const denyBtn = screen.getByTestId("deny-button") as HTMLButtonElement;
    expect(mergeBtn.disabled).toBe(true);
    expect(denyBtn.disabled).toBe(true);
    expect(denyBtn.textContent).toMatch(/Denying/);
  });

  it("shows inline error message when errorMessage is set", () => {
    render(
      <QueueCard
        position={1}
        craft={baseCraft()}
        label="CLEARED"
        onMerge={vi.fn()}
        onDeny={vi.fn()}
        errorMessage="Merge conflict detected"
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Merge conflict detected");
  });

  it("does not show error area when errorMessage is null", () => {
    render(
      <QueueCard
        position={1}
        craft={baseCraft()}
        label="CLEARED"
        onMerge={vi.fn()}
        onDeny={vi.fn()}
        errorMessage={null}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
