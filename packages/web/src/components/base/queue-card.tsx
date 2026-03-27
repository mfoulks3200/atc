import { StatusBadge } from "./status-badge";
import type { CraftState } from "@/types/api";

interface QueueCardProps {
  position: number;
  craft: CraftState;
  label: string;
}

export function QueueCard({ position, craft, label }: QueueCardProps) {
  const allPassed = craft.flightPlan.every((v) => v.status === "Passed");
  const isCleared = craft.status === "ClearedToLand";
  const borderColor = isCleared ? "var(--accent-green)" : "var(--accent-yellow)";

  return (
    <div
      className="flex-1 rounded-md border p-3.5"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: `color-mix(in srgb, ${borderColor} 30%, transparent)`,
      }}
    >
      <div
        className="mb-2 text-[9px] uppercase tracking-widest"
        style={{ color: borderColor }}
      >
        POSITION {position} — {label}
      </div>
      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {craft.callsign}
      </div>
      <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
        {craft.cargo}
      </div>
      <div className="mt-2 space-y-0.5 text-[10px]">
        <div style={{ color: "var(--text-dim)" }}>
          CPT: <span style={{ color: "var(--text-secondary)" }}>{craft.captain}</span>
        </div>
        <div style={{ color: "var(--text-dim)" }}>
          Vectors:{" "}
          <span style={{ color: allPassed ? "var(--accent-green)" : "var(--text-secondary)" }}>
            {craft.flightPlan.filter((v) => v.status === "Passed").length}/{craft.flightPlan.length}
            {allPassed && " ✓"}
          </span>
        </div>
      </div>
    </div>
  );
}
