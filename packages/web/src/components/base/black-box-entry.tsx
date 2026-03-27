import type { BlackBoxEntry as BlackBoxEntryType } from "@/types/api";

const TYPE_COLORS: Record<string, string> = {
  Decision: "var(--accent-blue)",
  VectorPassed: "var(--accent-green)",
  GoAround: "var(--accent-yellow)",
  Conflict: "var(--accent-red)",
  Observation: "var(--text-dim)",
  EmergencyDeclaration: "var(--accent-red)",
};

const TYPE_LABELS: Record<string, string> = {
  Decision: "DECISION",
  VectorPassed: "VECTOR",
  GoAround: "GO-AROUND",
  Conflict: "CONFLICT",
  Observation: "OBS",
  EmergencyDeclaration: "EMERGENCY",
};

interface BlackBoxEntryProps {
  entry: BlackBoxEntryType;
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export function BlackBoxEntryRow({ entry }: BlackBoxEntryProps) {
  const color = TYPE_COLORS[entry.type] ?? "var(--text-muted)";
  const label = TYPE_LABELS[entry.type] ?? entry.type;

  return (
    <div className="border-b py-1.5 text-[11px]" style={{ borderColor: "var(--border)" }}>
      <span style={{ color: "var(--text-dim)" }}>{formatTime(entry.timestamp)}</span>
      <span
        className="mx-2 inline-block rounded-sm px-1.5 py-px text-[9px]"
        style={{
          color,
          backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        }}
      >
        {label}
      </span>
      <span style={{ color: "var(--text-muted)" }}>{entry.author}:</span>
      <span style={{ color: "var(--text-secondary)" }}> {entry.content}</span>
    </div>
  );
}
