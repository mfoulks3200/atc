import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { PageHeader } from "@/components/base/page-header";
import { usePilotConfig, usePatchPilotConfig } from "@/hooks/use-api";

interface McpServerEntry {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function Component() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = usePilotConfig(id!);
  const patchConfig = usePatchPilotConfig(id!);
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.config?.mcpServers) {
      setServers(
        Object.entries(data.config.mcpServers).map(([serverName, config]) => ({
          name: serverName,
          command: config.command,
          args: config.args,
          env: config.env ?? {},
        })),
      );
    }
  }, [data]);

  const addServer = () => {
    setServers([...servers, { name: "", command: "", args: [], env: {} }]);
  };

  const updateServer = <K extends keyof McpServerEntry>(index: number, field: K, value: McpServerEntry[K]) => {
    const updated = [...servers];
    updated[index] = { ...updated[index], [field]: value };
    setServers(updated);
  };

  const removeServer = (index: number) => {
    setServers(servers.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {};
    for (const server of servers) {
      if (server.name.trim()) {
        mcpServers[server.name.trim()] = {
          command: server.command,
          args: server.args,
          ...(Object.keys(server.env).length > 0 ? { env: server.env } : {}),
        };
      }
    }
    patchConfig.mutate(
      { mcpServers },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: id! }, { label: "MCP Servers" }]} />
        <div className="mt-5 text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: id! }, { label: "MCP Servers" }]} />
      <div className="mt-5">
        <div className="rounded-md border p-4" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            MCP SERVERS
          </div>
          <div className="space-y-3">
            {servers.map((server, i) => (
              <div key={i} className="rounded-md border p-3" style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                <div className="mb-2 flex items-center justify-between">
                  <input
                    type="text"
                    value={server.name}
                    onChange={(e) => updateServer(i, "name", e.target.value)}
                    placeholder="Server name"
                    className="rounded-md border px-2 py-1 text-[11px] font-semibold"
                    style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                  <button onClick={() => removeServer(i)} className="text-[11px]" style={{ color: "var(--accent-red)" }}>
                    Remove
                  </button>
                </div>
                <div className="mb-2">
                  <label className="mb-1 block text-[10px]" style={{ color: "var(--text-dim)" }}>Command</label>
                  <input
                    type="text"
                    value={server.command}
                    onChange={(e) => updateServer(i, "command", e.target.value)}
                    placeholder="e.g., npx"
                    className="w-full rounded-md border px-2 py-1 font-mono text-[11px]"
                    style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px]" style={{ color: "var(--text-dim)" }}>Args (comma-separated)</label>
                  <input
                    type="text"
                    value={server.args.join(", ")}
                    onChange={(e) => updateServer(i, "args", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    placeholder="e.g., -y, @modelcontextprotocol/server"
                    className="w-full rounded-md border px-2 py-1 font-mono text-[11px]"
                    style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={addServer}
            className="mt-3 rounded-md px-3 py-1.5 text-xs"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            + Add Server
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={patchConfig.isPending}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
          >
            {patchConfig.isPending ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-[11px]" style={{ color: "var(--accent-green)" }}>Saved</span>}
          {patchConfig.isError && <span className="text-[11px]" style={{ color: "var(--accent-red)" }}>Error: {patchConfig.error.message}</span>}
        </div>
      </div>
    </div>
  );
}
