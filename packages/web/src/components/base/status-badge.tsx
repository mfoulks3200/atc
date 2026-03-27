import { STATUS_COLORS, AGENT_STATUS_COLORS, VECTOR_STATUS_COLORS } from "@/theme/tokens";

interface StatusBadgeProps {
  status: string;
  variant?: "craft" | "agent" | "vector";
}

const COLOR_MAPS: Record<string, Record<string, string>> = {
  craft: STATUS_COLORS,
  agent: AGENT_STATUS_COLORS,
  vector: VECTOR_STATUS_COLORS,
};

export function StatusBadge({ status, variant = "craft" }: StatusBadgeProps) {
  const colorMap = COLOR_MAPS[variant] ?? STATUS_COLORS;
  const color = colorMap[status] ?? "var(--text-muted)";

  return (
    <span
      className="inline-block rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {status}
    </span>
  );
}
