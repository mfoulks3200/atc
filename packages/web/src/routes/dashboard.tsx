import { useState, useEffect } from "react";
import { useStatus, useHealth } from "@/hooks/use-api";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import { StatCard } from "@/components/base/stat-card";
import { EventRow } from "@/components/base/event-row";
import { PageHeader } from "@/components/base/page-header";
import type { WsEvent } from "@/types/api";

const MAX_EVENTS = 50;

export function Component() {
  const { data: status } = useStatus();
  const { data: health } = useHealth();
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
        <StatCard label="PROJECTS" value={status?.projects ?? 0} color="var(--accent-blue)" />
        <StatCard label="ACTIVE CRAFTS" value={status?.crafts ?? 0} color="var(--accent-green)" />
        <StatCard label="AGENTS" value={status?.agents ?? 0} color="var(--accent-purple)" />
        <StatCard
          label="UPTIME"
          value={health ? `${Math.floor(health.uptime / 60)}m` : "—"}
          subtitle={health?.version ? `v${health.version}` : undefined}
          color="var(--text-secondary)"
        />
      </div>
      <div
        className="mt-5 rounded-md border p-3.5"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
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
    </div>
  );
}
