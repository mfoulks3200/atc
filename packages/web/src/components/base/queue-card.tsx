import { StatusBadge } from "./status-badge";
import type { CraftState } from "@/types/api";

interface QueueCardProps {
  position: number;
  craft: CraftState;
  label: string;
  onMerge?: () => void;
  onDeny?: () => void;
  mergeIsPending?: boolean;
  denyIsPending?: boolean;
  errorMessage?: string | null;
}

export function QueueCard({
  position,
  craft,
  label,
  onMerge,
  onDeny,
  mergeIsPending,
  denyIsPending,
  errorMessage,
}: QueueCardProps) {
  const allPassed = craft.flightPlan.every((v) => v.status === "Passed");
  const isCleared = craft.status === "ClearedToLand";
  const borderColor = isCleared ? "var(--accent-green)" : "var(--accent-yellow)";
  const anyPending = mergeIsPending || denyIsPending;

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

      {(onMerge || onDeny) && (
        <div className="mt-3 flex gap-2">
          {onMerge && (
            <button
              type="button"
              onClick={onMerge}
              disabled={anyPending}
              data-testid="grant-clearance-button"
              className="flex-1 rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-opacity"
              style={{
                backgroundColor: anyPending ? "var(--bg-elevated)" : "var(--accent-green)",
                color: anyPending ? "var(--text-dim)" : "var(--bg-base)",
                opacity: anyPending ? 0.6 : 1,
                cursor: anyPending ? "not-allowed" : "pointer",
              }}
            >
              {mergeIsPending ? "Merging…" : "Grant Clearance"}
            </button>
          )}
          {onDeny && (
            <button
              type="button"
              onClick={onDeny}
              disabled={anyPending}
              data-testid="deny-button"
              className="flex-1 rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-opacity"
              style={{
                backgroundColor: "var(--bg-elevated)",
                color: anyPending ? "var(--text-dim)" : "var(--accent-red)",
                opacity: anyPending ? 0.6 : 1,
                cursor: anyPending ? "not-allowed" : "pointer",
                border: `1px solid color-mix(in srgb, var(--accent-red) 40%, transparent)`,
              }}
            >
              {denyIsPending ? "Denying…" : "Deny"}
            </button>
          )}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mt-2 rounded px-2 py-1.5 text-[10px]"
          style={{
            backgroundColor: "rgba(255, 85, 85, 0.12)",
            color: "var(--accent-red)",
            border: "1px solid var(--accent-red)",
          }}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}
