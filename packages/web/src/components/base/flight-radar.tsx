import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { useProjects } from "@/hooks/use-api";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import {
  computeCraftTrack,
  resolveLabelPlacements,
  type CraftTrack,
  type ResolvedLabel,
  type RouteSegment,
  type LabelInput,
} from "@/lib/radar-geometry.js";
import type { CraftState, CraftStatus, VectorState } from "@/types/api";

const VIEW_W = 800;
const VIEW_H = 480;
const CENTER_X = 400;
const CENTER_Y = 240;
const OUTER_RADIUS = 320;
const THRESH_RADIUS = 62;
const RING_RADII = [60, 120, 180, 240, 300];
const CHAR_WIDTH = 6;
const CHAR_HEIGHT = 11;

interface FlatCraft {
  project: string;
  craft: CraftState;
}

/**
 * Dashboard hero radar widget. Renders every non-terminal craft across
 * every registered project as a deterministic SVG map with clickable,
 * keyboard-focusable tracks that deep-link to the craft detail route.
 *
 * @see docs/superpowers/specs/2026-04-11-flight-radar-hero-design.md
 */
export function FlightRadar() {
  const { data: projects } = useProjects();
  const wsManager = useWsManager();
  useSubscription(wsManager, "craft.*");

  const projectNames = useMemo(() => (projects ?? []).map((p) => p.name), [projects]);

  return (
    <div className="hidden min-[900px]:block">
      <FlightRadarInner projectNames={projectNames} />
    </div>
  );
}

function FlightRadarInner({ projectNames }: { projectNames: string[] }) {
  const queries = useQueries({
    queries: projectNames.map((name) => ({
      queryKey: queryKeys.crafts.list(name),
      queryFn: () => apiClient.get<CraftState[]>(`/api/v1/projects/${name}/crafts`),
    })),
  });

  // Content-based signature: captures status and flight-plan changes, not just
  // length changes. This ensures the memo invalidates whenever the radar's
  // visual state would differ (new craft, status change, vector progress).
  const contentKey = queries
    .map((q, i) => {
      const list = q.data ?? [];
      return (
        `${projectNames[i]}:` +
        list
          .map(
            (c) =>
              `${c.callsign}:${c.status}:${c.flightPlan.length}:` +
              c.flightPlan.map((v) => v.status).join("-"),
          )
          .join(",")
      );
    })
    .join("|");

  const activeCrafts = useMemo<FlatCraft[]>(() => {
    const out: FlatCraft[] = [];
    projectNames.forEach((name, i) => {
      const list = queries[i]?.data ?? [];
      for (const craft of list) {
        if (craft.status === "Landed" || craft.status === "ReturnToOrigin") continue;
        out.push({ project: name, craft });
      }
    });
    out.sort((a, b) => a.craft.callsign.localeCompare(b.craft.callsign));
    return out;
  }, [contentKey]);

  return <RadarSvg crafts={activeCrafts} />;
}

function RadarSvg({ crafts }: { crafts: FlatCraft[] }) {
  const navigate = useNavigate();
  const [hoveredCallsign, setHoveredCallsign] = useState<string | null>(null);

  const emergencyCount = crafts.filter((c) => c.craft.status === "Emergency").length;

  const tracks = useMemo(() => {
    return crafts
      .filter((c) => {
        if (c.craft.flightPlan.length === 0) {
          warnOnce(c.craft.callsign);
          return false;
        }
        return true;
      })
      .map((c) => {
        const total = c.craft.flightPlan.length;
        const firstPending = c.craft.flightPlan.findIndex(
          (v: VectorState) => v.status !== "Passed",
        );
        const currentIndex = firstPending === -1 ? total : firstPending;
        const track = computeCraftTrack({
          callsign: c.craft.callsign,
          totalVectors: total,
          currentVectorIndex: currentIndex,
          center: { x: CENTER_X, y: CENTER_Y },
          outerRadius: OUTER_RADIUS,
          threshRadius: THRESH_RADIUS,
        });
        return { flat: c, track };
      });
  }, [crafts]);

  const segments: RouteSegment[] = useMemo(() => {
    const out: RouteSegment[] = [];
    for (const { flat, track } of tracks) {
      const points = [track.origin, ...track.vectors, track.threshold];
      for (let i = 0; i < points.length - 1; i++) {
        out.push({
          callsign: flat.craft.callsign,
          x1: points[i].x,
          y1: points[i].y,
          x2: points[i + 1].x,
          y2: points[i + 1].y,
        });
      }
    }
    return out;
  }, [tracks]);

  const labels: ResolvedLabel[] = useMemo(() => {
    const inputs: LabelInput[] = tracks.map(({ flat, track }) => {
      const planeIdx = track.currentVectorIndex;
      const anchor = planeIdx === -1 ? track.threshold : track.vectors[planeIdx];
      return {
        callsign: flat.craft.callsign,
        anchor,
        headingDeg: track.headingDeg,
        bbox: {
          width: flat.craft.callsign.length * CHAR_WIDTH,
          height: CHAR_HEIGHT,
        },
      };
    });
    return resolveLabelPlacements(inputs, segments);
  }, [tracks, segments]);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      style={{ aspectRatio: "16 / 7" }}
      role="img"
      aria-label="Flight radar"
    >
      <defs>
        <filter id="radar-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="rings">
        {RING_RADII.map((r) => (
          <circle
            key={r}
            cx={CENTER_X}
            cy={CENTER_Y}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeOpacity={0.4}
          />
        ))}
      </g>

      <g className="runway">
        <rect
          x={CENTER_X - 40}
          y={CENTER_Y - 6}
          width={80}
          height={12}
          fill="var(--bg-surface)"
          stroke="var(--border)"
        />
      </g>

      {crafts.length === 0 && (
        <text
          x={CENTER_X}
          y={CENTER_Y + 60}
          textAnchor="middle"
          fontSize={12}
          style={{ fill: "var(--text-dim)" }}
        >
          NO INBOUND TRAFFIC
        </text>
      )}

      <g className="tracks" filter="url(#radar-glow)">
        {tracks.map(({ flat, track }) => (
          <CraftGroup
            key={`${flat.project}:${flat.craft.callsign}`}
            flat={flat}
            track={track}
            dimmed={hoveredCallsign !== null && hoveredCallsign !== flat.craft.callsign}
            onEnter={() => setHoveredCallsign(flat.craft.callsign)}
            onLeave={() => setHoveredCallsign(null)}
            onActivate={() =>
              navigate(`/projects/${flat.project}/crafts/${flat.craft.callsign}`)
            }
          />
        ))}
      </g>

      <g className="labels">
        {labels.map((l) => (
          <text
            key={l.callsign}
            x={l.x}
            y={l.y}
            textAnchor={l.textAnchor}
            fontSize={9}
            fontFamily="ui-monospace, monospace"
            style={{ fill: "var(--text-dim)" }}
          >
            {l.callsign}
          </text>
        ))}
      </g>

      <g className="hud">
        <text x={16} y={20} fontSize={9} style={{ fill: "var(--text-dim)" }}>
          KATC RADAR · 40 NM · {crafts.length} INBOUND · {emergencyCount} EMERG
        </text>
        <text
          x={VIEW_W - 16}
          y={20}
          fontSize={9}
          textAnchor="end"
          style={{ fill: "var(--text-dim)" }}
        >
          WIND 270°/08 · QNH 1013
        </text>
        <text x={16} y={VIEW_H - 10} fontSize={9} style={{ fill: "var(--text-dim)" }}>
          SWEEP · LIVE
        </text>
        <text
          x={VIEW_W - 16}
          y={VIEW_H - 10}
          fontSize={9}
          textAnchor="end"
          style={{ fill: "var(--text-dim)" }}
        >
          RWY 09/27 · ACTIVE
        </text>
      </g>
    </svg>
  );
}

interface CraftGroupProps {
  flat: FlatCraft;
  track: CraftTrack;
  dimmed: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onActivate: () => void;
}

function CraftGroup({ flat, track, dimmed, onEnter, onLeave, onActivate }: CraftGroupProps) {
  const { craft } = flat;
  const palette = colorForCraft(craft);
  const isEmergency = craft.status === "Emergency";
  const points = [track.origin, ...track.vectors, track.threshold];
  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const planeIdx = track.currentVectorIndex;
  const planePos = planeIdx === -1 ? track.threshold : track.vectors[planeIdx];
  const total = craft.flightPlan.length;
  const currentHuman = planeIdx === -1 ? total : planeIdx + 1;

  return (
    <g
      role="button"
      tabIndex={0}
      cursor="pointer"
      opacity={dimmed ? 0.3 : 1}
      aria-label={`${craft.callsign} — ${craft.branch}, vector ${currentHuman} of ${total}, status ${craft.status}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <polyline
        points={polyPoints}
        fill="none"
        stroke={palette.stroke}
        strokeWidth={1.5}
        strokeDasharray="4 4"
        strokeOpacity={0.9}
      />
      {track.vectors.map((v, i) => (
        <circle
          key={i}
          cx={v.x}
          cy={v.y}
          r={2.5}
          fill={palette.fill}
          stroke={palette.stroke}
          strokeWidth={0.5}
        />
      ))}
      <circle
        className={isEmergency ? "pulse" : undefined}
        cx={planePos.x}
        cy={planePos.y}
        r={5}
        fill={palette.fill}
        stroke={palette.stroke}
        strokeWidth={1}
      />
    </g>
  );
}

interface Palette {
  stroke: string;
  fill: string;
}

function colorForCraft(craft: CraftState): Palette {
  // TODO: when the server exposes `hasOpenEmergency` (computed from unresolved
  // EmergencyDeclaration blackbox entries), prefer that over status.
  if (craft.status === "Emergency") return { stroke: "#f87171", fill: "#ef4444" };
  switch (craft.status as CraftStatus) {
    case "Taxiing":
    case "InFlight":
      return { stroke: "#22c55e", fill: "#22c55e" };
    case "LandingChecklist":
    case "GoAround":
      return { stroke: "#fbbf24", fill: "#eab308" };
    case "ClearedToLand":
      return { stroke: "#7dd3fc", fill: "#38bdf8" };
    default:
      return { stroke: "var(--text-dim)", fill: "var(--text-dim)" };
  }
}

const warned = new Set<string>();
function warnOnce(callsign: string): void {
  if (warned.has(callsign)) return;
  warned.add(callsign);
  console.warn(`[FlightRadar] skipping ${callsign}: zero vectors`);
}
