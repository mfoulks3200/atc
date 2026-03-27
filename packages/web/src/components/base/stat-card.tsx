interface StatCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  color?: string;
}

export function StatCard({ label, value, subtitle, color = "var(--accent-green)" }: StatCardProps) {
  return (
    <div
      className="rounded-md border p-3.5"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
        {label}
      </div>
      <div className="mt-1 text-[28px] font-bold leading-none" style={{ color }}>
        {value}
      </div>
      {subtitle && (
        <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
