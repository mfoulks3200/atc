import { NavLink } from "react-router";
import styles from "./sidebar.module.css";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "◈" },
  { to: "/projects", label: "Projects", icon: "⊡" },
  { to: "/agents", label: "Agents", icon: "◇" },
  { to: "/events", label: "Event Stream", icon: "≋" },
];

export function Sidebar() {
  return (
    <aside
      className="flex w-[220px] shrink-0 flex-col border-r"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div
        className={cn("border-b px-4 py-4", styles.radar)}
        style={{ borderColor: "var(--border)" }}
      >
        <div className="text-lg font-bold tracking-[2px]" style={{ color: "var(--accent-green)" }}>
          ATC
        </div>
        <div className="mt-0.5 text-[10px] tracking-widest" style={{ color: "var(--text-dim)" }}>
          AIR TRAFFIC CONTROL
        </div>
      </div>
      <nav className="px-4 py-3">
        <div
          className="mb-2 text-[9px] uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          SYSTEM
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className="mb-1 block rounded-md px-2 py-1.5 text-xs no-underline"
            style={({ isActive }) => ({
              color: isActive ? "var(--accent-green)" : "var(--text-muted)",
              backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
              borderLeft: isActive ? "2px solid var(--accent-green)" : "2px solid transparent",
            })}
          >
            {item.icon} {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
