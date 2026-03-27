import { useParams } from "react-router";
import { useProject, useCrafts, useTowerQueue } from "@/hooks/use-api";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import { PageHeader } from "@/components/base/page-header";
import { FlightStrip } from "@/components/base/flight-strip";
import { StatCard } from "@/components/base/stat-card";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const wsManager = useWsManager();
  useSubscription(wsManager, `project:${name}`);
  const { data: project } = useProject(name!);
  const { data: crafts } = useCrafts(name!);
  const { data: queue } = useTowerQueue(name!);

  const activeCrafts = crafts?.filter(
    (c) => c.status !== "Landed" && c.status !== "ReturnToOrigin",
  );

  return (
    <div>
      <PageHeader crumbs={[{ label: "Projects", to: "/projects" }, { label: name! }]} />
      <div className="mt-5">
        {project && (
          <div className="mb-5 rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{project.name}</div>
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>{project.remoteUrl}</div>
            <div className="mt-2 flex gap-1.5">
              {project.categories.map((cat) => (
                <span key={cat} className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}>{cat}</span>
              ))}
            </div>
          </div>
        )}
        <div className="mb-5 grid grid-cols-3 gap-3">
          <StatCard label="CRAFTS" value={crafts?.length ?? 0} color="var(--accent-green)" />
          <StatCard label="ACTIVE" value={activeCrafts?.length ?? 0} color="var(--accent-blue)" />
          <StatCard label="TOWER QUEUE" value={queue?.length ?? 0} color="var(--accent-yellow)" />
        </div>
        <div className="rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>CRAFTS</div>
          {crafts && crafts.length === 0 && (
            <div className="py-4 text-center text-xs" style={{ color: "var(--text-dim)" }}>No crafts in this project.</div>
          )}
          <div className="space-y-2">
            {crafts?.map((craft) => <FlightStrip key={craft.callsign} craft={craft} project={name!} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
