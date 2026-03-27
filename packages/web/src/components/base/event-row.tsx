import { EVENT_COLORS } from "@/theme/tokens";
import type { WsEvent } from "@/types/api";

interface EventRowProps {
  event: WsEvent;
}

function getCategory(channel: string): string {
  const prefix = channel.split(":")[0];
  return prefix ?? "unknown";
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export function EventRow({ event }: EventRowProps) {
  const category = getCategory(event.channel);
  const color = EVENT_COLORS[category] ?? "var(--text-muted)";

  return (
    <div
      className="grid items-center gap-3 border-b py-1.5 text-[11px]"
      style={{
        gridTemplateColumns: "70px 60px 180px 1fr",
        borderColor: "var(--bg-surface)",
      }}
    >
      <span style={{ color: "var(--text-dim)" }}>{formatTime(event.timestamp)}</span>
      <span
        className="rounded-sm px-1.5 py-px text-center text-[9px]"
        style={{
          color,
          backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        }}
      >
        {category}
      </span>
      <span style={{ color: "var(--accent-yellow)" }}>{event.event}</span>
      <span className="truncate" style={{ color: "var(--text-muted)" }}>
        {JSON.stringify(event.data)}
      </span>
    </div>
  );
}
