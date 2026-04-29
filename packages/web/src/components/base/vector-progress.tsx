import type { VectorState } from "@/types/api";
import { ADVERSARIAL_REVIEW_ACTIVE_COLOR, VECTOR_STATUS_COLORS } from "@/theme/tokens";

interface VectorProgressProps {
  vectors: VectorState[];
  className?: string;
}

export function VectorProgress({ vectors, className = "" }: VectorProgressProps) {
  return (
    <div className={`flex gap-1 ${className}`}>
      {vectors.map((v) => {
        const isAdversarialPending = v.type === "adversarial_review" && v.status === "Pending";
        const color = isAdversarialPending
          ? ADVERSARIAL_REVIEW_ACTIVE_COLOR
          : (VECTOR_STATUS_COLORS[v.status] ?? "var(--border)");
        const label = v.type === "adversarial_review" ? `${v.name} (adversarial review): ${v.status}` : `${v.name}: ${v.status}`;
        return (
          <div
            key={v.name}
            className="h-1 flex-1 rounded-sm"
            style={{ backgroundColor: color }}
            title={label}
          />
        );
      })}
    </div>
  );
}
