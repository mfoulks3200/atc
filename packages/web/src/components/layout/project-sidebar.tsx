import { NavLink, useParams, Outlet } from "react-router";
import { useTowerQueue } from "@/hooks/use-api";
import { useSidebarSlot } from "@/hooks/sidebar-slot-context";

export function ProjectSidebarSlot() {
  const { name } = useParams<{ name: string }>();
  const { data: queue } = useTowerQueue(name!);

  const queueCount = queue?.length ?? 0;

  useSidebarSlot(
    <nav className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
      <div
        className="mb-2 text-[9px] uppercase tracking-widest"
        style={{ color: "var(--text-dim)" }}
      >
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
    </nav>,
  );

  return <Outlet />;
}
