import { describe, it, expect } from "vitest";
import { deriveTraceId, generateSpanId, generateTraceContext } from "./trace.js";

describe("deriveTraceId", () => {
  it("returns a 32-character hex string", () => {
    const id = deriveTraceId("my-project", "alpha-1");
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is deterministic for the same inputs", () => {
    expect(deriveTraceId("my-project", "alpha-1")).toBe(deriveTraceId("my-project", "alpha-1"));
  });

  it("differs for different project names", () => {
    expect(deriveTraceId("project-a", "alpha-1")).not.toBe(deriveTraceId("project-b", "alpha-1"));
  });

  it("differs for different callsigns", () => {
    expect(deriveTraceId("my-project", "alpha-1")).not.toBe(deriveTraceId("my-project", "bravo-2"));
  });
});

describe("generateSpanId", () => {
  it("returns a 16-character hex string", () => {
    const id = generateSpanId();
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns a different value each time", () => {
    // Low probability of collision for 8-byte random values
    const ids = new Set(Array.from({ length: 20 }, () => generateSpanId()));
    expect(ids.size).toBeGreaterThan(15);
  });
});

describe("generateTraceContext", () => {
  it("returns a root span when parentSpanId is null", () => {
    const ctx = generateTraceContext("my-project", "alpha-1", null);
    expect(ctx.traceId).toHaveLength(32);
    expect(ctx.spanId).toHaveLength(16);
    expect(ctx.parentSpanId).toBeNull();
  });

  it("returns a child span when parentSpanId is provided", () => {
    const parent = generateSpanId();
    const ctx = generateTraceContext("my-project", "alpha-1", parent);
    expect(ctx.parentSpanId).toBe(parent);
    expect(ctx.spanId).not.toBe(parent);
  });

  it("produces the same traceId for the same craft across calls", () => {
    const ctx1 = generateTraceContext("my-project", "alpha-1", null);
    const ctx2 = generateTraceContext("my-project", "alpha-1", null);
    expect(ctx1.traceId).toBe(ctx2.traceId);
  });

  it("produces different spanIds for sequential calls", () => {
    const ctx1 = generateTraceContext("my-project", "alpha-1", null);
    const ctx2 = generateTraceContext("my-project", "alpha-1", ctx1.spanId);
    expect(ctx1.spanId).not.toBe(ctx2.spanId);
  });
});
