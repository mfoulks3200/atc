import { useEffect, useRef } from "react";
import type { Toast, ToastSeverity } from "@/hooks/use-toast.js";
import { useToast } from "@/hooks/use-toast.js";

/** @see AIR-101 UX design spec §5 */
const SEVERITY_COLORS: Record<ToastSeverity, string> = {
  error: "var(--accent-red)",
  warning: "var(--accent-yellow)",
  info: "var(--accent-blue)",
  success: "var(--accent-green)",
};

const SEVERITY_ICONS: Record<ToastSeverity, string> = {
  error: "▲",
  warning: "●",
  info: "◆",
  success: "✓",
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const color = SEVERITY_COLORS[toast.severity];
  const isAlert = toast.severity === "error" || toast.severity === "warning";

  useEffect(() => {
    if (toast.duration === 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      aria-atomic="true"
      className="relative flex w-80 flex-col overflow-hidden rounded-md border p-3.5"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 12%, var(--bg-elevated))`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        boxShadow: `0 4px 16px color-mix(in srgb, ${color} 20%, transparent)`,
        animation: "toast-slide-in 200ms ease-out",
      }}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-px shrink-0 text-xs"
          aria-hidden="true"
          style={{ color }}
        >
          {SEVERITY_ICONS[toast.severity]}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color }}
          >
            {toast.title}
          </p>
          {toast.message && (
            <p
              className="mt-0.5 text-xs leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {toast.message}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className="shrink-0 rounded-sm p-0.5 text-xs opacity-60 transition-opacity hover:opacity-100"
          style={{ color: "var(--text-muted)" }}
        >
          ✕
        </button>
      </div>
      {toast.duration > 0 && (
        <div
          className="absolute bottom-0 left-0 h-0.5"
          aria-hidden="true"
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 50%, transparent)`,
            animation: `toast-progress ${toast.duration}ms linear forwards`,
          }}
        />
      )}
    </div>
  );
}

/**
 * Fixed bottom-right overlay that renders the active toast queue.
 * Mount once inside <ToastProvider>.
 * @see AIR-101 UX design spec §3
 */
export function ToastContainer() {
  const { toasts, removeToast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const topToast = toasts[0];
      if (topToast) removeToast(topToast.id);
    };
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}
