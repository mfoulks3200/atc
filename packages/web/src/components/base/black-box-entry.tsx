import type { BlackBoxEntry as BlackBoxEntryType } from "@/types/api";
import { HistoricalKeyIndicator } from "./historical-key-indicator.js";

const TYPE_COLORS: Record<string, string> = {
  Decision: "var(--accent-blue)",
  VectorPassed: "var(--accent-green)",
  GoAround: "var(--accent-yellow)",
  Conflict: "var(--accent-red)",
  Observation: "var(--text-dim)",
  EmergencyDeclaration: "var(--accent-red)",
  KeyRotated: "var(--accent-yellow)",
};

const TYPE_LABELS: Record<string, string> = {
  Decision: "DECISION",
  VectorPassed: "VECTOR",
  GoAround: "GO-AROUND",
  Conflict: "CONFLICT",
  Observation: "OBS",
  EmergencyDeclaration: "EMERGENCY",
  KeyRotated: "KEY ROTATED",
};

interface BlackBoxEntryProps {
  entry: BlackBoxEntryType;
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

/** Single row in the Black Box entry list, used in compact/non-live contexts. */
export function BlackBoxEntryRow({ entry }: BlackBoxEntryProps) {
  const color = TYPE_COLORS[entry.type] ?? "var(--text-muted)";
  const label = TYPE_LABELS[entry.type] ?? entry.type;

  return (
    <div
      className="flex items-center border-b py-1.5 text-[11px]"
      style={{ borderColor: "var(--border)" }}
    >
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
      {entry.historicalKey && (
        <span className="ml-1.5">
          <HistoricalKeyIndicator
            author={entry.author}
            keyCreatedAt={entry.historicalKey.createdAt}
            keyRotatedAt={entry.historicalKey.rotatedAt}
          />
        </span>
      )}
    </div>
  );
}
