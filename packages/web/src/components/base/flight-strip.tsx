import { Link } from "react-router";
import { StatusBadge } from "./status-badge";
import { VectorProgress } from "./vector-progress";
import { STATUS_COLORS } from "@/theme/tokens";
import type { CraftState } from "@/types/api";

interface FlightStripProps {
  craft: CraftState;
  project: string;
}

export function FlightStrip({ craft, project }: FlightStripProps) {
  const borderColor = STATUS_COLORS[craft.status] ?? "var(--border)";
  const passedCount = craft.flightPlan.filter((v) => v.status === "Passed").length;

  return (
    <Link
      to={`/projects/${project}/crafts/${craft.callsign}`}
      className="block rounded-md p-2.5 no-underline"
      style={{
        backgroundColor: "var(--bg-elevated)",
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            {craft.callsign}
          </span>
          <StatusBadge status={craft.status} />
        </div>
        <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
          {passedCount}/{craft.flightPlan.length} vectors
        </span>
      </div>
      <VectorProgress vectors={craft.flightPlan} className="mt-2" />
      <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
        CPT: {craft.captain}
        {craft.firstOfficers.length > 0 && ` · FO: ${craft.firstOfficers.join(", ")}`}
      </div>
    </Link>
  );
}
