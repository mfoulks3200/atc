import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useGrantMerge, useDenyClearance } from "./use-api.js";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return wrapperFor(makeQueryClient())({ children });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGrantMerge", () => {
  it("POSTs to the tower merge endpoint with the callsign", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ outcome: "landed", status: "Landed" });

    const { result } = renderHook(() => useGrantMerge("proj-x"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ callsign: "ALPHA-1" });
    });

    expect(apiClient.post).toHaveBeenCalledWith("/api/v1/projects/proj-x/tower/merge", {
      callsign: "ALPHA-1",
    });
  });

  it("surfaces errors from the daemon", async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error("409: Craft is not in the merge queue"));

    const { result } = renderHook(() => useGrantMerge("proj-x"), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ callsign: "ALPHA-1" })).rejects.toThrow(
        /409|not in the merge queue/,
      );
    });
  });

  it("invalidates tower queue and crafts list on success", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ outcome: "landed", status: "Landed" });

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useGrantMerge("proj-x"), {
      wrapper: wrapperFor(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ callsign: "ALPHA-1" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tower", "proj-x"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["crafts", "proj-x"] });
  });
});

describe("useDenyClearance", () => {
  it("DELETEs the tower/:callsign endpoint", async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ denied: true });

    const { result } = renderHook(() => useDenyClearance("proj-x"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("ALPHA-1");
    });

    expect(apiClient.delete).toHaveBeenCalledWith("/api/v1/projects/proj-x/tower/ALPHA-1");
  });

  it("surfaces errors from the daemon", async () => {
    vi.mocked(apiClient.delete).mockRejectedValue(new Error("404: Craft not found: ghost"));

    const { result } = renderHook(() => useDenyClearance("proj-x"), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("ghost")).rejects.toThrow(/404|not found/);
    });
  });

  it("invalidates tower queue and crafts list on success", async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(null);

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDenyClearance("proj-x"), {
      wrapper: wrapperFor(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("ALPHA-1");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tower", "proj-x"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["crafts", "proj-x"] });
  });
});
