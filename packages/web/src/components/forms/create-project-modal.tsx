import { useState } from "react";
import { useNavigate } from "react-router";
import { useCreateProject } from "@/hooks/use-api";
import { FormModal } from "@/components/ui/form-modal";

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
}

const inputStyle = {
  backgroundColor: "var(--bg-elevated)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const labelStyle = { color: "var(--text-muted)" };

export function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const [name, setName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryInput, setCategoryInput] = useState("");

  function reset() {
    setName("");
    setRemoteUrl("");
    setCategories([]);
    setCategoryInput("");
    createProject.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function addCategory() {
    const trimmed = categoryInput.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories([...categories, trimmed]);
    }
    setCategoryInput("");
  }

  function removeCategory(cat: string) {
    setCategories(categories.filter((c) => c !== cat));
  }

  function handleSubmit() {
    if (!name.trim() || !remoteUrl.trim()) return;
    createProject.mutate(
      {
        name: name.trim(),
        remoteUrl: remoteUrl.trim(),
        categories,
        checklist: [],
      },
      {
        onSuccess: () => {
          const projectName = name.trim();
          reset();
          onClose();
          navigate(`/projects/${projectName}`);
        },
      },
    );
  }

  return (
    <FormModal
      open={open}
      onClose={handleClose}
      title="New Project"
      onSubmit={handleSubmit}
      isPending={createProject.isPending}
      error={createProject.error?.message ?? null}
    >
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-project"
          className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
          Remote URL
        </label>
        <input
          type="text"
          value={remoteUrl}
          onChange={(e) => setRemoteUrl(e.target.value)}
          placeholder="https://github.com/org/repo.git"
          className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
          Categories
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCategory();
              }
            }}
            placeholder="e.g. feature, bugfix"
            className="flex-1 rounded-md border px-3 py-1.5 text-xs outline-none"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={addCategory}
            className="rounded-md px-2.5 py-1.5 text-xs"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}
          >
            Add
          </button>
        </div>
        {categories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px]"
                style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}
              >
                {cat}
                <button
                  type="button"
                  onClick={() => removeCategory(cat)}
                  className="text-[10px]"
                  style={{ color: "var(--text-dim)" }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </FormModal>
  );
}
