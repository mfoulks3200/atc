import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAllCrafts, type CraftWithProject } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { StatusBadge } from "@/components/base/status-badge";
import { VectorProgress } from "@/components/base/vector-progress";
import { MiniRadar } from "@/components/base/mini-radar";
import { STATUS_COLORS } from "@/theme/tokens";
import type { CraftStatus } from "@/types/api";

// ============================================================================
// All Crafts page — three view-mode prototypes the user can flip between
// to compare options for the per-craft "status widget".
// ============================================================================

type ViewMode = "strips" | "cards" | "lanes";

const FILTER_GROUPS: Array<{ key: string; label: string; statuses: CraftStatus[] | null }> = [
  { key: "all", label: "All", statuses: null },
  {
    key: "active",
    label: "Active",
    statuses: ["Taxiing", "InFlight", "LandingChecklist", "GoAround", "ClearedToLand"],
  },
  { key: "landed", label: "Landed", statuses: ["Landed"] },
  { key: "trouble", label: "Trouble", statuses: ["ReturnToOrigin", "Emergency"] },
];

const LANE_ORDER: CraftStatus[] = [
  "Taxiing",
  "InFlight",
  "LandingChecklist",
  "GoAround",
  "ClearedToLand",
  "Landed",
  "ReturnToOrigin",
  "Emergency",
];

export function Component() {
  const { data: crafts } = useAllCrafts();
  const [view, setView] = useState<ViewMode>("cards");
  const [filterKey, setFilterKey] = useState("all");

  const filtered = useMemo(() => {
    if (!crafts) return [];
    const group = FILTER_GROUPS.find((g) => g.key === filterKey);
    if (!group || group.statuses === null) return crafts;
    const set = new Set<string>(group.statuses);
    return crafts.filter((c) => set.has(c.status));
  }, [crafts, filterKey]);

  return (
    <div>
      <PageHeader crumbs={[{ label: "Crafts" }]} />

      <div className="mt-5 flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            All Crafts
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            {filtered.length} of {crafts?.length ?? 0}
          </span>
        </div>
        <ViewModeToggle value={view} onChange={setView} />
      </div>

      <FilterChips value={filterKey} onChange={setFilterKey} crafts={crafts ?? []} />

      <div className="mt-4">
        {!crafts ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <Empty />
        ) : view === "strips" ? (
          <StripsView crafts={filtered} />
        ) : view === "cards" ? (
          <CardsView crafts={filtered} />
        ) : (
          <LanesView crafts={filtered} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// View-mode toggle (shared header control)
// ============================================================================

function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const modes: Array<{ key: ViewMode; label: string }> = [
    { key: "cards", label: "Cards" },
    { key: "strips", label: "Strips" },
    { key: "lanes", label: "Lanes" },
  ];
  return (
    <div className="flex overflow-hidden rounded-md border" style={{ borderColor: "var(--border)" }}>
      {modes.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => onChange(m.key)}
          className="px-3 py-1.5 text-[10px] uppercase tracking-widest"
          style={{
            backgroundColor: value === m.key ? "var(--bg-elevated)" : "transparent",
            color: value === m.key ? "var(--accent-green)" : "var(--text-muted)",
            borderRight: m.key === "lanes" ? "none" : "1px solid var(--border)",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function FilterChips({
  value,
  onChange,
  crafts,
}: {
  value: string;
  onChange: (key: string) => void;
  crafts: CraftWithProject[];
}) {
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: crafts.length };
    for (const g of FILTER_GROUPS) {
      if (g.statuses === null) continue;
      const set = new Set<string>(g.statuses);
      result[g.key] = crafts.filter((c) => set.has(c.status)).length;
    }
    return result;
  }, [crafts]);

  return (
    <div className="mt-3 flex gap-2">
      {FILTER_GROUPS.map((g) => {
        const active = value === g.key;
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => onChange(g.key)}
            className="rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-widest"
            style={{
              borderColor: active ? "var(--accent-green)" : "var(--border)",
              color: active ? "var(--accent-green)" : "var(--text-muted)",
              backgroundColor: active ? "var(--bg-elevated)" : "transparent",
            }}
          >
            {g.label}
            <span className="ml-1.5" style={{ color: "var(--text-dim)" }}>
              {counts[g.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Loading() {
  return (
    <div className="py-12 text-center text-xs" style={{ color: "var(--text-dim)" }}>
      Loading crafts…
    </div>
  );
}

function Empty() {
  return (
    <div className="py-12 text-center text-xs" style={{ color: "var(--text-dim)" }}>
      No crafts match this filter.
    </div>
  );
}

// ============================================================================
// View A — Strips: dense one-row-per-craft list
// ============================================================================

function StripsView({ crafts }: { crafts: CraftWithProject[] }) {
  return (
    <div className="space-y-1.5">
      <div
        className="grid grid-cols-[160px_140px_120px_1fr_120px_140px] gap-3 px-3 pb-1.5 text-[9px] uppercase tracking-widest"
        style={{ color: "var(--text-dim)" }}
      >
        <div>Callsign</div>
        <div>Project</div>
        <div>Status</div>
        <div>Vectors</div>
        <div>Holder</div>
        <div>Crew</div>
      </div>
      {crafts.map((c) => (
        <Link
          key={`${c.projectName}/${c.callsign}`}
          to={`/projects/${c.projectName}/crafts/${c.callsign}`}
          className="block rounded-md no-underline"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderLeft: `3px solid ${STATUS_COLORS[c.status] ?? "var(--border)"}`,
          }}
        >
          <div className="grid grid-cols-[160px_140px_120px_1fr_120px_140px] items-center gap-3 px-3 py-2.5">
            <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              {c.callsign}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {c.projectName}
            </div>
            <StatusBadge status={c.status} />
            <div className="flex items-center gap-3">
              <VectorProgress vectors={c.flightPlan} className="flex-1" />
              <span className="shrink-0 text-[10px]" style={{ color: "var(--text-dim)" }}>
                {c.flightPlan.filter((v) => v.status === "Passed").length}/{c.flightPlan.length}
              </span>
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {c.controls.mode === "exclusive" ? c.controls.holder ?? "—" : "shared"}
            </div>
            <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
              {c.captain}
              {c.firstOfficers.length > 0 && ` · ${c.firstOfficers.length}FO`}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ============================================================================
// View B — Cards: 2- or 3-up grid with the mini-radar widget
// ============================================================================

function CardsView({ crafts }: { crafts: CraftWithProject[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {crafts.map((c) => (
        <CraftCard key={`${c.projectName}/${c.callsign}`} craft={c} />
      ))}
    </div>
  );
}

function CraftCard({ craft }: { craft: CraftWithProject }) {
  const passed = craft.flightPlan.filter((v) => v.status === "Passed").length;
  const lastIntercom = craft.intercom?.[craft.intercom.length - 1];
  return (
    <Link
      to={`/projects/${craft.projectName}/crafts/${craft.callsign}`}
      className="block rounded-md border no-underline transition-colors"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border)",
        borderLeft: `3px solid ${STATUS_COLORS[craft.status] ?? "var(--border)"}`,
      }}
    >
      <div className="flex items-start justify-between border-b p-3" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              {craft.callsign}
            </span>
            <StatusBadge status={craft.status} />
          </div>
          <div className="mt-0.5 truncate text-[10px]" style={{ color: "var(--text-dim)" }}>
            {craft.projectName} · {craft.branch}
          </div>
        </div>
        <div className="shrink-0 text-right text-[10px]" style={{ color: "var(--text-dim)" }}>
          {passed}/{craft.flightPlan.length} vectors
        </div>
      </div>

      {/* Mini-radar — the per-card "widget". Shares vocabulary with the
          detail-page hero (arc, waypoints, plane) but stripped of HUD
          chrome so it fits the card without cropping. */}
      <div
        className="border-b px-2 py-3"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-base)" }}
      >
        <MiniRadar craft={craft} height={100} />
      </div>

      <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between text-[10px]">
          <span style={{ color: "var(--text-muted)" }}>
            CPT {craft.captain}
            {craft.firstOfficers.length > 0 && ` · ${craft.firstOfficers.length}FO`}
            {craft.jumpseaters.length > 0 && ` · ${craft.jumpseaters.length}JS`}
          </span>
          <span style={{ color: "var(--text-dim)" }}>
            controls:{" "}
            <span style={{ color: "var(--accent-green)" }}>
              {craft.controls.mode === "exclusive" ? craft.controls.holder ?? "—" : "shared"}
            </span>
          </span>
        </div>
        {lastIntercom && (
          <div
            className="mt-2 truncate text-[10px] italic"
            style={{ color: "var(--text-muted)" }}
            title={lastIntercom.content}
          >
            <span style={{ color: "var(--text-secondary)" }}>{lastIntercom.from}:</span>{" "}
            {lastIntercom.content.replace(/\n+/g, " ")}
          </div>
        )}
      </div>
    </Link>
  );
}

// ============================================================================
// View C — Lanes: kanban-style, grouped by status
// ============================================================================

function LanesView({ crafts }: { crafts: CraftWithProject[] }) {
  const grouped = useMemo(() => {
    const map = new Map<CraftStatus, CraftWithProject[]>();
    for (const status of LANE_ORDER) map.set(status, []);
    for (const c of crafts) {
      const list = map.get(c.status as CraftStatus) ?? [];
      list.push(c);
      map.set(c.status as CraftStatus, list);
    }
    return map;
  }, [crafts]);

  const lanesWithItems = LANE_ORDER.filter((s) => (grouped.get(s)?.length ?? 0) > 0);
  if (lanesWithItems.length === 0) return <Empty />;

  return (
    <div className="flex gap-3 overflow-x-auto">
      {lanesWithItems.map((status) => {
        const items = grouped.get(status) ?? [];
        return (
          <div
            key={status}
            className="flex w-72 shrink-0 flex-col rounded-md border"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
          >
            <div
              className="flex items-center justify-between border-b px-3 py-2"
              style={{ borderColor: "var(--border)" }}
            >
              <StatusBadge status={status} />
              <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                {items.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2">
              {items.map((c) => (
                <Link
                  key={`${c.projectName}/${c.callsign}`}
                  to={`/projects/${c.projectName}/crafts/${c.callsign}`}
                  className="block rounded-md p-2.5 no-underline"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderLeft: `3px solid ${STATUS_COLORS[c.status] ?? "var(--border)"}`,
                  }}
                >
                  <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {c.callsign}
                  </div>
                  <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-dim)" }}>
                    {c.projectName}
                  </div>
                  <VectorProgress vectors={c.flightPlan} className="mt-2" />
                  <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    CPT {c.captain}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
