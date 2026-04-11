/**
 * Pure utilities for the flight-plan hero widget: geometry, segment math,
 * plane orientation, duration formatting, and stats computation.
 *
 * No React, no DOM. Fully unit-testable.
 */

import type { CraftState, VectorStatus } from "@/types/api";

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

// ---------------------------------------------------------------------------
// Segment computation
// ---------------------------------------------------------------------------

export interface Segment {
  /** Vector index (0-based). */
  index: number;
  /** Vector name displayed as the label. */
  name: string;
  /** Status of the trailing vector. */
  status: VectorStatus;
  /** Segment start timestamp in ms (craft.createdAt for i=0, else prev.reportedAt). */
  startMs: number;
  /** Segment end timestamp in ms (undefined if not yet reported). */
  endMs?: number;
  /** Computed duration in ms (measured, live elapsed, or estimate). */
  durationMs: number;
  /** True when this is the first Pending vector after an unbroken run of Passed/Failed. */
  isCurrent: boolean;
  /** True when durationMs is an estimate (average-based) rather than a measurement. */
  isEstimate: boolean;
  /** Normalized position at the START of this segment along the arc, [0, 1]. */
  tStart: number;
  /** Normalized position at the END of this segment along the arc, [0, 1]. */
  tEnd: number;
}

/**
 * Derives segment durations from a craft's flight plan, using:
 *   - craft.createdAt as segment 0 start
 *   - vector[i-1].reportedAt as segment i start (for i > 0)
 *   - vector[i].reportedAt as segment i end
 *   - live elapsed (now - startMs) for the current segment
 *   - arithmetic mean of measured segments for later pending segments
 *   - equal weights if no measured segments exist yet
 *
 * @param craft The craft whose flight plan to segment.
 * @param nowMs Override for Date.now() — test seam.
 * @see RULE-VEC-1
 */
export function computeSegments(craft: CraftState, nowMs: number = Date.now()): Segment[] {
  const createdMs = new Date(craft.createdAt).getTime();
  const vectors = craft.flightPlan;
  const n = vectors.length;
  if (n === 0) {
    return [];
  }

  // Pass 1: raw start/end times and status.
  const raw: Omit<Segment, "durationMs" | "isCurrent" | "isEstimate" | "tStart" | "tEnd">[] = [];
  let prevEnd: number | undefined = undefined;
  for (let i = 0; i < n; i++) {
    const v = vectors[i];
    const startMs = i === 0 ? createdMs : (prevEnd ?? createdMs);
    const endMs = v.reportedAt ? new Date(v.reportedAt).getTime() : undefined;
    raw.push({ index: i, name: v.name, status: v.status, startMs, endMs });
    prevEnd = endMs;
  }

  // Pass 2: identify current segment — first Pending after an unbroken prefix of Passed vectors.
  // A Failed predecessor breaks the active chain (the craft has deviated; no live tracking).
  let currentIdx = -1;
  for (let i = 0; i < n; i++) {
    const status = vectors[i].status;
    if (status === "Failed") {
      // Failed breaks the chain — no current segment is possible.
      break;
    }
    if (status === "Pending") {
      currentIdx = i;
      break;
    }
    // status === "Passed" — continue the chain.
  }
  // Current only counts when the craft has meaningful context. When all vectors are Pending
  // and no segment has ended yet, treat Taxiing as having no current segment.
  const allPending = currentIdx === 0 && raw[0].endMs === undefined;
  if (allPending && craft.status === "Taxiing") {
    currentIdx = -1;
  }

  // Pass 3: measured durations + live elapsed for current.
  const measured: number[] = [];
  const durations: (number | undefined)[] = new Array(n).fill(undefined);
  for (let i = 0; i < n; i++) {
    const { startMs, endMs } = raw[i];
    if (endMs !== undefined) {
      const d = endMs - startMs;
      durations[i] = d;
      measured.push(d);
    } else if (i === currentIdx) {
      const d = Math.max(0, nowMs - startMs);
      durations[i] = d;
      measured.push(d);
    }
  }

  // Pass 4: fill pending estimates with mean of measured (or 1 if nothing measured).
  const avgMs = measured.length > 0 ? measured.reduce((a, b) => a + b, 0) / measured.length : 1;
  for (let i = 0; i < n; i++) {
    if (durations[i] === undefined) {
      durations[i] = avgMs;
    }
  }

  // Pass 5: normalize and assemble.
  const total = durations.reduce<number>((a, b) => a + (b ?? 0), 0) || 1;
  const segments: Segment[] = [];
  let cursorT = 0;
  for (let i = 0; i < n; i++) {
    const d = durations[i] ?? 0;
    const frac = d / total;
    const tStart = cursorT;
    const tEnd = i === n - 1 ? 1 : cursorT + frac;
    cursorT = tEnd;
    const isMeasured = raw[i].endMs !== undefined || i === currentIdx;
    segments.push({
      ...raw[i],
      durationMs: d,
      isCurrent: i === currentIdx,
      isEstimate: !isMeasured,
      tStart,
      tEnd,
    });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Duration formatting + stats
// ---------------------------------------------------------------------------

/**
 * Formats a millisecond duration as "Xh YYm". Negative values clamp to zero.
 */
export function formatDuration(ms: number): string {
  const safe = Math.max(0, ms);
  const totalMinutes = Math.floor(safe / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export interface HeroStats {
  /** Label to show in the top-left slot — "ELAPSED" or "TOTAL". */
  elapsedLabel: string;
  /** Value for the elapsed slot. */
  elapsed: string;
  /** Value for the ETA slot, or "—" when not applicable. */
  eta: string;
  /** Progress readout, e.g. "3 / 6 VECTORS". */
  progress: string;
  /** Status readout, e.g. "IN FLIGHT" or "★ LANDED". */
  statusLabel: string;
  /** Color variant for the status slot. */
  statusTone: "amber" | "green" | "red" | "dim";
}

const STATUS_LABELS: Record<string, { label: string; tone: HeroStats["statusTone"] }> = {
  Taxiing: { label: "TAXIING", tone: "dim" },
  InFlight: { label: "IN FLIGHT", tone: "amber" },
  LandingChecklist: { label: "LANDING CHECKLIST", tone: "amber" },
  ClearedToLand: { label: "CLEARED TO LAND", tone: "amber" },
  GoAround: { label: "GO AROUND", tone: "red" },
  Emergency: { label: "★ EMERGENCY", tone: "red" },
  Landed: { label: "★ LANDED", tone: "green" },
  ReturnToOrigin: { label: "RTO", tone: "dim" },
};

/**
 * Derives the four corner readouts from a craft and its computed segments.
 *
 * @param craft The craft to compute stats for.
 * @param segments Pre-computed segments from {@link computeSegments}.
 * @param nowMs Override for Date.now() — test seam.
 * @see RULE-VEC-1
 */
export function computeStats(craft: CraftState, segments: Segment[], nowMs: number): HeroStats {
  const status = String(craft.status);
  const isTaxiing = status === "Taxiing";
  const isLanded = status === "Landed" || status === "ReturnToOrigin";
  const passedCount = craft.flightPlan.filter((v) => v.status === "Passed").length;
  const total = craft.flightPlan.length;

  const elapsedLabel = isLanded ? "TOTAL" : "ELAPSED";
  let elapsed: string;
  let eta: string;

  if (isTaxiing) {
    elapsed = "—";
    eta = "—";
  } else if (isLanded) {
    const totalMs = segments.reduce((a, s) => a + s.durationMs, 0);
    elapsed = formatDuration(totalMs);
    eta = "—";
  } else {
    const createdMs = new Date(craft.createdAt).getTime();
    elapsed = formatDuration(nowMs - createdMs);
    const totalMs = segments.reduce((a, s) => a + s.durationMs, 0);
    eta = "~" + formatDuration(totalMs);
  }

  const statusEntry = STATUS_LABELS[status] ?? { label: status.toUpperCase(), tone: "dim" as const };

  return {
    elapsedLabel,
    elapsed,
    eta,
    progress: `${passedCount} / ${total} VECTORS`,
    statusLabel: statusEntry.label,
    statusTone: statusEntry.tone,
  };
}
