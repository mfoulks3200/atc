import { describe, it, expect } from "vitest";
import { fnv1a, bearingFor, jitterFor, computeCraftTrack } from "./radar-geometry.js";
import type { TrackPoint, CraftTrack } from "./radar-geometry.js";

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

describe("computeCraftTrack", () => {
  const center: TrackPoint = { x: 400, y: 240 };
  const outerRadius = 320;
  const threshRadius = 62;

  it("returns totalVectors points in vectors[]", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 4,
      currentVectorIndex: 1,
      center,
      outerRadius,
      threshRadius,
    });
    expect(t.vectors).toHaveLength(4);
  });

  it("places origin near the outer ring", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 3,
      currentVectorIndex: 0,
      center,
      outerRadius,
      threshRadius,
    });
    const dx = t.origin.x - center.x;
    const dy = t.origin.y - center.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    expect(r).toBeGreaterThan(outerRadius - 2);
    expect(r).toBeLessThan(outerRadius + 2);
  });

  it("places threshold near the inner ring", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 3,
      currentVectorIndex: 0,
      center,
      outerRadius,
      threshRadius,
    });
    const dx = t.threshold.x - center.x;
    const dy = t.threshold.y - center.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    expect(r).toBeGreaterThan(threshRadius - 2);
    expect(r).toBeLessThan(threshRadius + 2);
  });

  it("places each vector on or near the base bearing within jitter tolerance", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 5,
      currentVectorIndex: 2,
      center,
      outerRadius,
      threshRadius,
    });
    const baseRad = (bearingFor("NX-42") * Math.PI) / 180;
    for (const v of t.vectors) {
      const angle = Math.atan2(v.y - center.y, v.x - center.x);
      // Difference wrapped into [-pi, pi].
      let diff = angle - baseRad;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      // 5 deg jitter => roughly 0.0873 rad tolerance; give 0.12 for slack.
      expect(Math.abs(diff)).toBeLessThan(0.12);
    }
  });

  it("sets currentVectorIndex to -1 when all vectors passed", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 3,
      currentVectorIndex: 3,
      center,
      outerRadius,
      threshRadius,
    });
    expect(t.currentVectorIndex).toBe(-1);
  });

  it("is deterministic", () => {
    const args = {
      callsign: "NX-42",
      totalVectors: 4,
      currentVectorIndex: 1,
      center,
      outerRadius,
      threshRadius,
    } as const;
    const a = computeCraftTrack(args);
    const b = computeCraftTrack(args);
    expect(a).toEqual(b);
  });

  it("computes headingDeg from origin when planeIndex is 0", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 2,
      currentVectorIndex: 0,
      center,
      outerRadius,
      threshRadius,
    });
    const dx = t.vectors[0].x - t.origin.x;
    const dy = t.vectors[0].y - t.origin.y;
    const expected = (Math.atan2(dy, dx) * 180) / Math.PI;
    expect(t.headingDeg).toBeCloseTo(expected, 5);
  });

  it("computes headingDeg from previous vector when planeIndex > 0", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 3,
      currentVectorIndex: 2,
      center,
      outerRadius,
      threshRadius,
    });
    const dx = t.vectors[2].x - t.vectors[1].x;
    const dy = t.vectors[2].y - t.vectors[1].y;
    const expected = (Math.atan2(dy, dx) * 180) / Math.PI;
    expect(t.headingDeg).toBeCloseTo(expected, 5);
  });

  it("computes headingDeg from last vector to threshold when all vectors passed", () => {
    const t = computeCraftTrack({
      callsign: "NX-42",
      totalVectors: 3,
      currentVectorIndex: 3,
      center,
      outerRadius,
      threshRadius,
    });
    const last = t.vectors[t.vectors.length - 1];
    const dx = t.threshold.x - last.x;
    const dy = t.threshold.y - last.y;
    const expected = (Math.atan2(dy, dx) * 180) / Math.PI;
    expect(t.headingDeg).toBeCloseTo(expected, 5);
  });
});
