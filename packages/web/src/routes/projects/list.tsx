import { Link } from "react-router";
import { useProjects } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";

export function Component() {
  const { data: projects, isLoading } = useProjects();

  return (
    <div>
      <PageHeader crumbs={[{ label: "Projects" }]} />
      <div className="mt-5">
        {isLoading && (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>
        )}
        {projects && projects.length === 0 && (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>No projects registered.</div>
        )}
        <div className="space-y-2">
          {projects?.map((project) => (
            <Link
              key={project.name}
              to={`/projects/${project.name}`}
              className="block rounded-md border p-3.5 no-underline"
              style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{project.name}</span>
                  <div className="mt-1 text-[10px]" style={{ color: "var(--text-dim)" }}>{project.remoteUrl}</div>
                </div>
                <div className="flex gap-1.5">
                  {project.categories.map((cat) => (
                    <span key={cat} className="rounded-sm px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
