import { Shell } from "@/components/layout/shell";
import { ProjectSidebar } from "@/components/layout/project-sidebar";
import { Header } from "@/components/layout/header";
import type { WebSocketManager } from "@/hooks/use-websocket";

interface ProjectLayoutProps {
  wsManager: WebSocketManager;
  wsUrl: string;
}

export function ProjectLayout({ wsManager, wsUrl }: ProjectLayoutProps) {
  return (
    <Shell
      sidebar={<ProjectSidebar />}
      header={<Header wsManager={wsManager} wsUrl={wsUrl} />}
    />
  );
}
