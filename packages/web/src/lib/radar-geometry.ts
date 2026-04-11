/**
 * Pure geometry + hashing helpers for the Flight Radar hero widget.
 * No React, no DOM — everything here is unit-testable in isolation.
 *
 * @see docs/superpowers/specs/2026-04-11-flight-radar-hero-design.md
 */

/**
 * 32-bit FNV-1a hash of a string. Used as the deterministic seed for
 * every per-craft bearing and jitter decision so a craft's radar position
 * is stable across renders and across operators viewing the same state.
 */
export function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by FNV prime 16777619 using Math.imul for 32-bit semantics,
    // then coerce back to unsigned 32-bit.
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic bearing in [0, 360) for a callsign.
 * This is NOT a real compass heading — it is a pseudo-random but stable
 * angle used purely as a layout hint for the radar.
 */
export function bearingFor(callsign: string): number {
  return fnv1a(`${callsign}:bearing`) % 360;
}

/**
 * Deterministic per-vector angular jitter in degrees in [-5, 5].
 * Lets successive vectors on one craft wobble slightly so tracks don't
 * collapse onto a perfect straight radial line.
 */
export function jitterFor(callsign: string, vectorIndex: number): number {
  const h = fnv1a(`jitter:${callsign}:${vectorIndex}`);
  // Map 32-bit hash into [0, 10), subtract 5 → [-5, 5).
  return (h % 10000) / 1000 - 5;
}

/** A 2D point in SVG user-space coordinates. */
export interface TrackPoint {
  x: number;
  y: number;
}

/** Full SVG geometry for one craft's radar track: origin → vectors → threshold, plus plane position and heading. */
export interface CraftTrack {
  /** Entry point on the outer radar ring. */
  origin: TrackPoint;
  /** One point per flight-plan vector, ordered from origin toward threshold. */
  vectors: TrackPoint[];
  /** Runway threshold point on the inner ring. */
  threshold: TrackPoint;
  /** Heading of the plane icon at its current vector, in SVG degrees. */
  headingDeg: number;
  /** Index into vectors[] where the plane icon sits; -1 if all passed. */
  currentVectorIndex: number;
}

interface ComputeTrackInput {
  callsign: string;
  totalVectors: number;
  /** 0-based index of the first non-passed vector. Equal to totalVectors when all passed. */
  currentVectorIndex: number;
  center: TrackPoint;
  outerRadius: number;
  threshRadius: number;
}

/**
 * Compute the full SVG geometry for a craft's track: origin → vectors → threshold,
 * plus the plane icon's position index and heading. Deterministic given the
 * same input (callsign seeds the bearing and jitter).
 *
 * All angles are in SVG degrees, where 0 = east and 90 = south.
 */
export function computeCraftTrack(input: ComputeTrackInput): CraftTrack {
  const { callsign, totalVectors, center, outerRadius, threshRadius } = input;
  const baseBearingDeg = bearingFor(callsign);

  const toPoint = (radius: number, degrees: number): TrackPoint => {
    const rad = (degrees * Math.PI) / 180;
    return {
      x: center.x + radius * Math.cos(rad),
      y: center.y + radius * Math.sin(rad),
    };
  };

  const origin = toPoint(outerRadius, baseBearingDeg);
  const threshold = toPoint(threshRadius, baseBearingDeg);

  const vectors: TrackPoint[] = [];
  // Distribute vectors evenly between outer ring and threshold (exclusive of
  // the extreme endpoints so the origin/threshold markers stay distinct).
  const span = outerRadius - threshRadius;
  const divisor = Math.max(totalVectors + 1, 2);
  for (let i = 0; i < totalVectors; i++) {
    const t = (i + 1) / divisor;
    const radius = outerRadius - span * t;
    const degrees = baseBearingDeg + jitterFor(callsign, i);
    vectors.push(toPoint(radius, degrees));
  }

  // Plane icon sits at the first non-passed vector, or -1 if all passed.
  const planeIndex = input.currentVectorIndex >= totalVectors ? -1 : input.currentVectorIndex;

  // Heading = direction from the previous point to the current plane point.
  // When planeIndex is 0, use origin as the "previous" point. When -1, fall
  // back to pointing from last vector to threshold.
  let headingDeg: number;
  if (planeIndex === -1) {
    const last = vectors[vectors.length - 1] ?? origin;
    headingDeg = (Math.atan2(threshold.y - last.y, threshold.x - last.x) * 180) / Math.PI;
  } else {
    const prev = planeIndex === 0 ? origin : vectors[planeIndex - 1];
    const curr = vectors[planeIndex];
    headingDeg = (Math.atan2(curr.y - prev.y, curr.x - prev.x) * 180) / Math.PI;
  }

  return {
    origin,
    vectors,
    threshold,
    headingDeg,
    currentVectorIndex: planeIndex,
  };
}
