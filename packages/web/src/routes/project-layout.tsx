import { Shell } from "@/components/layout/shell";
import { ProjectSidebar } from "@/components/layout/project-sidebar";

export function ProjectLayout() {
  return <Shell sidebar={<ProjectSidebar />} />;
}
