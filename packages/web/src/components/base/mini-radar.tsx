import { useEffect, useState } from "react";
import type { CraftState } from "@/types/api";
import {
  HERO_GEOMETRY,
  computeSegments,
  pointAt,
  planeT,
  planeTransform,
  segmentPath,
  segmentStrokeClass,
  waypointClass,
} from "./flight-plan-hero.utils";

/**
 * Compact flight-plan arc — same visual vocabulary as `FlightPlanHero` but
 * stripped to just the arc, waypoints, and current plane position. No HUD
 * chrome, no endpoint labels, no stats. Designed to fit inside a list card
 * at ~180×90px without cropping.
 *
 * The viewBox is cropped tightly around the arc zone of the full hero's
 * 900×320 viewBox so the arc fills the available width.
 */
interface MiniRadarProps {
  craft: CraftState;
  height?: number;
}

export function MiniRadar({ craft, height = 90 }: MiniRadarProps) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (
      craft.status === "Taxiing" ||
      craft.status === "Landed" ||
      craft.status === "ReturnToOrigin"
    ) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [craft.status]);

  const segments = computeSegments(craft, now);
  const planePosT = planeT(craft, segments);
  const plane = planePosT !== null ? planeTransform(planePosT) : null;

  const departPoint = pointAt(0);
  const landPoint = pointAt(1);

  // Crop to just the arc region. The full hero's arc sits roughly in
  // x=[90, 810], y=[150, 240] of its 900×320 viewBox.
  const vx = 70;
  const vy = 130;
  const vw = 760;
  const vh = 130;
  const planeClass =
    craft.status === "Landed"
      ? "plane-green"
      : craft.status === "Emergency" || craft.status === "ReturnToOrigin"
        ? "plane-red"
        : "plane";

  return (
    <svg
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", width: "100%", height }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <style>{`
          .mr-passed  { fill: none; stroke: var(--accent-green); stroke-width: 4;
            filter: drop-shadow(0 0 3px rgba(0,255,136,0.5)); }
          .mr-current { fill: none; stroke: var(--accent-yellow); stroke-width: 4;
            filter: drop-shadow(0 0 4px rgba(255,216,102,0.6)); }
          .mr-pending { fill: none; stroke: var(--text-dim); stroke-width: 2;
            stroke-dasharray: 4 5; opacity: 0.55; }
          .mr-failed  { fill: none; stroke: var(--accent-red); stroke-width: 4;
            filter: drop-shadow(0 0 3px rgba(255,85,85,0.5)); }
          .mr-wp-passed  { fill: var(--bg-surface); stroke: var(--accent-green); stroke-width: 2; }
          .mr-wp-current { fill: var(--accent-yellow); stroke: var(--accent-yellow); stroke-width: 2; }
          .mr-wp-pending { fill: var(--bg-surface); stroke: var(--text-dim); stroke-width: 1.5; }
          .mr-wp-failed  { fill: var(--accent-red); stroke: var(--accent-red); stroke-width: 2; }
          .mr-endpoint   { fill: var(--text-dim); }
          .plane       { fill: var(--accent-yellow);
            filter: drop-shadow(0 0 6px rgba(255,216,102,0.9)); }
          .plane-red   { fill: var(--accent-red);
            filter: drop-shadow(0 0 6px rgba(255,85,85,0.9)); }
          .plane-green { fill: var(--accent-green);
            filter: drop-shadow(0 0 6px rgba(0,255,136,0.9)); }
        `}</style>
      </defs>

      {/* depart / land endpoint dots */}
      <circle className="mr-endpoint" cx={departPoint.x} cy={departPoint.y} r={3} />
      <circle className="mr-endpoint" cx={landPoint.x} cy={landPoint.y} r={3} />

      {/* arc segments (passed/current/pending/failed) */}
      {segments.map((seg) => (
        <path
          key={`mr-seg-${seg.index}`}
          className={segmentStrokeClass(seg, craft.status).replace(/arc-/g, "mr-")}
          d={segmentPath(seg)}
        />
      ))}

      {/* waypoint markers */}
      {segments.map((seg) => {
        const cls = waypointClass(seg).replace(/waypoint-/g, "mr-wp-");
        const end = pointAt(seg.exitT);
        return <circle key={`mr-wp-${seg.index}`} className={cls} cx={end.x} cy={end.y} r={6} />;
      })}

      {/* plane marker */}
      {plane && (
        <g transform={`translate(${plane.x}, ${plane.y}) rotate(${plane.angle})`}>
          <path
            className={planeClass}
            d="M -12 0 L 6 -6 L 14 0 L 6 6 Z"
            transform={`scale(${HERO_GEOMETRY.r / 400})`}
          />
        </g>
      )}
    </svg>
  );
}
