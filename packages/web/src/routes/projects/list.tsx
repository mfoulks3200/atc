import { useState } from "react";
import { Link } from "react-router";
import { useProjects } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { CreateProjectModal } from "@/components/forms/create-project-modal";

export function Component() {
  const { data: projects, isLoading } = useProjects();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Projects" }]}
        right={
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
          >
            + New Project
          </button>
        }
      />
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
      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
