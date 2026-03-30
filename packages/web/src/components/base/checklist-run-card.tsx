import { useState } from "react";
import type { ChecklistRunResult } from "@/types/checklist";
import { ChecklistItemRow } from "./checklist-item-row";

interface ChecklistRunCardProps {
  runs: ChecklistRunResult[];
}

export function ChecklistRunCard({ runs }: ChecklistRunCardProps) {
  const maxAttempt = Math.max(...runs.map((r) => r.attempt));
  const [selectedAttempt, setSelectedAttempt] = useState(maxAttempt);

  const currentRun = runs.find((r) => r.attempt === selectedAttempt);
  if (!currentRun) return null;

  const failedAttempts = runs.filter((r) => !r.passed).length;

  function priorFailuresForItem(itemName: string): number {
    return runs
      .filter((r) => r.attempt < selectedAttempt)
      .reduce((count, r) => {
        const item = r.items.find((i) => i.name === itemName);
        return count + (item && !item.passed ? 1 : 0);
      }, 0);
  }

  return (
    <div className="rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            Attempt
          </span>
          <div className="flex gap-1">
            {runs.map((r) => (
              <button
                key={r.attempt}
                onClick={() => setSelectedAttempt(r.attempt)}
                className="rounded px-2.5 py-0.5 text-xs"
                style={{
                  background: r.attempt === selectedAttempt ? "var(--accent-blue, #3b82f6)" : "var(--bg-elevated)",
                  color: r.attempt === selectedAttempt ? "white" : "var(--text-dim)",
                  fontWeight: r.attempt === selectedAttempt ? 500 : 400,
                }}
              >
                {r.attempt}
              </button>
            ))}
          </div>
        </div>
        {failedAttempts > 0 && (
          <span className="text-xs" style={{ color: "var(--accent-red, #ef4444)" }}>
            {failedAttempts} failed {failedAttempts === 1 ? "attempt" : "attempts"}
          </span>
        )}
      </div>

      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: currentRun.passed ? "var(--accent-green, #10b981)" : "var(--accent-red, #ef4444)", fontSize: "14px" }}>
            {currentRun.passed ? "\u2713" : "\u2717"}
          </span>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
            {currentRun.checklistName}
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            {currentRun.event}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
          Attempt {currentRun.attempt}
        </span>
      </div>

      <div className="ml-1">
        {currentRun.items.map((item) => (
          <ChecklistItemRow
            key={item.name}
            item={item}
            priorFailures={priorFailuresForItem(item.name)}
          />
        ))}
      </div>
    </div>
  );
}
