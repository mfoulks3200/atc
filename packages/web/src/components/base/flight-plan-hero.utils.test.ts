import { describe, it, expect } from "vitest";
import { HERO_GEOMETRY, pointAt, planeTransform } from "./flight-plan-hero.utils.js";

describe("HERO_GEOMETRY", () => {
  it("exposes fixed arc parameters", () => {
    expect(HERO_GEOMETRY.cx).toBe(450);
    expect(HERO_GEOMETRY.cy).toBe(560);
    expect(HERO_GEOMETRY.r).toBe(400);
    expect(HERO_GEOMETRY.arcStartDeg).toBe(-124);
    expect(HERO_GEOMETRY.arcEndDeg).toBe(-56);
    expect(HERO_GEOMETRY.viewBox).toEqual({ w: 900, h: 320 });
  });
});

describe("pointAt", () => {
  it("returns the depart point at t=0", () => {
    const p = pointAt(0);
    expect(p.x).toBeCloseTo(226.32, 1);
    expect(p.y).toBeCloseTo(228.40, 1);
  });

  it("returns the land point at t=1", () => {
    const p = pointAt(1);
    expect(p.x).toBeCloseTo(673.68, 1);
    expect(p.y).toBeCloseTo(228.40, 1);
  });

  it("returns the arc apex at t=0.5", () => {
    const p = pointAt(0.5);
    expect(p.x).toBeCloseTo(450, 1);
    expect(p.y).toBeCloseTo(160, 1);
  });

  it("always returns points on the r=400 circle", () => {
    for (const t of [0, 0.1, 0.25, 0.37, 0.5, 0.7, 0.83, 1]) {
      const p = pointAt(t);
      const dx = p.x - HERO_GEOMETRY.cx;
      const dy = p.y - HERO_GEOMETRY.cy;
      const dist = Math.hypot(dx, dy);
      expect(dist).toBeCloseTo(HERO_GEOMETRY.r, 3);
    }
  });
});

describe("planeTransform", () => {
  it("aligns the plane tangent at the arc apex (t=0.5)", () => {
    const t = planeTransform(0.5);
    // At apex, tangent points along +x, heading 0°, plane path points up so rotate +90°.
    expect(t.rotateDeg).toBeCloseTo(90, 1);
    expect(t.x).toBeCloseTo(450, 1);
    expect(t.y).toBeCloseTo(160, 1);
  });

  it("aligns the plane tangent at depart (t=0)", () => {
    const t = planeTransform(0);
    // At angle -124°, tangent heading ≈ -34°, plane rotation ≈ 56°.
    expect(t.rotateDeg).toBeCloseTo(56, 1);
  });

  it("aligns the plane tangent at land (t=1)", () => {
    const t = planeTransform(1);
    // At angle -56°, tangent heading ≈ 34°, plane rotation ≈ 124°.
    expect(t.rotateDeg).toBeCloseTo(124, 1);
  });
});
