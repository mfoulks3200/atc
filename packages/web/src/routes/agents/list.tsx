import { Link } from "react-router";
import { useAgents } from "@/hooks/use-api";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import { PageHeader } from "@/components/base/page-header";
import { StatusBadge } from "@/components/base/status-badge";

export function Component() {
  const wsManager = useWsManager();
  useSubscription(wsManager, "agent:*");
  const { data: agents, isLoading } = useAgents();

  return (
    <div>
      <PageHeader crumbs={[{ label: "Agents" }]} />
      <div className="mt-5">
        {isLoading && <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>}
        {agents && agents.length === 0 && <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>No agents registered.</div>}
        <div className="space-y-2">
          {agents?.map((agent) => (
            <Link key={agent.id} to={`/agents/${agent.id}`} className="block rounded-md border p-3.5 no-underline" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{agent.id}</span>
                  <StatusBadge status={agent.status} variant="agent" />
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>{agent.adapterType}</div>
              </div>
              <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                project: {agent.projectName} · craft: {agent.callsign}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
