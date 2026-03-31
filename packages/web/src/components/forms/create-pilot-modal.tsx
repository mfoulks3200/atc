import { useState } from "react";
import { useCreatePilot } from "@/hooks/use-api";
import { FormModal } from "@/components/ui/form-modal";

interface CreatePilotModalProps {
  open: boolean;
  onClose: () => void;
  project: string;
  categories: string[];
}

const inputStyle = {
  backgroundColor: "var(--bg-elevated)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const labelStyle = { color: "var(--text-muted)" };

export function CreatePilotModal({ open, onClose, project, categories }: CreatePilotModalProps) {
  const createPilot = useCreatePilot(project);
  const [identifier, setIdentifier] = useState("");
  const [certifications, setCertifications] = useState<string[]>([]);

  function reset() {
    setIdentifier("");
    setCertifications([]);
    createPilot.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function toggleCertification(cat: string) {
    setCertifications((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function handleSubmit() {
    if (!identifier.trim()) return;
    createPilot.mutate(
      { identifier: identifier.trim(), certifications },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  }

  return (
    <FormModal
      open={open}
      onClose={handleClose}
      title="New Pilot"
      onSubmit={handleSubmit}
      isPending={createPilot.isPending}
      error={createPilot.error?.message ?? null}
    >
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
          Identifier
        </label>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="pilot-name"
          className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider" style={labelStyle}>
          Certifications
        </label>
        {categories.length === 0 && (
          <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            No categories configured for this project.
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => {
            const selected = certifications.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCertification(cat)}
                className="rounded-sm px-2 py-1 text-[10px] transition-colors"
                style={{
                  backgroundColor: selected ? "rgba(0, 255, 136, 0.15)" : "var(--bg-elevated)",
                  color: selected ? "var(--accent-green)" : "var(--text-muted)",
                  border: selected ? "1px solid var(--accent-green)" : "1px solid transparent",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>
    </FormModal>
  );
}
