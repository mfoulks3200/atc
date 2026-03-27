import { ConnectionIndicator } from "@/components/base/connection-indicator";
import { useConnectionStatus } from "@/hooks/use-websocket";
import { useWsManager, useWsUrl } from "@/hooks/ws-context";

interface HeaderProps {
  children?: React.ReactNode;
}

export function Header({ children }: HeaderProps) {
  const wsManager = useWsManager();
  const wsUrl = useWsUrl();
  const connectionStatus = useConnectionStatus(wsManager);

  return (
    <header
      className="flex h-12 items-center justify-between border-b px-5"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div>{children}</div>
      <ConnectionIndicator status={connectionStatus} url={wsUrl} />
    </header>
  );
}
