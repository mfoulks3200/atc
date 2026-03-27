import type { VectorState } from "@/types/api";
import { VECTOR_STATUS_COLORS } from "@/theme/tokens";

interface VectorProgressProps {
  vectors: VectorState[];
  className?: string;
}

export function VectorProgress({ vectors, className = "" }: VectorProgressProps) {
  return (
    <div className={`flex gap-1 ${className}`}>
      {vectors.map((v) => (
        <div
          key={v.name}
          className="h-1 flex-1 rounded-sm"
          style={{ backgroundColor: VECTOR_STATUS_COLORS[v.status] ?? "var(--border)" }}
          title={`${v.name}: ${v.status}`}
        />
      ))}
    </div>
  );
}
