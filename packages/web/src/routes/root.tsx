import { Shell } from "@/components/layout/shell";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import type { WebSocketManager } from "@/hooks/use-websocket";

interface RootLayoutProps {
  wsManager: WebSocketManager;
  wsUrl: string;
}

export function RootLayout({ wsManager, wsUrl }: RootLayoutProps) {
  return (
    <Shell
      sidebar={<Sidebar />}
      header={<Header wsManager={wsManager} wsUrl={wsUrl} />}
    />
  );
}
