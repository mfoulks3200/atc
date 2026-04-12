import { useState } from "react";
import { Link } from "react-router";
import { useAllPilots, useProjects } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { CreatePilotModal } from "@/components/forms/create-pilot-modal";

export function Component() {
  const { data: pilots, isLoading } = useAllPilots();
  const { data: projects } = useProjects();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");

  const projectNames = projects?.map((p) => p.name) ?? [];
  const categories =
    projects?.find((p) => p.name === selectedProject)?.categories ?? [];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Pilots" }]}
        right={
          projectNames.length > 0 ? (
            <button
              onClick={() => {
                if (!selectedProject && projectNames.length > 0) {
                  setSelectedProject(projectNames[0]);
                }
                setShowCreate(true);
              }}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              + New Pilot
            </button>
          ) : null
        }
      />
      <div className="mt-5">
        {isLoading && (
          <div
            className="py-8 text-center text-xs"
            style={{ color: "var(--text-dim)" }}
          >
            Loading...
          </div>
        )}
        {pilots && pilots.length === 0 && (
          <div
            className="py-8 text-center text-xs"
            style={{ color: "var(--text-dim)" }}
          >
            No pilots registered.
          </div>
        )}
        <div className="space-y-2">
          {pilots?.map((pilot) => (
            <Link
              key={`${pilot.project}/${pilot.identifier}`}
              to={`/pilots/${pilot.project}/${encodeURIComponent(pilot.identifier)}`}
              className="block rounded-md border p-3.5 no-underline"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {pilot.identifier}
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-dim)" }}
                >
                  {pilot.project}
                </span>
              </div>
              {pilot.certifications.length > 0 && (
                <div className="mt-1.5 flex gap-1">
                  {pilot.certifications.map((cert) => (
                    <span
                      key={cert}
                      className="rounded-sm px-1.5 py-0.5 text-[10px]"
                      style={{
                        backgroundColor: "rgba(0, 255, 136, 0.1)",
                        color: "var(--accent-green)",
                      }}
                    >
                      {cert}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
      <CreatePilotModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        project={selectedProject}
        categories={categories}
        projectNames={projectNames}
        onProjectChange={setSelectedProject}
      />
    </div>
  );
}
