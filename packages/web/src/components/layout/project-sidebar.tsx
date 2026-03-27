import { NavLink, useParams } from "react-router";
import { useCrafts, useTowerQueue } from "@/hooks/use-api";

export function ProjectSidebar() {
  const { name } = useParams<{ name: string }>();
  const { data: crafts } = useCrafts(name!);
  const { data: queue } = useTowerQueue(name!);

  const craftCount = crafts?.length ?? 0;
  const queueCount = queue?.length ?? 0;

  return (
    <aside
      className="flex w-[220px] shrink-0 flex-col border-r"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="border-b px-4 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="text-lg font-bold tracking-[2px]" style={{ color: "var(--accent-green)" }}>
          ATC
        </div>
        <div className="mt-0.5 text-[10px] tracking-widest" style={{ color: "var(--text-dim)" }}>
          AIR TRAFFIC CONTROL
        </div>
      </div>
      <nav className="px-4 py-3">
        <div className="mb-2 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          SYSTEM
        </div>
        <NavLink
          to="/"
          className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
          style={{ color: "var(--text-muted)" }}
        >
          ◈ Dashboard
        </NavLink>
        <NavLink
          to="/projects"
          className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
          style={{ color: "var(--text-muted)" }}
        >
          ⊡ Projects
        </NavLink>
        <NavLink
          to="/agents"
          className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
          style={{ color: "var(--text-muted)" }}
        >
          ◇ Agents
        </NavLink>
        <NavLink
          to="/events"
          className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
          style={{ color: "var(--text-muted)" }}
        >
          ≋ Event Stream
        </NavLink>
      </nav>
      <nav className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="mb-2 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          PROJECT: {name?.toUpperCase()}
        </div>
        <NavLink
          to="/projects"
          className="mb-2 block px-2 py-1 text-xs no-underline opacity-50"
          style={{ color: "var(--text-muted)" }}
        >
          ← Back to Projects
        </NavLink>
        <NavLink
          to={`/projects/${name}`}
          end
          className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
          style={({ isActive }) => ({
            color: isActive ? "var(--accent-green)" : "var(--text-muted)",
            backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
          })}
        >
          ⊡ Overview
        </NavLink>
        <NavLink
          to={`/projects/${name}/crafts`}
          className="mb-1 flex items-center justify-between rounded-md px-2 py-1.5 text-xs no-underline"
          style={({ isActive }) => ({
            color: isActive ? "var(--accent-green)" : "var(--text-muted)",
            backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
          })}
        >
          <span>✈ Crafts</span>
          {craftCount > 0 && (
            <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
              {craftCount}
            </span>
          )}
        </NavLink>
        <NavLink
          to={`/projects/${name}/tower`}
          className="mb-1 flex items-center justify-between rounded-md px-2 py-1.5 text-xs no-underline"
          style={({ isActive }) => ({
            color: isActive ? "var(--accent-green)" : "var(--text-muted)",
            backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
          })}
        >
          <span>⊘ Tower Queue</span>
          {queueCount > 0 && (
            <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
              {queueCount}
            </span>
          )}
        </NavLink>
      </nav>
    </aside>
  );
}
