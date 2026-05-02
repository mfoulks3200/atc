import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityFeed } from "./activity-feed.js";
import type { BlackBoxEntry, BlackBoxVerifyResponse, WsEvent } from "@/types/api";

type EventHandler = (event: WsEvent) => void;

function createMockWsManager() {
  const handlers = new Set<EventHandler>();
  return {
    manager: {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      onEvent: (h: EventHandler) => {
        handlers.add(h);
        return () => handlers.delete(h);
      },
    },
    emit: (event: WsEvent) => {
      for (const h of handlers) h(event);
    },
  };
}

const mock = createMockWsManager();

vi.mock("@/hooks/ws-context", () => ({
  useWsManager: () => mock.manager,
}));

function entry(overrides: Partial<BlackBoxEntry> = {}): BlackBoxEntry {
  return {
    timestamp: "2026-04-14T10:00:00.000Z",
    author: "pilot-a",
    type: "Observation",
    content: "Initial observation",
    ...overrides,
  };
}

function makeVerifyData(
  entries: BlackBoxEntry[],
  overrides: Partial<BlackBoxVerifyResponse> = {},
): BlackBoxVerifyResponse {
  return {
    total: entries.length,
    verified: 0,
    unsigned: entries.length,
    tampered: 0,
    unresolvable: 0,
    entries: entries.map((e) => ({ ...e, verificationState: "unsigned" as const })),
    ...overrides,
  };
}

describe("ActivityFeed", () => {
  it("renders initial black box entries", () => {
    render(
      <ActivityFeed
        callsign="NX-42"
        initial={[
          entry({ type: "CraftCreated", content: "Craft created" }),
          entry({
            timestamp: "2026-04-14T10:00:01.000Z",
            type: "Launched",
            content: "Craft launched",
          }),
        ]}
      />,
    );
    expect(screen.getByText("Craft created")).toBeTruthy();
    expect(screen.getByText("Craft launched")).toBeTruthy();
    expect(screen.getByText("2 entries")).toBeTruthy();
  });

  it("appends entries from craft.blackbox.appended WS events on the craft channel", () => {
    render(<ActivityFeed callsign="NX-42" initial={[]} />);
    act(() => {
      mock.emit({
        type: "event",
        channel: "craft:NX-42",
        event: "craft.blackbox.appended",
        timestamp: "2026-04-14T10:00:05.000Z",
        data: {
          entry: entry({
            timestamp: "2026-04-14T10:00:05.000Z",
            type: "AgentOutput",
            author: "pilot-a",
            content: "hello from stdout",
          }),
        },
      });
    });
    expect(screen.getByText("hello from stdout")).toBeTruthy();
  });

  it("ignores events from other crafts", () => {
    render(<ActivityFeed callsign="NX-42" initial={[]} />);
    act(() => {
      mock.emit({
        type: "event",
        channel: "craft:OTHER",
        event: "craft.blackbox.appended",
        timestamp: "2026-04-14T10:00:05.000Z",
        data: {
          entry: entry({ content: "should not appear" }),
        },
      });
    });
    expect(screen.queryByText("should not appear")).toBeNull();
  });

  it("dedupes entries already present in the initial list", () => {
    const e = entry({ content: "duplicate check", type: "Decision" });
    render(<ActivityFeed callsign="NX-42" initial={[e]} />);
    act(() => {
      mock.emit({
        type: "event",
        channel: "craft:NX-42",
        event: "craft.blackbox.appended",
        timestamp: e.timestamp,
        data: { entry: e },
      });
    });
    expect(screen.getAllByText("duplicate check").length).toBe(1);
    expect(screen.getByText("1 entry")).toBeTruthy();
  });

  it("toggles tail off and shows jump-to-latest when the user scrolls up", async () => {
    const entries = Array.from({ length: 40 }, (_, i) =>
      entry({
        timestamp: `2026-04-14T10:00:${String(i).padStart(2, "0")}.000Z`,
        content: `line ${i}`,
        type: "AgentOutput",
      }),
    );
    const { container } = render(
      <ActivityFeed callsign="NX-42" initial={entries} />,
    );

    const scroller = container.querySelector(".overflow-auto") as HTMLDivElement;
    Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(scroller, "scrollTop", { value: 100, writable: true, configurable: true });
    fireEvent.scroll(scroller);

    expect(await screen.findByText("↓ Jump to latest")).toBeTruthy();
    expect(screen.getByText("Tail paused")).toBeTruthy();

    await userEvent.click(screen.getByText("↓ Jump to latest"));
    expect(screen.queryByText("↓ Jump to latest")).toBeNull();
  });

  describe("integrity bar", () => {
    it("does not render integrity bar when verifyData is not provided", () => {
      render(<ActivityFeed callsign="NX-42" initial={[]} />);
      expect(screen.queryByTestId("integrity-bar")).toBeNull();
    });

    it("does not render integrity bar when all entries are unsigned from keyless pilots", () => {
      const entries = [entry({ type: "Decision", content: "x" })];
      render(
        <ActivityFeed
          callsign="NX-42"
          initial={entries}
          verifyData={makeVerifyData(entries)}
          pilots={[]}
        />,
      );
      expect(screen.queryByTestId("integrity-bar")).toBeNull();
    });

    it("shows red mismatch indicator when tampered > 0", () => {
      const entries = [entry({ content: "bad" })];
      render(
        <ActivityFeed
          callsign="NX-42"
          initial={entries}
          verifyData={makeVerifyData(entries, {
            tampered: 1,
            unsigned: 0,
            entries: [{ ...entries[0], verificationState: "signed-invalid" }],
          })}
          pilots={[]}
        />,
      );
      expect(screen.getByTestId("integrity-bar").textContent).toMatch(/Mismatch on 1 entry/i);
    });

    it("shows amber unresolvable indicator when unresolvable > 0 and tampered === 0", () => {
      const entries = [entry({ content: "ghost" })];
      render(
        <ActivityFeed
          callsign="NX-42"
          initial={entries}
          verifyData={makeVerifyData(entries, {
            unresolvable: 1,
            unsigned: 0,
            entries: [{ ...entries[0], verificationState: "author-not-found" }],
          })}
          pilots={[]}
        />,
      );
      expect(screen.getByTestId("integrity-bar").textContent).toMatch(/1 unresolvable author/i);
    });

    it("shows amber unsigned-keyed indicator when unsigned entry author has a public key", () => {
      const entries = [entry({ content: "keyed", author: "keyed-pilot" })];
      render(
        <ActivityFeed
          callsign="NX-42"
          initial={entries}
          verifyData={makeVerifyData(entries)}
          pilots={[{ identifier: "keyed-pilot", certifications: [], mcpServers: {}, publicKey: "abc" }]}
        />,
      );
      expect(screen.getByTestId("integrity-bar").textContent).toMatch(/1 unsigned from keyed pilot/i);
    });

    it("opens Verification Detail modal when integrity bar is clicked", async () => {
      const entries = [entry({ content: "bad" })];
      render(
        <ActivityFeed
          callsign="NX-42"
          initial={entries}
          verifyData={makeVerifyData(entries, {
            tampered: 1,
            unsigned: 0,
            entries: [{ ...entries[0], verificationState: "signed-invalid" }],
          })}
          pilots={[]}
        />,
      );
      await userEvent.click(screen.getByTestId("integrity-bar"));
      expect(screen.getByTestId("verification-detail-modal")).toBeTruthy();
    });

    it("closes Verification Detail modal on Escape", async () => {
      const entries = [entry({ content: "bad" })];
      render(
        <ActivityFeed
          callsign="NX-42"
          initial={entries}
          verifyData={makeVerifyData(entries, {
            tampered: 1,
            unsigned: 0,
            entries: [{ ...entries[0], verificationState: "signed-invalid" }],
          })}
          pilots={[]}
        />,
      );
      await userEvent.click(screen.getByTestId("integrity-bar"));
      expect(screen.getByTestId("verification-detail-modal")).toBeTruthy();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(screen.queryByTestId("verification-detail-modal")).toBeNull();
    });
  });

  describe("entry verification indicators", () => {
    it("shows no verification icon when verifyData is absent", () => {
      render(<ActivityFeed callsign="NX-42" initial={[entry({ content: "normal" })]} />);
      // No lock/X/? icons rendered
      expect(screen.queryByRole("img", { name: /verified/i })).toBeNull();
      expect(screen.queryByRole("img", { name: /mismatch/i })).toBeNull();
      expect(screen.queryByRole("img", { name: /unresolvable/i })).toBeNull();
    });

    it("shows amber ? icon for author-not-found entries", () => {
      const entries = [entry({ author: "ghost" })];
      render(
        <ActivityFeed
          callsign="NX-42"
          initial={entries}
          verifyData={makeVerifyData(entries, {
            unresolvable: 1,
            unsigned: 0,
            entries: [{ ...entries[0], verificationState: "author-not-found" }],
          })}
          pilots={[]}
        />,
      );
      const icon = screen.getByRole("img", { name: /unresolvable/i });
      expect(icon).toBeTruthy();
    });

    it("shows red ✗ icon for signed-invalid entries", () => {
      const entries = [entry({ author: "bad-pilot" })];
      render(
        <ActivityFeed
          callsign="NX-42"
          initial={entries}
          verifyData={makeVerifyData(entries, {
            tampered: 1,
            unsigned: 0,
            entries: [{ ...entries[0], verificationState: "signed-invalid" }],
          })}
          pilots={[]}
        />,
      );
      expect(screen.getByRole("img", { name: /mismatch/i })).toBeTruthy();
    });
  });
});
