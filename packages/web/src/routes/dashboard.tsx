import { useState, useEffect } from "react";
import { useStatus, useHealth, useProjects, useCrafts } from "@/hooks/use-api";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import { StatCard } from "@/components/base/stat-card";
import { FlightStrip } from "@/components/base/flight-strip";
import { EventRow } from "@/components/base/event-row";
import { PageHeader } from "@/components/base/page-header";
import type { WsEvent, CraftState } from "@/types/api";

const MAX_EVENTS = 50;

export function Component() {
  const { data: status } = useStatus();
  const { data: health } = useHealth();
  const { data: projects } = useProjects();
  const [events, setEvents] = useState<WsEvent[]>([]);
  const wsManager = useWsManager();
  useSubscription(wsManager, "*");

  useEffect(() => {
    const handler = (e: Event) => {
      const event = (e as CustomEvent<WsEvent>).detail;
      setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
    };
    window.addEventListener("atc-ws-event", handler);
    return () => window.removeEventListener("atc-ws-event", handler);
  }, []);

  return (
    <div>
      <PageHeader crumbs={[{ label: "Dashboard" }]} />
      <div className="mt-5 grid grid-cols-4 gap-3">
        <StatCard label="ACTIVE CRAFTS" value={status?.crafts ?? 0} color="var(--accent-green)" />
        <StatCard label="TOWER QUEUE" value={0} color="var(--accent-yellow)" />
        <StatCard label="AGENTS" value={status?.agents ?? 0} color="var(--accent-purple)" />
        <StatCard label="EMERGENCIES" value={0} color="var(--accent-red)" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4">
        {/* Recent Events */}
        <div
          className="rounded-md border p-3.5"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div
            className="mb-3 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            RECENT EVENTS
          </div>
          {events.length === 0 ? (
            <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
              No events yet. Events will appear here when the daemon pushes updates.
            </div>
          ) : (
            events.map((event, i) => <EventRow key={`${event.timestamp}-${i}`} event={event} />)
          )}
        </div>
        {/* Active Crafts */}
        <div
          className="rounded-md border p-3.5"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div
            className="mb-3 text-[9px] uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            ACTIVE CRAFTS
          </div>
          <ActiveCraftsList projects={projects ?? []} />
        </div>
      </div>
    </div>
  );
}

function ActiveCraftsList({ projects }: { projects: { name: string }[] }) {
  if (projects.length === 0) {
    return (
      <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
        No projects registered.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projects.map((p) => (
        <ProjectCrafts key={p.name} project={p.name} />
      ))}
    </div>
  );
}

function ProjectCrafts({ project }: { project: string }) {
  const { data: crafts } = useCrafts(project);
  const active = crafts?.filter(
    (c: CraftState) => c.status !== "Landed" && c.status !== "ReturnToOrigin",
  );

  if (!active || active.length === 0) return null;

  return (
    <>
      {active.map((craft: CraftState) => (
        <FlightStrip key={craft.callsign} craft={craft} project={project} />
      ))}
    </>
  );
}
