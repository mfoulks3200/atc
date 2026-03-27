import { EVENT_COLORS } from "@/theme/tokens";

interface FilterPillsProps {
  categories: string[];
  active: Set<string>;
  onChange: (active: Set<string>) => void;
}

export function FilterPills({ categories, active, onChange }: FilterPillsProps) {
  function toggle(cat: string) {
    const next = new Set(active);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
    }
    onChange(next);
  }

  return (
    <div className="flex gap-2">
      {categories.map((cat) => {
        const isActive = active.has(cat);
        const color = EVENT_COLORS[cat] ?? "var(--text-secondary)";

        return (
          <button
            key={cat}
            onClick={() => toggle(cat)}
            className="cursor-pointer rounded-sm border px-2 py-0.5 text-[10px] uppercase"
            style={{
              color: isActive ? color : "var(--text-muted)",
              backgroundColor: isActive
                ? `color-mix(in srgb, ${color} 15%, transparent)`
                : "var(--bg-elevated)",
              borderColor: isActive
                ? `color-mix(in srgb, ${color} 25%, transparent)`
                : "var(--border)",
            }}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
