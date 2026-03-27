import { Shell } from "@/components/layout/shell";
import { ProjectSidebar } from "@/components/layout/project-sidebar";
import { Header } from "@/components/layout/header";

export function ProjectLayout() {
  return <Shell sidebar={<ProjectSidebar />} header={<Header />} />;
}
