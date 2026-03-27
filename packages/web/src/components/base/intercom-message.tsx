import { SEAT_COLORS } from "@/theme/tokens";
import type { IntercomMessage as IntercomMessageType } from "@/types/api";

interface IntercomMessageProps {
  message: IntercomMessageType;
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export function IntercomMessage({ message }: IntercomMessageProps) {
  const color = SEAT_COLORS[message.seat] ?? "var(--text-muted)";

  return (
    <div
      className="rounded-md p-2 text-[11px]"
      style={{ backgroundColor: "var(--bg-elevated)" }}
    >
      <span style={{ color }}>{message.from}</span>
      <span className="mx-1.5" style={{ color: "var(--text-dim)" }}>
        {formatTime(message.timestamp)}
      </span>
      <div className="mt-1" style={{ color: "var(--text-secondary)" }}>
        {message.content}
      </div>
    </div>
  );
}
