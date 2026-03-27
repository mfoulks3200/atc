import { ConnectionIndicator } from "@/components/base/connection-indicator";
import { useConnectionStatus } from "@/hooks/use-websocket";
import type { WebSocketManager } from "@/hooks/use-websocket";

interface HeaderProps {
  wsManager: WebSocketManager;
  wsUrl: string;
  children?: React.ReactNode;
}

export function Header({ wsManager, wsUrl, children }: HeaderProps) {
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
