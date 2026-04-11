import { describe, it, expect } from "vitest";
import { fnv1a, bearingFor, jitterFor } from "./radar-geometry.js";

describe("fnv1a", () => {
  it("is stable for the same input", () => {
    expect(fnv1a("NX-42")).toBe(fnv1a("NX-42"));
  });

  it("has known-answer values", () => {
    // FNV-1a 32-bit offset basis 2166136261, prime 16777619.
    expect(fnv1a("")).toBe(2166136261);
    expect(fnv1a("a")).toBe(3826002220);
    expect(fnv1a("foobar")).toBe(3214735720);
  });

  it("returns an unsigned 32-bit integer", () => {
    const h = fnv1a("anything");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe("bearingFor", () => {
  it("is deterministic", () => {
    expect(bearingFor("NX-42")).toBe(bearingFor("NX-42"));
  });

  it("returns a value in [0, 360)", () => {
    for (const name of ["A", "NX-42", "very-long-callsign", "z"]) {
      const b = bearingFor(name);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });

  it("spreads 20 sample callsigns across at least four quadrants", () => {
    const names = Array.from({ length: 20 }, (_, i) => `NX-${i}`);
    const quadrants = new Set(names.map((n) => Math.floor(bearingFor(n) / 90)));
    expect(quadrants.size).toBeGreaterThanOrEqual(4);
  });
});

describe("jitterFor", () => {
  it("stays within [-5, 5] degrees", () => {
    for (const name of ["A", "NX-42", "callsign-with-many-chars"]) {
      for (let i = 0; i < 10; i++) {
        const j = jitterFor(name, i);
        expect(j).toBeGreaterThanOrEqual(-5);
        expect(j).toBeLessThanOrEqual(5);
      }
    }
  });

  it("is deterministic per (callsign, vectorIndex)", () => {
    expect(jitterFor("NX-42", 0)).toBe(jitterFor("NX-42", 0));
    expect(jitterFor("NX-42", 1)).toBe(jitterFor("NX-42", 1));
  });
});
