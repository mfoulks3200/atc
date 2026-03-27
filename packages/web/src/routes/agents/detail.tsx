import { useParams } from "react-router";
import { useAgent, useAgentUsage, useCraft } from "@/hooks/use-api";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import { PageHeader } from "@/components/base/page-header";
import { StatusBadge } from "@/components/base/status-badge";
import { StatCard } from "@/components/base/stat-card";
import { FlightStrip } from "@/components/base/flight-strip";

export function Component() {
  const { id } = useParams<{ id: string }>();
  const wsManager = useWsManager();
  useSubscription(wsManager, `agent:${id}`);
  const { data: agent } = useAgent(id!);
  const { data: usage } = useAgentUsage(id!);
  const { data: craft } = useCraft(agent?.projectName ?? "", agent?.callsign ?? "");

  if (!agent) {
    return <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>;
  }

  const latestUsage = usage && usage.length > 0 ? usage[usage.length - 1] : null;

  return (
    <div>
      <PageHeader crumbs={[{ label: "Agents", to: "/agents" }, { label: id! }]} />
      <div className="mt-5 flex items-start justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{agent.id}</span>
            <StatusBadge status={agent.status} variant="agent" />
          </div>
          <div className="mt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
            adapter: {agent.adapterType} · project: {agent.projectName} · craft: {agent.callsign}
          </div>
          {agent.pid && <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-dim)" }}>PID: {agent.pid}</div>}
        </div>
      </div>
      {craft && (
        <div className="mt-4">
          <div
            className="mb-3 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            ASSIGNED CRAFT
          </div>
          <FlightStrip craft={craft} project={agent.projectName} />
        </div>
      )}
      {latestUsage && (
        <div className="mt-4">
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>LATEST USAGE</div>
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="INPUT TOKENS" value={latestUsage.tokens.input.toLocaleString()} color="var(--accent-blue)" />
            <StatCard label="OUTPUT TOKENS" value={latestUsage.tokens.output.toLocaleString()} color="var(--accent-green)" />
            <StatCard label="TOOL CALLS" value={latestUsage.tools.reduce((sum, t) => sum + t.calls, 0)} color="var(--accent-yellow)" />
            <StatCard label="DURATION" value={`${Math.floor(latestUsage.duration / 1000)}s`} color="var(--text-secondary)" />
          </div>
        </div>
      )}
      {usage && usage.length > 0 && (
        <div className="mt-4 rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="mb-2.5 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>USAGE HISTORY</div>
          <div className="space-y-1">
            {[...usage].reverse().map((report, i) => (
              <div key={`${report.timestamp}-${i}`} className="flex items-center justify-between rounded-md p-2 text-[11px]" style={{ backgroundColor: "var(--bg-elevated)" }}>
                <span style={{ color: "var(--text-dim)" }}>{new Date(report.timestamp).toLocaleString()}</span>
                <span style={{ color: "var(--text-muted)" }}>{report.tokens.input + report.tokens.output} tokens · {Math.floor(report.duration / 1000)}s</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
