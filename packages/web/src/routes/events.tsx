import { useState, useEffect, useRef } from "react";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import { PageHeader } from "@/components/base/page-header";
import { EventRow } from "@/components/base/event-row";
import { FilterPills } from "@/components/base/filter-pills";
import type { WsEvent } from "@/types/api";

const MAX_EVENTS = 500;
const CATEGORIES = ["craft", "tower", "agent", "controls"];

export function Component() {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(CATEGORIES));
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const filteredEvents = events.filter((event) => {
    const category = event.channel.split(":")[0];
    return activeFilters.has(category);
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        crumbs={[{ label: "Event Stream" }]}
        right={
          <div className="flex items-center gap-3">
            <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{events.length} events</span>
            <span
              className="rounded-sm border px-2 py-0.5 text-[10px]"
              style={{
                color: "var(--accent-green)",
                backgroundColor: "color-mix(in srgb, var(--accent-green) 10%, transparent)",
                borderColor: "color-mix(in srgb, var(--accent-green) 20%, transparent)",
              }}
            >
              ● STREAMING
            </span>
          </div>
        }
      />
      <div className="flex items-center justify-between border-b px-5 py-2.5" style={{ borderColor: "var(--border)" }}>
        <FilterPills categories={CATEGORIES} active={activeFilters} onChange={setActiveFilters} />
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto px-5 py-2">
        {filteredEvents.length === 0 ? (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            No events yet. Events will stream here in real time.
          </div>
        ) : (
          filteredEvents.map((event, i) => <EventRow key={`${event.timestamp}-${i}`} event={event} />)
        )}
      </div>
    </div>
  );
}
