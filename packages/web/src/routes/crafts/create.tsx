import { useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useProject, usePilots, useCreateCraft } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";

const inputStyle = {
  backgroundColor: "var(--bg-elevated)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const labelStyle = { color: "var(--text-muted)" };

interface VectorRow {
  id: number;
  name: string;
  acceptanceCriteria: string;
}

let nextVectorId = 1;

export function Component() {
  const { name: project } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data: projectData } = useProject(project!);
  const { data: pilots } = usePilots(project!);
  const createCraft = useCreateCraft(project!);

  const [callsign, setCallsign] = useState("");
  const [branch, setBranch] = useState("");
  const [branchManuallyEdited, setBranchManuallyEdited] = useState(false);
  const [cargo, setCargo] = useState("");
  const [category, setCategory] = useState("");
  const [captain, setCaptain] = useState("");
  const [firstOfficers, setFirstOfficers] = useState<string[]>([]);
  const [jumpseaters, setJumpseaters] = useState<string[]>([]);
  const [vectors, setVectors] = useState<VectorRow[]>([
    { id: nextVectorId++, name: "", acceptanceCriteria: "" },
  ]);

  const certifiedPilots = pilots?.filter((p) => p.certifications.includes(category)) ?? [];
  const allPilots = pilots ?? [];

  const handleCallsignChange = useCallback(
    (value: string) => {
      setCallsign(value);
      if (!branchManuallyEdited) {
        setBranch(value);
      }
    },
    [branchManuallyEdited],
  );

  function handleCategoryChange(newCategory: string) {
    setCategory(newCategory);
    setCaptain("");
    setFirstOfficers([]);
    setJumpseaters([]);
  }

  function toggleFirstOfficer(id: string) {
    setFirstOfficers((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleJumpseat(id: string) {
    setJumpseaters((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function addVector() {
    setVectors([...vectors, { id: nextVectorId++, name: "", acceptanceCriteria: "" }]);
  }

  function removeVector(id: number) {
    if (vectors.length <= 1) return;
    setVectors(vectors.filter((v) => v.id !== id));
  }

  function updateVector(id: number, field: "name" | "acceptanceCriteria", value: string) {
    setVectors(vectors.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  }

  function moveVector(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= vectors.length) return;
    const updated = [...vectors];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setVectors(updated);
  }

  function handleSubmit() {
    if (!callsign.trim() || !branch.trim() || !cargo.trim() || !category || !captain) return;
    const validVectors = vectors.filter((v) => v.name.trim() && v.acceptanceCriteria.trim());
    if (validVectors.length === 0) return;

    createCraft.mutate(
      {
        callsign: callsign.trim(),
        branch: branch.trim(),
        cargo: cargo.trim(),
        category,
        captain,
        firstOfficers: firstOfficers.length > 0 ? firstOfficers : undefined,
        jumpseaters: jumpseaters.length > 0 ? jumpseaters : undefined,
        flightPlan: validVectors.map((v) => ({
          name: v.name.trim(),
          acceptanceCriteria: v.acceptanceCriteria.trim(),
        })),
      },
      {
        onSuccess: (craft) => {
          navigate(`/projects/${project}/crafts/${craft.callsign}`);
        },
      },
    );
  }

  const categories = projectData?.categories ?? [];

  const availableFOs = certifiedPilots.filter((p) => p.identifier !== captain);
  const selectedCrew = [captain, ...firstOfficers];
  const availableJumpseaters = allPilots.filter((p) => !selectedCrew.includes(p.identifier));

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "Projects", to: "/projects" },
          { label: project!, to: `/projects/${project}` },
          { label: "New Craft" },
        ]}
      />
      <div className="mx-auto mt-5 max-w-2xl">
        <div
          className="rounded-md border p-5"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          {/* Basic Info */}
          <div className="mb-5 space-y-3">
            <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
              BASIC INFO
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                  Callsign
                </label>
                <input
                  type="text"
                  value={callsign}
                  onChange={(e) => handleCallsignChange(e.target.value)}
                  placeholder="fix-auth-bug"
                  className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                  Branch
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    setBranchManuallyEdited(true);
                  }}
                  placeholder="fix-auth-bug"
                  className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                Cargo
              </label>
              <textarea
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Description of the change and its scope..."
                rows={3}
                className="w-full rounded-md border px-3 py-1.5 text-xs outline-none resize-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
                style={inputStyle}
              >
                <option value="">Select a category...</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Crew Assignment */}
          <div className="mb-5">
            <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
              CREW ASSIGNMENT
            </div>
            {!category && (
              <div className="py-3 text-center text-[10px]" style={{ color: "var(--text-dim)" }}>
                Select a category first to assign crew.
              </div>
            )}
            {category && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                    Captain (required)
                  </label>
                  {certifiedPilots.length === 0 ? (
                    <div className="text-[10px]" style={{ color: "var(--accent-yellow)" }}>
                      No pilots certified for "{category}".
                    </div>
                  ) : (
                    <select
                      value={captain}
                      onChange={(e) => setCaptain(e.target.value)}
                      className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
                      style={inputStyle}
                    >
                      <option value="">Select captain...</option>
                      {certifiedPilots.map((p) => (
                        <option key={p.identifier} value={p.identifier}>
                          {p.identifier}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                    First Officers (optional)
                  </label>
                  {availableFOs.length === 0 ? (
                    <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                      No other certified pilots available.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {availableFOs.map((p) => {
                        const selected = firstOfficers.includes(p.identifier);
                        return (
                          <button
                            key={p.identifier}
                            type="button"
                            onClick={() => toggleFirstOfficer(p.identifier)}
                            className="rounded-sm px-2 py-1 text-[10px] transition-colors"
                            style={{
                              backgroundColor: selected ? "rgba(120, 180, 255, 0.15)" : "var(--bg-elevated)",
                              color: selected ? "var(--accent-blue)" : "var(--text-muted)",
                              border: selected ? "1px solid var(--accent-blue)" : "1px solid transparent",
                            }}
                          >
                            {p.identifier}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
                    Jumpseaters (optional)
                  </label>
                  {availableJumpseaters.length === 0 ? (
                    <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                      No other pilots available.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {availableJumpseaters.map((p) => {
                        const selected = jumpseaters.includes(p.identifier);
                        return (
                          <button
                            key={p.identifier}
                            type="button"
                            onClick={() => toggleJumpseat(p.identifier)}
                            className="rounded-sm px-2 py-1 text-[10px] transition-colors"
                            style={{
                              backgroundColor: selected ? "rgba(180, 142, 255, 0.15)" : "var(--bg-elevated)",
                              color: selected ? "var(--accent-purple)" : "var(--text-muted)",
                              border: selected ? "1px solid var(--accent-purple)" : "1px solid transparent",
                            }}
                          >
                            {p.identifier}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Flight Plan */}
          <div className="mb-5">
            <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
              FLIGHT PLAN
            </div>
            <div className="space-y-2">
              {vectors.map((vector, index) => (
                <div
                  key={vector.id}
                  className="flex items-start gap-2 rounded-md p-2.5"
                  style={{ backgroundColor: "var(--bg-elevated)" }}
                >
                  <div className="flex flex-col gap-0.5 pt-1">
                    <button
                      type="button"
                      onClick={() => moveVector(index, -1)}
                      disabled={index === 0}
                      className="text-[10px] leading-none"
                      style={{ color: index === 0 ? "var(--text-dim)" : "var(--text-muted)" }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveVector(index, 1)}
                      disabled={index === vectors.length - 1}
                      className="text-[10px] leading-none"
                      style={{ color: index === vectors.length - 1 ? "var(--text-dim)" : "var(--text-muted)" }}
                    >
                      ▼
                    </button>
                  </div>
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[10px] font-semibold"
                    style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-muted)" }}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <input
                      type="text"
                      value={vector.name}
                      onChange={(e) => updateVector(vector.id, "name", e.target.value)}
                      placeholder="Vector name"
                      className="w-full rounded-md border px-2.5 py-1 text-xs outline-none"
                      style={inputStyle}
                    />
                    <textarea
                      value={vector.acceptanceCriteria}
                      onChange={(e) => updateVector(vector.id, "acceptanceCriteria", e.target.value)}
                      placeholder="Acceptance criteria..."
                      rows={2}
                      className="w-full rounded-md border px-2.5 py-1 text-xs outline-none resize-none"
                      style={inputStyle}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeVector(vector.id)}
                    disabled={vectors.length <= 1}
                    className="pt-1 text-xs"
                    style={{ color: vectors.length <= 1 ? "var(--text-dim)" : "var(--accent-red)" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addVector}
              className="mt-2 w-full rounded-md border border-dashed py-2 text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              + Add Vector
            </button>
          </div>

          {/* Error */}
          {createCraft.error && (
            <div className="mb-4 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: "rgba(255, 85, 85, 0.1)", color: "var(--accent-red)" }}>
              {createCraft.error.message}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2">
            <Link
              to={`/projects/${project}`}
              className="rounded-md px-3 py-1.5 text-xs no-underline"
              style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={createCraft.isPending}
              className="rounded-md px-3 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: createCraft.isPending ? "var(--bg-elevated)" : "var(--accent-green)",
                color: createCraft.isPending ? "var(--text-muted)" : "var(--bg-base)",
              }}
            >
              {createCraft.isPending ? "Creating..." : "Create Craft"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
