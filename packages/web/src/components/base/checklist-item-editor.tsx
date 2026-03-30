import type { ChecklistItemDef } from "@/types/checklist";

interface ChecklistItemEditorProps {
  item: ChecklistItemDef;
  onChange: (item: ChecklistItemDef) => void;
  onRemove: () => void;
}

export function ChecklistItemEditor({ item, onChange, onRemove }: ChecklistItemEditorProps) {
  const isShell = item.executor.type === "shell";

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}>
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="cursor-grab" style={{ color: "var(--text-dim)" }}>{"\u2630"}</span>
          <input
            className="rounded border bg-transparent px-2 py-1 text-[11px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", width: "200px" }}
            value={item.name}
            onChange={(e) => onChange({ ...item, name: e.target.value })}
          />
          <button
            className="rounded px-2 py-0.5 text-[10px]"
            style={{
              background: item.severity === "required" ? "rgba(220,38,38,0.8)" : "rgba(245,158,11,0.8)",
              color: "white",
            }}
            onClick={() =>
              onChange({
                ...item,
                severity: item.severity === "required" ? "advisory" : "required",
              })
            }
          >
            {item.severity}
          </button>
        </div>
        <span className="cursor-pointer text-lg" style={{ color: "var(--text-dim)" }} onClick={onRemove}>
          {"\u00D7"}
        </span>
      </div>

      <div className="mb-2">
        <div className="mb-1 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          Executor
        </div>
        <div className="mb-2 flex gap-1">
          <button
            className="rounded px-2.5 py-0.5 text-xs"
            style={{
              background: isShell ? "var(--accent-blue, #3b82f6)" : "var(--bg-elevated)",
              color: isShell ? "white" : "var(--text-dim)",
            }}
            onClick={() => onChange({ ...item, executor: { type: "shell", command: "" } })}
          >
            Shell
          </button>
          <button
            className="rounded px-2.5 py-0.5 text-xs"
            style={{
              background: !isShell ? "var(--accent-purple, #8b5cf6)" : "var(--bg-elevated)",
              color: !isShell ? "white" : "var(--text-dim)",
            }}
            onClick={() => onChange({ ...item, executor: { type: "mcp-tool", tool: "", params: {} } })}
          >
            MCP Tool
          </button>
        </div>

        {isShell ? (
          <input
            className="w-full rounded border bg-transparent px-2 py-1 font-mono text-xs"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            value={item.executor.type === "shell" ? item.executor.command : ""}
            placeholder="e.g., pnpm run test"
            onChange={(e) => onChange({ ...item, executor: { type: "shell", command: e.target.value } })}
          />
        ) : (
          <div className="flex gap-2">
            <input
              className="w-1/2 rounded border bg-transparent px-2 py-1 font-mono text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              value={item.executor.type === "mcp-tool" ? item.executor.tool : ""}
              placeholder="Tool name"
              onChange={(e) =>
                onChange({
                  ...item,
                  executor: {
                    type: "mcp-tool",
                    tool: e.target.value,
                    params: item.executor.type === "mcp-tool" ? item.executor.params : {},
                  },
                })
              }
            />
            <input
              className="w-1/2 rounded border bg-transparent px-2 py-1 font-mono text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              value={item.executor.type === "mcp-tool" ? JSON.stringify(item.executor.params) : "{}"}
              placeholder='{"key": "value"}'
              onChange={(e) => {
                try {
                  const params = JSON.parse(e.target.value) as Record<string, unknown>;
                  onChange({
                    ...item,
                    executor: {
                      type: "mcp-tool",
                      tool: item.executor.type === "mcp-tool" ? item.executor.tool : "",
                      params,
                    },
                  });
                } catch {
                  // Invalid JSON — ignore
                }
              }}
            />
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          Failure Description
        </div>
        <input
          className="w-full rounded border bg-transparent px-2 py-1 text-xs"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          value={item.description ?? ""}
          placeholder="Shown to agents on failure"
          onChange={(e) => onChange({ ...item, description: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
