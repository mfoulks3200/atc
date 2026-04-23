import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast, MAX_TOASTS } from "@/hooks/use-toast.js";
import type { ToastSeverity } from "@/hooks/use-toast.js";
import { ToastContainer } from "./toast.js";
import { WsToastBridge } from "@/hooks/use-ws-toasts.js";
import type { WsEvent } from "@/types/api.js";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>
  );
}

function dispatchWsEvent(event: WsEvent) {
  window.dispatchEvent(new CustomEvent("atc-ws-event", { detail: event }));
}

function makeWsEvent(overrides: Partial<WsEvent> = {}): WsEvent {
  return {
    type: "event",
    channel: "craft:alpha-1",
    event: "craft.created",
    timestamp: "2026-04-22T00:00:00.000Z",
    data: {},
    ...overrides,
  };
}

function AddToastButton({ severity = "info" }: { severity?: ToastSeverity }) {
  const { addToast } = useToast();
  return (
    <button
      onClick={() =>
        addToast({ severity, title: `${severity} title`, message: `${severity} message` })
      }
    >
      add toast
    </button>
  );
}

describe("ToastContainer rendering", () => {
  it("renders nothing when the queue is empty", () => {
    const { container } = render(
      <Wrapper>
        <></>
      </Wrapper>,
    );
    expect(container.querySelector('[role="region"]')).toBeNull();
  });

  it("renders an error toast with red color", () => {
    render(
      <Wrapper>
        <AddToastButton severity="error" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("add toast"));

    const title = screen.getByText("error title");
    expect(title).toBeTruthy();
    expect(title.style.color).toContain("var(--accent-red)");
  });

  it("renders a warning toast with yellow color", () => {
    render(
      <Wrapper>
        <AddToastButton severity="warning" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("add toast"));

    const title = screen.getByText("warning title");
    expect(title.style.color).toContain("var(--accent-yellow)");
  });

  it("renders an info toast with blue color", () => {
    render(
      <Wrapper>
        <AddToastButton severity="info" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("add toast"));

    expect(screen.getByText("info title").style.color).toContain("var(--accent-blue)");
  });

  it("renders a success toast with green color", () => {
    render(
      <Wrapper>
        <AddToastButton severity="success" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("add toast"));

    expect(screen.getByText("success title").style.color).toContain("var(--accent-green)");
  });

  it("error toast has role=alert", () => {
    render(
      <Wrapper>
        <AddToastButton severity="error" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("add toast"));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("info toast has role=status", () => {
    render(
      <Wrapper>
        <AddToastButton severity="info" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("add toast"));
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("renders the message text when provided", () => {
    render(
      <Wrapper>
        <AddToastButton severity="info" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("add toast"));
    expect(screen.getByText("info message")).toBeTruthy();
  });
});

describe("manual dismiss", () => {
  it("clicking the dismiss button removes the toast", async () => {
    render(
      <Wrapper>
        <AddToastButton severity="info" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("add toast"));
    expect(screen.getByText("info title")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("info title")).toBeNull();
  });
});

describe("keyboard dismiss", () => {
  it("Escape removes the topmost toast", () => {
    render(
      <Wrapper>
        <AddToastButton severity="warning" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("add toast"));
    expect(screen.getByText("warning title")).toBeTruthy();

    const container = screen.getByRole("region", { name: "Notifications" });
    fireEvent.keyDown(container, { key: "Escape" });
    expect(screen.queryByText("warning title")).toBeNull();
  });
});

describe("auto-dismiss", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes the toast after its duration elapses", () => {
    render(
      <Wrapper>
        <AddToastButton severity="info" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("add toast"));
    expect(screen.getByText("info title")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.queryByText("info title")).toBeNull();
  });

  it("does not remove the toast before its duration elapses", () => {
    render(
      <Wrapper>
        <AddToastButton severity="error" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("add toast"));

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText("error title")).toBeTruthy();
  });
});

describe("toast queue cap", () => {
  it(`keeps at most ${MAX_TOASTS} toasts visible`, () => {
    function MultiAdd() {
      const { addToast } = useToast();
      return (
        <button
          onClick={() => {
            for (let i = 0; i < MAX_TOASTS + 2; i++) {
              addToast({ severity: "info", title: `toast-${i}` });
            }
          }}
        >
          add many
        </button>
      );
    }
    render(
      <ToastProvider>
        <MultiAdd />
        <ToastContainer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("add many"));

    const titles = screen.getAllByRole("status");
    expect(titles.length).toBe(MAX_TOASTS);
  });
});

describe("WsToastBridge event mapping", () => {
  it("craft.emergency.declared → error toast", () => {
    render(
      <ToastProvider>
        <WsToastBridge />
        <ToastContainer />
      </ToastProvider>,
    );
    act(() => {
      dispatchWsEvent(
        makeWsEvent({
          event: "craft.emergency.declared",
          data: {
            callsign: "alpha-1",
            entry: { reason: "engine failure" },
          },
        }),
      );
    });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Emergency Declared")).toBeTruthy();
    expect(screen.getByText("alpha-1: engine failure")).toBeTruthy();
  });

  it("craft.checklist.failed → warning toast", () => {
    render(
      <ToastProvider>
        <WsToastBridge />
        <ToastContainer />
      </ToastProvider>,
    );
    act(() => {
      dispatchWsEvent(
        makeWsEvent({
          event: "craft.checklist.failed",
          data: { callsign: "beta-2" },
        }),
      );
    });
    expect(screen.getByText("Checklist Failed")).toBeTruthy();
    expect(screen.getByText("beta-2")).toBeTruthy();
  });

  it("tfr.issued → warning toast with reason", () => {
    render(
      <ToastProvider>
        <WsToastBridge />
        <ToastContainer />
      </ToastProvider>,
    );
    act(() => {
      dispatchWsEvent(
        makeWsEvent({
          channel: "tfr:global",
          event: "tfr.issued",
          data: { reason: "release freeze" },
        }),
      );
    });
    expect(screen.getByText("TFR Active")).toBeTruthy();
    expect(screen.getByText("release freeze")).toBeTruthy();
  });

  it("tfr.lifted → info toast", () => {
    render(
      <ToastProvider>
        <WsToastBridge />
        <ToastContainer />
      </ToastProvider>,
    );
    act(() => {
      dispatchWsEvent(
        makeWsEvent({
          channel: "tfr:global",
          event: "tfr.lifted",
          data: {},
        }),
      );
    });
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("TFR Lifted")).toBeTruthy();
  });

  it("craft.clearance.granted → success toast", () => {
    render(
      <ToastProvider>
        <WsToastBridge />
        <ToastContainer />
      </ToastProvider>,
    );
    act(() => {
      dispatchWsEvent(
        makeWsEvent({
          event: "craft.clearance.granted",
          data: { callsign: "gamma-3" },
        }),
      );
    });
    expect(screen.getByText("Clearance Granted")).toBeTruthy();
    expect(screen.getByText("gamma-3")).toBeTruthy();
  });

  it("ignores unrelated WS events", () => {
    render(
      <ToastProvider>
        <WsToastBridge />
        <ToastContainer />
      </ToastProvider>,
    );
    act(() => {
      dispatchWsEvent(makeWsEvent({ event: "craft.vector.reported", data: {} }));
    });
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
  });
});
