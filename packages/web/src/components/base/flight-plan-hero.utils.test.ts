import { describe, it, expect } from "vitest";
import {
  HERO_GEOMETRY,
  pointAt,
  planeTransform,
  computeSegments,
  computeStats,
  formatDuration,
} from "./flight-plan-hero.utils.js";
import type { CraftState, VectorState } from "@/types/api";

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

function mkCraft(partial: Partial<CraftState> & { flightPlan: VectorState[] }): CraftState {
  return {
    callsign: "TEST-01",
    createdAt: "2026-04-11T00:00:00.000Z",
    branch: "TEST-01",
    cargo: "test",
    category: "test",
    status: "InFlight" as any,
    captain: "p1",
    firstOfficers: [],
    jumpseaters: [],
    blackBox: [],
    intercom: [],
    controls: { mode: "exclusive", holder: "p1" },
    ...partial,
  };
}

describe("computeSegments", () => {
  const now = new Date("2026-04-11T11:00:00.000Z").getTime();

  it("computes measured durations for all passed vectors", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" },
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T03:00:00.000Z" },
        { name: "V3", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T08:00:00.000Z" },
      ],
    });
    const segs = computeSegments(craft, now);
    expect(segs).toHaveLength(3);
    expect(segs[0].durationMs).toBe(2 * 3600_000);
    expect(segs[1].durationMs).toBe(1 * 3600_000);
    expect(segs[2].durationMs).toBe(5 * 3600_000);
    expect(segs.every((s) => s.status === "Passed")).toBe(true);
    expect(segs.every((s) => !s.isCurrent)).toBe(true);
  });

  it("marks the first pending vector as current with live elapsed", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" },
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T08:00:00.000Z" },
        { name: "V3", acceptanceCriteria: "", status: "Pending" },
        { name: "V4", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    expect(segs[2].isCurrent).toBe(true);
    // segment 3 starts at V2.reportedAt (08:00) and elapsed to now (11:00) = 3h
    expect(segs[2].durationMs).toBe(3 * 3600_000);
    expect(segs[3].isCurrent).toBe(false);
  });

  it("uses average of measured segments for pending estimates", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" }, // 2h
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T08:00:00.000Z" }, // 6h
        { name: "V3", acceptanceCriteria: "", status: "Pending" }, // current, 3h elapsed at now
        { name: "V4", acceptanceCriteria: "", status: "Pending" }, // avg = (2+6+3)/3 = 3.67h
      ],
    });
    const segs = computeSegments(craft, now);
    const avgMs = ((2 + 6 + 3) / 3) * 3600_000;
    expect(segs[3].durationMs).toBeCloseTo(avgMs, -2);
    expect(segs[3].isEstimate).toBe(true);
  });

  it("falls back to equal weights when no measured segments exist (Taxiing)", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      status: "Taxiing" as any,
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Pending" },
        { name: "V2", acceptanceCriteria: "", status: "Pending" },
        { name: "V3", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    expect(segs[0].durationMs).toBe(segs[1].durationMs);
    expect(segs[1].durationMs).toBe(segs[2].durationMs);
    expect(segs.every((s) => s.isEstimate)).toBe(true);
    // Taxiing has no current segment
    expect(segs.every((s) => !s.isCurrent)).toBe(true);
  });

  it("includes failed segments in the average", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T04:00:00.000Z" }, // 4h
        { name: "V2", acceptanceCriteria: "", status: "Failed", reportedAt: "2026-04-11T06:00:00.000Z" }, // 2h
        { name: "V3", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    expect(segs[1].status).toBe("Failed");
    // average of measured = (4+2)/2 = 3h
    expect(segs[2].durationMs).toBeCloseTo(3 * 3600_000, -2);
  });

  it("produces monotonic normalized t values that sum to 1", () => {
    const craft = mkCraft({
      createdAt: "2026-04-11T00:00:00.000Z",
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" },
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T03:00:00.000Z" },
        { name: "V3", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    expect(segs[0].tStart).toBe(0);
    expect(segs[segs.length - 1].tEnd).toBeCloseTo(1, 6);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].tStart).toBe(segs[i - 1].tEnd);
    }
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(0)).toBe("0h 00m");
    expect(formatDuration(60_000 * 5)).toBe("0h 05m");
    expect(formatDuration(3600_000)).toBe("1h 00m");
    expect(formatDuration(3600_000 * 11 + 60_000 * 30)).toBe("11h 30m");
  });

  it("guards negatives", () => {
    expect(formatDuration(-1000)).toBe("0h 00m");
  });
});

describe("computeStats", () => {
  const now = new Date("2026-04-11T11:00:00.000Z").getTime();

  it("derives elapsed / eta / progress / status for InFlight", () => {
    const craft = mkCraft({
      status: "InFlight" as any,
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T02:00:00.000Z" },
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T08:00:00.000Z" },
        { name: "V3", acceptanceCriteria: "", status: "Pending" },
        { name: "V4", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    const stats = computeStats(craft, segs, now);
    expect(stats.elapsed).toBe("11h 00m");
    expect(stats.progress).toBe("2 / 4 VECTORS");
    expect(stats.statusLabel).toBe("IN FLIGHT");
    // eta = createdAt + total duration = 0 + (2 + 6 + 3 + avg(2,6,3)≈3.67)h ≈ 14.67h → "~14h 40m"
    expect(stats.eta).toMatch(/^~\d+h \d{2}m$/);
  });

  it("shows TOTAL / landed for a completed craft", () => {
    const craft = mkCraft({
      status: "Landed" as any,
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T05:00:00.000Z" },
        { name: "V2", acceptanceCriteria: "", status: "Passed", reportedAt: "2026-04-11T10:00:00.000Z" },
      ],
    });
    const segs = computeSegments(craft, now);
    const stats = computeStats(craft, segs, now);
    expect(stats.elapsedLabel).toBe("TOTAL");
    expect(stats.elapsed).toBe("10h 00m");
    expect(stats.eta).toBe("—");
    expect(stats.statusLabel).toBe("★ LANDED");
    expect(stats.progress).toBe("2 / 2 VECTORS");
  });

  it("dims everything for Taxiing", () => {
    const craft = mkCraft({
      status: "Taxiing" as any,
      flightPlan: [
        { name: "V1", acceptanceCriteria: "", status: "Pending" },
        { name: "V2", acceptanceCriteria: "", status: "Pending" },
      ],
    });
    const segs = computeSegments(craft, now);
    const stats = computeStats(craft, segs, now);
    expect(stats.elapsed).toBe("—");
    expect(stats.eta).toBe("—");
    expect(stats.progress).toBe("0 / 2 VECTORS");
    expect(stats.statusLabel).toBe("TAXIING");
  });
});
