import { Link } from "react-router";
import { ConnectionIndicator } from "@/components/base/connection-indicator";
import { useConnectionStatus } from "@/hooks/use-websocket";
import { useWsManager, useWsUrl } from "@/hooks/ws-context";
import { usePageHeaderState } from "@/hooks/page-header-context";

export function Header() {
  const wsManager = useWsManager();
  const wsUrl = useWsUrl();
  const connectionStatus = useConnectionStatus(wsManager);
  const { crumbs, right } = usePageHeaderState();

  return (
    <header
      className="flex h-12 items-center justify-between border-b px-5"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-1 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="mx-1" style={{ color: "var(--text-dim)" }}>
                /
              </span>
            )}
            {crumb.to ? (
              <Link
                to={crumb.to}
                className="no-underline hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                {crumb.label}
              </Link>
            ) : (
              <span style={{ color: "var(--text-primary)" }}>{crumb.label}</span>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {right}
        <ConnectionIndicator status={connectionStatus} url={wsUrl} />
      </div>
    </header>
  );
}
