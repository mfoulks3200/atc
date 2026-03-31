import { useState } from "react";
import { useParams, Link } from "react-router";
import { useProject, useCrafts, useTowerQueue, usePilots } from "@/hooks/use-api";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import { PageHeader } from "@/components/base/page-header";
import { FlightStrip } from "@/components/base/flight-strip";
import { StatCard } from "@/components/base/stat-card";
import { CreatePilotModal } from "@/components/forms/create-pilot-modal";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const wsManager = useWsManager();
  useSubscription(wsManager, `project:${name}`);
  const { data: project } = useProject(name!);
  const { data: crafts } = useCrafts(name!);
  const { data: queue } = useTowerQueue(name!);
  const { data: pilots } = usePilots(name!);
  const [showCreatePilot, setShowCreatePilot] = useState(false);

  const activeCrafts = crafts?.filter(
    (c) => c.status !== "Landed" && c.status !== "ReturnToOrigin",
  );

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Projects", to: "/projects" }, { label: name! }]}
        right={
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreatePilot(true)}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              + New Pilot
            </button>
            <Link
              to={`/projects/${name}/crafts/new`}
              className="rounded-md px-3 py-1.5 text-xs font-semibold no-underline"
              style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
            >
              + New Craft
            </Link>
          </div>
        }
      />
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

        {/* Pilots section */}
        {pilots && pilots.length > 0 && (
          <div className="mb-5 rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>PILOTS</div>
            <div className="space-y-1.5">
              {pilots.map((pilot) => (
                <div
                  key={pilot.identifier}
                  className="flex items-center justify-between rounded-md p-2 text-[11px]"
                  style={{ backgroundColor: "var(--bg-elevated)" }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>{pilot.identifier}</span>
                  <div className="flex gap-1">
                    {pilot.certifications.map((cert) => (
                      <span
                        key={cert}
                        className="rounded-sm px-1.5 py-0.5 text-[10px]"
                        style={{ backgroundColor: "rgba(0, 255, 136, 0.1)", color: "var(--accent-green)" }}
                      >
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>CRAFTS</div>
          {crafts && crafts.length === 0 && (
            <div className="py-4 text-center text-xs" style={{ color: "var(--text-dim)" }}>No crafts in this project.</div>
          )}
          <div className="space-y-2">
            {crafts?.map((craft) => <FlightStrip key={craft.callsign} craft={craft} project={name!} />)}
          </div>
        </div>
        {/* Config */}
        {project &&
          (project.checklist.length > 0 || Object.keys(project.mcpServers).length > 0) && (
            <div
              className="mt-4 rounded-md border p-3.5"
              style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
            >
              <div
                className="mb-3 text-[9px] uppercase tracking-widest"
                style={{ color: "var(--text-dim)" }}
              >
                CONFIGURATION
              </div>
              {project.checklist.length > 0 && (
                <div className="mb-3">
                  <div
                    className="mb-1.5 text-[10px] uppercase"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Checklist
                  </div>
                  <div className="space-y-1">
                    {project.checklist.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between rounded-md p-2 text-[11px]"
                        style={{ backgroundColor: "var(--bg-elevated)" }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>{item.name}</span>
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {item.command}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(project.mcpServers).length > 0 && (
                <div>
                  <div
                    className="mb-1.5 text-[10px] uppercase"
                    style={{ color: "var(--text-muted)" }}
                  >
                    MCP Servers
                  </div>
                  <div className="space-y-1">
                    {Object.entries(project.mcpServers).map(([serverName, config]) => (
                      <div
                        key={serverName}
                        className="flex items-center justify-between rounded-md p-2 text-[11px]"
                        style={{ backgroundColor: "var(--bg-elevated)" }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>{serverName}</span>
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {config.command} {config.args.join(" ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
      </div>
      <CreatePilotModal
        open={showCreatePilot}
        onClose={() => setShowCreatePilot(false)}
        project={name!}
        categories={project?.categories ?? []}
      />
    </div>
  );
}
