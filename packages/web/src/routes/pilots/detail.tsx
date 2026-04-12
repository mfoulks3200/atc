import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import {
  usePilot,
  useUpdatePilot,
  useDeletePilot,
  useProject,
  useAgents,
  useAgentUsage,
  useCraft,
} from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { StatusBadge } from "@/components/base/status-badge";
import { StatCard } from "@/components/base/stat-card";
import { FlightStrip } from "@/components/base/flight-strip";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const inputStyle = {
  backgroundColor: "var(--bg-elevated)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const labelStyle = { color: "var(--text-muted)" };

const sectionHeading = {
  className: "mb-3 text-[9px] uppercase tracking-widest",
  style: { color: "var(--text-dim)" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Component() {
  const { project, id } = useParams<{ project: string; id: string }>();
  const navigate = useNavigate();
  const decodedId = decodeURIComponent(id!);

  const { data: pilot } = usePilot(project!, decodedId);
  const { data: projectData } = useProject(project!);
  const updatePilot = useUpdatePilot(project!, decodedId);
  const deletePilot = useDeletePilot(project!, decodedId);

  // Find agent runtime associated with this pilot (if any)
  const { data: agents } = useAgents();
  const linkedAgent = agents?.find(
    (a) => a.projectName === project && a.callsign && a.id,
  );
  // For now show the first agent in the same project — in the future this
  // should match on pilot identifier once agents carry that reference.
  const agentForPilot = agents?.find((a) => a.projectName === project);
  const { data: usage } = useAgentUsage(agentForPilot?.id ?? "");
  const { data: craft } = useCraft(
    agentForPilot?.projectName ?? "",
    agentForPilot?.callsign ?? "",
  );

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editCerts, setEditCerts] = useState<string[]>([]);
  const [editMcpName, setEditMcpName] = useState("");
  const [editMcpCommand, setEditMcpCommand] = useState("");
  const [editMcpArgs, setEditMcpArgs] = useState("");
  const [editMcpServers, setEditMcpServers] = useState<
    Record<string, { command: string; args: string[]; env?: Record<string, string> }>
  >({});

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const categories = projectData?.categories ?? [];

  function startEditing() {
    if (!pilot) return;
    setEditCerts([...pilot.certifications]);
    setEditMcpServers({ ...pilot.mcpServers });
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditMcpName("");
    setEditMcpCommand("");
    setEditMcpArgs("");
  }

  function toggleCert(cat: string) {
    setEditCerts((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function addMcpServer() {
    if (!editMcpName.trim() || !editMcpCommand.trim()) return;
    setEditMcpServers((prev) => ({
      ...prev,
      [editMcpName.trim()]: {
        command: editMcpCommand.trim(),
        args: editMcpArgs
          .split(" ")
          .map((s) => s.trim())
          .filter(Boolean),
      },
    }));
    setEditMcpName("");
    setEditMcpCommand("");
    setEditMcpArgs("");
  }

  function removeMcpServer(name: string) {
    setEditMcpServers((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function saveChanges() {
    updatePilot.mutate(
      { certifications: editCerts, mcpServers: editMcpServers },
      { onSuccess: () => setEditing(false) },
    );
  }

  function handleDelete() {
    deletePilot.mutate(undefined, {
      onSuccess: () => navigate("/pilots"),
    });
  }

  if (!pilot) {
    return (
      <div
        className="py-8 text-center text-xs"
        style={{ color: "var(--text-dim)" }}
      >
        Loading...
      </div>
    );
  }

  const latestUsage = usage && usage.length > 0 ? usage[usage.length - 1] : null;

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "Pilots", to: "/pilots" },
          { label: decodedId },
        ]}
        right={
          <div className="flex gap-2">
            {!editing && (
              <button
                onClick={startEditing}
                className="rounded-md px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                Edit
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{
                backgroundColor: "rgba(255, 85, 85, 0.1)",
                color: "var(--accent-red)",
                border: "1px solid var(--accent-red)",
              }}
            >
              Delete
            </button>
          </div>
        }
      />

      {/* Pilot info header */}
      <div
        className="mt-5 border-b pb-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {pilot.identifier}
          </span>
        </div>
        <div
          className="mt-1 text-[11px]"
          style={{ color: "var(--text-dim)" }}
        >
          project: {project}
        </div>
      </div>

      {/* Editable pilot record section */}
      {editing ? (
        <div
          className="mt-4 rounded-md border p-3.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border)",
          }}
        >
          <div {...sectionHeading}>EDIT PILOT</div>

          {/* Identifier (read-only) */}
          <div className="mb-3">
            <label
              className="mb-1 block text-[10px] uppercase tracking-wider"
              style={labelStyle}
            >
              Identifier (read-only)
            </label>
            <input
              type="text"
              value={pilot.identifier}
              disabled
              className="w-full rounded-md border px-3 py-1.5 text-xs opacity-50 outline-none"
              style={inputStyle}
            />
          </div>

          {/* Certifications */}
          <div className="mb-3">
            <label
              className="mb-1 block text-[10px] uppercase tracking-wider"
              style={labelStyle}
            >
              Certifications
            </label>
            {categories.length === 0 ? (
              <div
                className="text-[10px]"
                style={{ color: "var(--text-dim)" }}
              >
                No categories configured for this project.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => {
                  const selected = editCerts.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCert(cat)}
                      className="rounded-sm px-2 py-1 text-[10px] transition-colors"
                      style={{
                        backgroundColor: selected
                          ? "rgba(0, 255, 136, 0.15)"
                          : "var(--bg-elevated)",
                        color: selected
                          ? "var(--accent-green)"
                          : "var(--text-muted)",
                        border: selected
                          ? "1px solid var(--accent-green)"
                          : "1px solid transparent",
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* MCP Servers */}
          <div className="mb-3">
            <label
              className="mb-1 block text-[10px] uppercase tracking-wider"
              style={labelStyle}
            >
              MCP Servers
            </label>
            {Object.keys(editMcpServers).length > 0 && (
              <div className="mb-2 space-y-1">
                {Object.entries(editMcpServers).map(([name, config]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-md p-2 text-[11px]"
                    style={{ backgroundColor: "var(--bg-elevated)" }}
                  >
                    <div>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {name}
                      </span>
                      <span
                        className="ml-2 font-mono text-[10px]"
                        style={{ color: "var(--text-dim)" }}
                      >
                        {config.command} {config.args.join(" ")}
                      </span>
                    </div>
                    <button
                      onClick={() => removeMcpServer(name)}
                      className="text-[10px]"
                      style={{ color: "var(--accent-red)" }}
                    >
                      remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={editMcpName}
                onChange={(e) => setEditMcpName(e.target.value)}
                placeholder="name"
                className="w-24 rounded-md border px-2 py-1 text-[11px] outline-none"
                style={inputStyle}
              />
              <input
                type="text"
                value={editMcpCommand}
                onChange={(e) => setEditMcpCommand(e.target.value)}
                placeholder="command"
                className="flex-1 rounded-md border px-2 py-1 text-[11px] outline-none"
                style={inputStyle}
              />
              <input
                type="text"
                value={editMcpArgs}
                onChange={(e) => setEditMcpArgs(e.target.value)}
                placeholder="args (space-separated)"
                className="flex-1 rounded-md border px-2 py-1 text-[11px] outline-none"
                style={inputStyle}
              />
              <button
                onClick={addMcpServer}
                className="rounded-md px-2 py-1 text-[10px]"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex justify-end gap-2">
            <button
              onClick={cancelEditing}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
            <button
              onClick={saveChanges}
              disabled={updatePilot.isPending}
              className="rounded-md px-3 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: updatePilot.isPending
                  ? "var(--bg-elevated)"
                  : "var(--accent-green)",
                color: updatePilot.isPending
                  ? "var(--text-muted)"
                  : "var(--bg-base)",
              }}
            >
              {updatePilot.isPending ? "Saving..." : "Save"}
            </button>
          </div>
          {updatePilot.error && (
            <div
              className="mt-2 rounded-md px-3 py-2 text-xs"
              style={{
                backgroundColor: "rgba(255, 85, 85, 0.1)",
                color: "var(--accent-red)",
              }}
            >
              {updatePilot.error.message}
            </div>
          )}
        </div>
      ) : (
        /* Read-only pilot record view */
        <div
          className="mt-4 rounded-md border p-3.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border)",
          }}
        >
          <div {...sectionHeading}>PILOT RECORD</div>
          <div className="mb-3">
            <div
              className="mb-1 text-[10px] uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              Certifications
            </div>
            {pilot.certifications.length === 0 ? (
              <div
                className="text-[11px]"
                style={{ color: "var(--text-dim)" }}
              >
                None
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
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
          </div>
          {Object.keys(pilot.mcpServers).length > 0 && (
            <div>
              <div
                className="mb-1 text-[10px] uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                MCP Servers
              </div>
              <div className="space-y-1">
                {Object.entries(pilot.mcpServers).map(([name, config]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-md p-2 text-[11px]"
                    style={{ backgroundColor: "var(--bg-elevated)" }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>
                      {name}
                    </span>
                    <span
                      className="font-mono text-[10px]"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {config.command} {config.args.join(" ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Agent runtime info (linked section) */}
      {agentForPilot && (
        <div
          className="mt-4 rounded-md border p-3.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border)",
          }}
        >
          <div {...sectionHeading}>AGENT RUNTIME</div>
          <div className="flex items-center gap-3">
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {agentForPilot.id}
            </span>
            <StatusBadge status={agentForPilot.status} variant="agent" />
          </div>
          <div
            className="mt-1 text-[11px]"
            style={{ color: "var(--text-dim)" }}
          >
            adapter: {agentForPilot.adapterType} · craft:{" "}
            {agentForPilot.callsign}
          </div>
          {agentForPilot.pid && (
            <div
              className="mt-0.5 text-[10px]"
              style={{ color: "var(--text-dim)" }}
            >
              PID: {agentForPilot.pid}
            </div>
          )}
        </div>
      )}

      {/* Assigned craft */}
      {craft && (
        <div className="mt-4">
          <div {...sectionHeading}>ASSIGNED CRAFT</div>
          <FlightStrip craft={craft} project={project!} />
        </div>
      )}

      {/* Usage stats */}
      {latestUsage && (
        <div className="mt-4">
          <div {...sectionHeading}>LATEST USAGE</div>
          <div className="grid grid-cols-4 gap-3">
            <StatCard
              label="INPUT TOKENS"
              value={latestUsage.tokens.input.toLocaleString()}
              color="var(--accent-blue)"
            />
            <StatCard
              label="OUTPUT TOKENS"
              value={latestUsage.tokens.output.toLocaleString()}
              color="var(--accent-green)"
            />
            <StatCard
              label="TOOL CALLS"
              value={latestUsage.tools.reduce((sum, t) => sum + t.calls, 0)}
              color="var(--accent-yellow)"
            />
            <StatCard
              label="DURATION"
              value={`${Math.floor(latestUsage.duration / 1000)}s`}
              color="var(--text-secondary)"
            />
          </div>
        </div>
      )}

      {/* Usage history */}
      {usage && usage.length > 0 && (
        <div
          className="mt-4 rounded-md border p-3.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border)",
          }}
        >
          <div {...sectionHeading}>USAGE HISTORY</div>
          <div className="space-y-1">
            {[...usage].reverse().map((report, i) => (
              <div
                key={`${report.timestamp}-${i}`}
                className="flex items-center justify-between rounded-md p-2 text-[11px]"
                style={{ backgroundColor: "var(--bg-elevated)" }}
              >
                <span style={{ color: "var(--text-dim)" }}>
                  {new Date(report.timestamp).toLocaleString()}
                </span>
                <span style={{ color: "var(--text-muted)" }}>
                  {report.tokens.input + report.tokens.output} tokens ·{" "}
                  {Math.floor(report.duration / 1000)}s
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-md border p-4"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Delete Pilot
            </div>
            <div
              className="mt-2 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Are you sure you want to delete pilot{" "}
              <strong>{pilot.identifier}</strong>? This action cannot be undone.
            </div>
            {deletePilot.error && (
              <div
                className="mt-2 rounded-md px-3 py-2 text-xs"
                style={{
                  backgroundColor: "rgba(255, 85, 85, 0.1)",
                  color: "var(--accent-red)",
                }}
              >
                {deletePilot.error.message}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deletePilot.isPending}
                className="rounded-md px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: deletePilot.isPending
                    ? "var(--bg-elevated)"
                    : "var(--accent-red)",
                  color: deletePilot.isPending
                    ? "var(--text-muted)"
                    : "#fff",
                }}
              >
                {deletePilot.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
