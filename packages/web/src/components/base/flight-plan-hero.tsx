import { useEffect, useState } from "react";
import type { CraftState } from "@/types/api";
import {
  HERO_GEOMETRY,
  computeSegments,
  pointAt,
  type Segment,
} from "./flight-plan-hero.utils.js";

const DURATION_COLOR = {
  passed: "#3a5a88",
  pending: "#2e4468",
  current: "#a88845",
  failed: "#8a3a3a",
} as const;

/**
 * Builds the SVG arc path `d` attribute for a single segment on the shared circle.
 */
function segmentPath(seg: Segment): string {
  const start = pointAt(seg.tStart);
  const end = pointAt(seg.tEnd);
  const { r } = HERO_GEOMETRY;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
}

function segmentStrokeClass(seg: Segment): string {
  if (seg.status === "Failed") return "arc-failed";
  if (seg.isCurrent) return "arc-current";
  if (seg.status === "Passed") return "arc-passed";
  return "arc-pending";
}

function waypointClass(seg: Segment): string {
  if (seg.status === "Failed") return "waypoint-failed";
  if (seg.isCurrent) return "waypoint-current";
  if (seg.status === "Passed") return "waypoint-passed";
  return "waypoint-pending";
}

export interface FlightPlanHeroProps {
  craft: CraftState;
}

export function FlightPlanHero({ craft }: FlightPlanHeroProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (craft.status === "Taxiing" || craft.status === "Landed" || craft.status === "ReturnToOrigin") {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [craft.status]);

  const segments = computeSegments(craft, now);
  const { viewBox, cx, cy } = HERO_GEOMETRY;
  const departPoint = pointAt(0);
  const landPoint = pointAt(1);

  return (
    <div
      className="overflow-hidden rounded-md border"
      style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)" }}
    >
      <div
        className="border-b px-3 py-2 text-[10px] uppercase tracking-widest"
        style={{ color: "var(--text-dim)", borderColor: "var(--border)", fontFamily: "var(--font-mono)" }}
      >
        Flight plan · Tactical HUD
      </div>
      <svg
        viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", width: "100%", height: "auto" }}
      >
        <defs>
          <style>{`
            .arc-passed  { fill: none; stroke: var(--accent-green); stroke-width: 4;
              filter: drop-shadow(0 0 6px rgba(0,255,136,0.55)) drop-shadow(0 0 12px rgba(0,255,136,0.28)); }
            .arc-current { fill: none; stroke: var(--accent-yellow); stroke-width: 4;
              filter: drop-shadow(0 0 8px rgba(255,216,102,0.7)); }
            .arc-pending { fill: none; stroke: var(--text-dim); stroke-width: 2;
              stroke-dasharray: 4 5; opacity: 0.6; }
            .arc-failed  { fill: none; stroke: var(--accent-red); stroke-width: 4;
              filter: drop-shadow(0 0 6px rgba(255,85,85,0.6)) drop-shadow(0 0 14px rgba(255,85,85,0.3)); }
            .waypoint-passed  { fill: var(--bg-base); stroke: var(--accent-green); stroke-width: 2; }
            .waypoint-current { fill: var(--accent-yellow); stroke: var(--accent-yellow); stroke-width: 2; }
            .waypoint-pending { fill: var(--bg-base); stroke: var(--text-dim); stroke-width: 1.5; }
            .waypoint-failed  { fill: var(--accent-red); stroke: var(--accent-red); stroke-width: 2; }
            .radar-ring { fill: none; stroke: #162033; stroke-width: 1; }
            .grid-line  { stroke: #0f1a2e; stroke-width: 1; }
            .endpoint   { font-size: 9px; letter-spacing: 0.2em; fill: var(--text-dim);
              font-family: var(--font-mono); }
          `}</style>
        </defs>

        {/* radar rings + crosshair */}
        <circle className="radar-ring" cx={cx} cy={cy} r={340} />
        <circle className="radar-ring" cx={cx} cy={cy} r={400} />
        <circle className="radar-ring" cx={cx} cy={cy} r={460} />
        <line className="grid-line" x1={0} y1={228.4} x2={viewBox.w} y2={228.4} />
        <line className="grid-line" x1={cx} y1={0} x2={cx} y2={viewBox.h} />

        {/* endpoints */}
        <text className="endpoint" x={departPoint.x} y={252} textAnchor="middle">
          ◆ DEPART
        </text>
        <text className="endpoint" x={landPoint.x} y={252} textAnchor="middle">
          LAND ◆
        </text>

        {/* arc segments */}
        {segments.map((seg) => (
          <path key={`seg-${seg.index}`} className={segmentStrokeClass(seg)} d={segmentPath(seg)} />
        ))}

        {/* depart marker */}
        <circle cx={departPoint.x} cy={departPoint.y} r={3} fill="var(--accent-green)" />

        {/* waypoints */}
        {segments.map((seg) => {
          const p = pointAt(seg.tEnd);
          const r = seg.isCurrent ? 6 : 5;
          return <circle key={`wp-${seg.index}`} className={waypointClass(seg)} cx={p.x} cy={p.y} r={r} />;
        })}

        {/* X mark on failed waypoints */}
        {segments
          .filter((s) => s.status === "Failed")
          .map((seg) => {
            const p = pointAt(seg.tEnd);
            return (
              <g key={`x-${seg.index}`} transform={`translate(${p.x}, ${p.y})`}>
                <line x1={-3} y1={-3} x2={3} y2={3} stroke="var(--bg-base)" strokeWidth={1.5} />
                <line x1={-3} y1={3} x2={3} y2={-3} stroke="var(--bg-base)" strokeWidth={1.5} />
              </g>
            );
          })}
      </svg>
    </div>
  );
}
