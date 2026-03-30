import { useState } from "react";
import type { ChecklistItemResult } from "@/types/checklist";

interface ChecklistItemRowProps {
  item: ChecklistItemResult;
  priorFailures: number;
}

export function ChecklistItemRow({ item, priorFailures }: ChecklistItemRowProps) {
  const isFailed = !item.passed;
  const [expanded, setExpanded] = useState(isFailed);

  const borderColor = isFailed
    ? item.severity === "required"
      ? "var(--accent-red, #ef4444)"
      : "var(--accent-yellow, #f59e0b)"
    : "var(--accent-green, #10b981)";

  const icon = isFailed
    ? item.severity === "required"
      ? "\u2717"
      : "\u26A0"
    : "\u2713";

  const iconColor = isFailed
    ? item.severity === "required"
      ? "var(--accent-red, #ef4444)"
      : "var(--accent-yellow, #f59e0b)"
    : "var(--accent-green, #10b981)";

  return (
    <div
      style={{ borderLeft: `2px solid ${borderColor}`, borderRadius: "0 4px 4px 0" }}
      className="mb-1.5"
    >
      <div
        className="flex cursor-pointer items-center justify-between px-3 py-2"
        onClick={() => setExpanded(!expanded)}
        style={{ background: isFailed ? "rgba(239,68,68,0.03)" : "rgba(16,185,129,0.03)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            {expanded ? "\u25BC" : "\u25B6"}
          </span>
          <span style={{ color: iconColor }}>{icon}</span>
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {item.name}
          </span>
          <span
            className="rounded px-1.5 text-[10px]"
            style={{
              background: item.severity === "required" ? "rgba(220,38,38,0.15)" : "rgba(245,158,11,0.15)",
              color: item.severity === "required" ? "var(--accent-red, #ef4444)" : "var(--accent-yellow, #f59e0b)",
            }}
          >
            {item.severity}
          </span>
          {isFailed && item.severity === "required" && (
            <span
              className="rounded px-1.5 text-[10px]"
              style={{ background: "rgba(239,68,68,0.2)", color: "var(--accent-red, #ef4444)" }}
            >
              BLOCKED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {priorFailures > 0 && (
            <span
              className="rounded px-1.5 text-[10px]"
              style={{ background: "var(--bg-elevated)", color: isFailed ? "var(--accent-red, #ef4444)" : "var(--accent-yellow, #f59e0b)" }}
            >
              {priorFailures} {priorFailures === 1 ? "prior failure" : isFailed ? "consecutive failures" : "prior failures"}
            </span>
          )}
          <span className="font-mono text-xs" style={{ color: "var(--text-dim)" }}>
            {item.durationMs < 1000 ? `${item.durationMs}ms` : `${(item.durationMs / 1000).toFixed(1)}s`}
          </span>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3" style={{ paddingLeft: "34px" }}>
          {item.message && (
            <div className="mb-2 rounded p-2.5" style={{ background: "var(--bg-elevated)" }}>
              <div className="mb-1 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                Description
              </div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{item.message}</div>
            </div>
          )}
          {item.output && (
            <div
              className="max-h-[200px] overflow-y-auto rounded border p-3 font-mono text-xs leading-relaxed"
              style={{
                background: "var(--bg-base, #0f172a)",
                borderColor: "var(--border)",
                color: "var(--text-muted)",
              }}
            >
              <div className="mb-2 font-sans text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                Output
              </div>
              <pre className="whitespace-pre-wrap">{item.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
