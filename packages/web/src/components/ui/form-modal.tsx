import { useEffect, useRef, type ReactNode } from "react";

interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onSubmit: () => void;
  isPending: boolean;
  error: string | null;
  children: ReactNode;
}

export function FormModal({ open, onClose, title, onSubmit, isPending, error, children }: FormModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-md border p-0"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </span>
          <button
            onClick={onClose}
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          {children}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-3 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: "rgba(255, 85, 85, 0.1)", color: "var(--accent-red)" }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div
          className="flex justify-end gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-xs"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: isPending ? "var(--bg-elevated)" : "var(--accent-green)",
              color: isPending ? "var(--text-muted)" : "var(--bg-base)",
            }}
          >
            {isPending ? "Saving..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
