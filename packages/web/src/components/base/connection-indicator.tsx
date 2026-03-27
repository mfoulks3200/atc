import type { ConnectionStatus } from "@/hooks/use-websocket";

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  url?: string;
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; color: string; dot: string }> = {
  connected: { label: "CONNECTED", color: "var(--accent-green)", dot: "●" },
  connecting: { label: "CONNECTING", color: "var(--accent-yellow)", dot: "○" },
  reconnecting: { label: "RECONNECTING", color: "var(--accent-yellow)", dot: "○" },
  disconnected: { label: "DISCONNECTED", color: "var(--accent-red)", dot: "○" },
};

export function ConnectionIndicator({ status, url }: ConnectionIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-3">
      <span
        className="rounded-sm border px-2 py-0.5 text-[10px]"
        style={{
          color: config.color,
          backgroundColor: `color-mix(in srgb, ${config.color} 10%, transparent)`,
          borderColor: `color-mix(in srgb, ${config.color} 20%, transparent)`,
        }}
      >
        {config.dot} {config.label}
      </span>
      {url && (
        <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
          {url}
        </span>
      )}
    </div>
  );
}
