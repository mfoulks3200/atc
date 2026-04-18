import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpotlightPopover } from "./spotlight-popover";

type PopoverProps = React.ComponentProps<typeof SpotlightPopover>;

function renderPopover(overrides: Partial<PopoverProps> = {}) {
  const onNext = vi.fn();
  const onBack = vi.fn();
  const onClose = vi.fn();
  render(
    <SpotlightPopover
      title="Launch your first craft"
      body="Click New Craft to start."
      stepIndex={1}
      stepCount={4}
      onNext={onNext}
      onBack={onBack}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onNext, onBack, onClose };
}

describe("SpotlightPopover", () => {
  it("renders title and body", () => {
    renderPopover();
    expect(screen.getByText("Launch your first craft")).not.toBeNull();
    expect(screen.getByText("Click New Craft to start.")).not.toBeNull();
  });

  it("renders progress dots matching stepCount", () => {
    renderPopover({ stepCount: 5, stepIndex: 2 });
    expect(screen.getAllByTestId("spotlight-dot")).toHaveLength(5);
  });

  it("calls onNext when Next is clicked", () => {
    const { onNext } = renderPopover();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("calls onBack when Back is clicked", () => {
    const { onBack } = renderPopover();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("disables Back on first step", () => {
    renderPopover({ stepIndex: 0 });
    const back = screen.getByRole("button", { name: /back/i }) as HTMLButtonElement;
    expect(back.disabled).toBe(true);
  });

  it("shows 'Done' instead of 'Next' on last step and calls onNext when clicked", () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(
      <SpotlightPopover
        title="T"
        body="B"
        stepIndex={3}
        stepCount={4}
        onNext={onNext}
        onBack={onBack}
        onClose={onClose}
      />,
    );
    expect(screen.queryByRole("button", { name: /^next$/i })).toBeNull();
    const done = screen.getByRole("button", { name: /done/i });
    fireEvent.click(done);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when × is clicked", () => {
    const { onClose } = renderPopover();
    fireEvent.click(screen.getByRole("button", { name: /close tour/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
