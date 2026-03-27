import { describe, expect, it, vi } from "vitest";
import { createShutdownHandler } from "./signals.js";

describe("createShutdownHandler", () => {
  it("calls the callback exactly once on first invocation", async () => {
    const onShutdown = vi.fn().mockResolvedValue(undefined);
    const handler = createShutdownHandler(onShutdown);

    await handler();

    expect(onShutdown).toHaveBeenCalledTimes(1);
  });

  it("does not call the callback again on subsequent invocations", async () => {
    const onShutdown = vi.fn().mockResolvedValue(undefined);
    const handler = createShutdownHandler(onShutdown);

    await handler();
    await handler();
    await handler();

    expect(onShutdown).toHaveBeenCalledTimes(1);
  });
});
