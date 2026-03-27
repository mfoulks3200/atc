import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "./api-client.js";

describe("apiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches from the correct URL", async () => {
    const mockResponse = { status: "ok" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await apiClient.get("/api/v1/health");

    expect(fetch).toHaveBeenCalledWith("/api/v1/health", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    expect(result).toEqual(mockResponse);
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
    );

    await expect(apiClient.get("/api/v1/projects/nope")).rejects.toThrow("404");
  });

  it("returns empty for 204 responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const result = await apiClient.get("/api/v1/something");
    expect(result).toBeNull();
  });
});
