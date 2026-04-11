/**
 * Pure utilities for the flight-plan hero widget: geometry, segment math,
 * plane orientation, duration formatting, and stats computation.
 *
 * No React, no DOM. Fully unit-testable.
 */

// ---------------------------------------------------------------------------
// Geometry constants
// ---------------------------------------------------------------------------

export const HERO_GEOMETRY = {
  cx: 450,
  cy: 560,
  r: 400,
  arcStartDeg: -124,
  arcEndDeg: -56,
  viewBox: { w: 900, h: 320 },
  labelRail: { nameY: 68, durationY: 79, exitY: 85, margin: 90 },
  leaderKinkY: 100,
} as const;

export interface Point {
  x: number;
  y: number;
}

/**
 * Returns the (x, y) point at normalized position t along the arc,
 * where t=0 is depart and t=1 is land.
 *
 * @see RULE-VEC-1
 */
export function pointAt(t: number): Point {
  const { cx, cy, r, arcStartDeg, arcEndDeg } = HERO_GEOMETRY;
  const angleDeg = arcStartDeg + (arcEndDeg - arcStartDeg) * t;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

export interface PlaneTransform {
  x: number;
  y: number;
  rotateDeg: number;
}

/**
 * Returns the translation + rotation needed to draw the plane glyph
 * at normalized position t with its nose pointing along the arc tangent.
 * The plane path in local coords points up (-y), so we rotate by heading + 90°.
 *
 * @see RULE-VEC-1
 */
export function planeTransform(t: number): PlaneTransform {
  const { arcStartDeg, arcEndDeg } = HERO_GEOMETRY;
  const angleDeg = arcStartDeg + (arcEndDeg - arcStartDeg) * t;
  const angleRad = (angleDeg * Math.PI) / 180;
  // Tangent direction for sweep=1 in SVG y-down is (-sinθ, cosθ).
  const tx = -Math.sin(angleRad);
  const ty = Math.cos(angleRad);
  const headingDeg = (Math.atan2(ty, tx) * 180) / Math.PI;
  const p = pointAt(t);
  return { x: p.x, y: p.y, rotateDeg: headingDeg + 90 };
}
