import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useGlobalTfr } from "./use-global-tfr";
import type { TfrState } from "@/types/api";

// Mock api-client
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock ws-context
type WsListener = (event: {
  type: "event";
  channel: string;
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}) => void;

const mockWsManager = {
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  onEvent: vi.fn<(listener: WsListener) => () => void>(),
};

vi.mock("@/hooks/ws-context", () => ({
  useWsManager: () => mockWsManager,
}));

import { apiClient } from "@/lib/api-client";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeTfr(overrides: Partial<TfrState> = {}): TfrState {
  return {
    identifier: "tfr-1",
    scope: "global",
    target: null,
    mode: "immediate",
    reason: "test",
    issuedBy: "user",
    issuedAt: new Date().toISOString(),
    liftedAt: null,
    ...overrides,
  };
}

describe("useGlobalTfr", () => {
  let wsListener: WsListener | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    wsListener = null;
    mockWsManager.onEvent.mockImplementation((listener) => {
      wsListener = listener;
      return () => {
        wsListener = null;
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in loading state", () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    expect(result.current.state).toBe("loading");
  });

  it("transitions to idle when no global TFRs are active", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([]);
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(result.current.activeIds).toEqual([]);
  });

  it("transitions to active and filters for global scope only", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      makeTfr({ identifier: "tfr-a", scope: "global" }),
      makeTfr({ identifier: "tfr-b", scope: "project", target: "proj" }),
      makeTfr({ identifier: "tfr-c", scope: "global" }),
    ]);
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("active"));
    expect(result.current.activeIds).toEqual(["tfr-a", "tfr-c"]);
  });

  it("transitions to unknown when the initial fetch fails", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error("500: boom"));
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("unknown"));
  });

  it("issue() POSTs with hardcoded defaults and adds identifier on success", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([]);
    vi.mocked(apiClient.post).mockResolvedValue(makeTfr({ identifier: "new-tfr" }));

    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("idle"));

    await act(async () => {
      await result.current.issue();
    });

    expect(apiClient.post).toHaveBeenCalledWith("/api/v1/tfrs", {
      scope: "global",
      target: null,
      mode: "immediate",
      reason: "Sidebar kill switch",
      issuedBy: "user",
    });
    await waitFor(() => expect(result.current.state).toBe("active"));
    expect(result.current.activeIds).toEqual(["new-tfr"]);
  });

  it("lift() fires parallel POSTs for every active id and clears on all-success", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      makeTfr({ identifier: "tfr-a" }),
      makeTfr({ identifier: "tfr-b" }),
    ]);
    vi.mocked(apiClient.post).mockResolvedValue(makeTfr({ liftedAt: new Date().toISOString() }));

    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("active"));

    await act(async () => {
      await result.current.lift();
    });

    expect(apiClient.post).toHaveBeenCalledWith("/api/v1/tfrs/tfr-a/lift");
    expect(apiClient.post).toHaveBeenCalledWith("/api/v1/tfrs/tfr-b/lift");
    expect(result.current.state).toBe("idle");
    expect(result.current.activeIds).toEqual([]);
  });

  it("lift() keeps survivors and throws on partial failure", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      makeTfr({ identifier: "tfr-a" }),
      makeTfr({ identifier: "tfr-b" }),
    ]);
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path.includes("tfr-a")) return makeTfr({ liftedAt: new Date().toISOString() });
      throw new Error("500: boom");
    });

    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("active"));

    await act(async () => {
      await expect(result.current.lift()).rejects.toThrow();
    });

    expect(result.current.state).toBe("active");
    expect(result.current.activeIds).toEqual(["tfr-b"]);
  });

  it("adds id on tfr.issued WebSocket event for global-scope", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([]);
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("idle"));

    expect(mockWsManager.subscribe).toHaveBeenCalledWith("tfr:global");
    expect(wsListener).not.toBeNull();

    act(() => {
      wsListener!({
        type: "event",
        channel: "tfr:global",
        event: "tfr.issued",
        timestamp: new Date().toISOString(),
        data: { tfr: makeTfr({ identifier: "ws-tfr" }) },
      });
    });

    await waitFor(() => expect(result.current.activeIds).toEqual(["ws-tfr"]));
    expect(result.current.state).toBe("active");
  });

  it("removes id on tfr.lifted WebSocket event", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([makeTfr({ identifier: "tfr-a" })]);
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("active"));

    act(() => {
      wsListener!({
        type: "event",
        channel: "tfr:global",
        event: "tfr.lifted",
        timestamp: new Date().toISOString(),
        data: { tfr: makeTfr({ identifier: "tfr-a", liftedAt: new Date().toISOString() }) },
      });
    });

    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(result.current.activeIds).toEqual([]);
  });

  it("ignores duplicate id when WebSocket event arrives for known id", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([makeTfr({ identifier: "tfr-a" })]);
    const { result } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("active"));

    act(() => {
      wsListener!({
        type: "event",
        channel: "tfr:global",
        event: "tfr.issued",
        timestamp: new Date().toISOString(),
        data: { tfr: makeTfr({ identifier: "tfr-a" }) },
      });
    });

    expect(result.current.activeIds).toEqual(["tfr-a"]);
  });

  it("unsubscribes from the channel on unmount", async () => {
    vi.mocked(apiClient.get).mockResolvedValue([]);
    const { result, unmount } = renderHook(() => useGlobalTfr(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    unmount();
    expect(mockWsManager.unsubscribe).toHaveBeenCalledWith("tfr:global");
  });
});
