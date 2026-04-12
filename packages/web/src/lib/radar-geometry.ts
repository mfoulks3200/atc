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

/** Input to the label placement resolver — one per craft label to be placed. */
export interface LabelInput {
  callsign: string;
  /** Plane position the label is attached to. */
  anchor: TrackPoint;
  /** Inbound heading in SVG degrees (0 = east, 90 = south). */
  headingDeg: number;
  /** Rendered label bounding box, in px. */
  bbox: { width: number; height: number };
}

/** A line segment of a craft's route, used for label collision avoidance. */
export interface RouteSegment {
  /** Callsign of the craft that owns this segment. */
  callsign: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Resolved label placement in SVG coordinates, ready to render. */
export interface ResolvedLabel {
  callsign: string;
  /** Leader-line attachment point in SVG coordinates. */
  x: number;
  y: number;
  textAnchor: "start" | "end";
}

interface PlacedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_DISTANCE = 36;
const MAX_DISTANCE = 120;
const DISTANCE_STEP = 4;
const PADDING = 4;

/**
 * Deterministic label placement resolver. For each label, searches along the
 * two perpendiculars of the craft's heading, stepping outward from MIN to MAX
 * distance, rejecting candidates that overlap an already-placed label box or
 * a route segment belonging to another craft. Input order is preserved.
 */
export function resolveLabelPlacements(
  labels: LabelInput[],
  segments: RouteSegment[],
): ResolvedLabel[] {
  const placed: PlacedBox[] = [];
  const results: ResolvedLabel[] = [];

  for (const label of labels) {
    const headingRad = (label.headingDeg * Math.PI) / 180;
    // Perpendicular unit vectors (two sides).
    const perps: Array<{ dx: number; dy: number }> = [
      { dx: -Math.sin(headingRad), dy: Math.cos(headingRad) },
      { dx: Math.sin(headingRad), dy: -Math.cos(headingRad) },
    ];

    let chosen: ResolvedLabel | null = null;
    let chosenBox: PlacedBox | null = null;

    outer: for (let dist = MIN_DISTANCE; dist <= MAX_DISTANCE; dist += DISTANCE_STEP) {
      for (const p of perps) {
        const cx = label.anchor.x + p.dx * dist;
        const cy = label.anchor.y + p.dy * dist;
        const box: PlacedBox = {
          x: cx - label.bbox.width / 2 - PADDING,
          y: cy - label.bbox.height / 2 - PADDING,
          width: label.bbox.width + PADDING * 2,
          height: label.bbox.height + PADDING * 2,
        };
        if (placed.some((other) => boxesOverlap(box, other))) continue;
        if (
          segments.some((seg) => seg.callsign !== label.callsign && segmentIntersectsBox(seg, box))
        ) {
          continue;
        }
        chosen = {
          callsign: label.callsign,
          x: cx,
          y: cy,
          textAnchor: pickTextAnchor(cx - label.anchor.x, cy - label.anchor.y),
        };
        chosenBox = box;
        break outer;
      }
    }

    if (!chosen || !chosenBox) {
      // Graceful fallback: max-distance on first perpendicular, no rejection.
      const p = perps[0];
      const cx = label.anchor.x + p.dx * MAX_DISTANCE;
      const cy = label.anchor.y + p.dy * MAX_DISTANCE;
      chosen = {
        callsign: label.callsign,
        x: cx,
        y: cy,
        textAnchor: pickTextAnchor(cx - label.anchor.x, cy - label.anchor.y),
      };
      chosenBox = {
        x: cx - label.bbox.width / 2 - PADDING,
        y: cy - label.bbox.height / 2 - PADDING,
        width: label.bbox.width + PADDING * 2,
        height: label.bbox.height + PADDING * 2,
      };
    }

    results.push(chosen);
    placed.push(chosenBox);
  }

  return results;
}

function pickTextAnchor(offX: number, offY: number): "start" | "end" {
  if (offX > 0 && offY >= 0 && Math.abs(offX) > Math.abs(offY)) return "start";
  return "end";
}

function boxesOverlap(a: PlacedBox, b: PlacedBox): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function segmentIntersectsBox(seg: RouteSegment, box: PlacedBox): boolean {
  // Cheap AABB reject.
  const segMinX = Math.min(seg.x1, seg.x2);
  const segMaxX = Math.max(seg.x1, seg.x2);
  const segMinY = Math.min(seg.y1, seg.y2);
  const segMaxY = Math.max(seg.y1, seg.y2);
  if (segMaxX < box.x || segMinX > box.x + box.width) return false;
  if (segMaxY < box.y || segMinY > box.y + box.height) return false;
  // Liang-Barsky clip of segment against box.
  let t0 = 0;
  let t1 = 1;
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const p = [-dx, dx, -dy, dy];
  const q = [
    seg.x1 - box.x,
    box.x + box.width - seg.x1,
    seg.y1 - box.y,
    box.y + box.height - seg.y1,
  ];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}
