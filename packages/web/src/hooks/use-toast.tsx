import { createContext, useCallback, useContext, useReducer } from "react";
import type { ReactNode } from "react";

/** Severity levels for toast notifications. */
export type ToastSeverity = "error" | "warning" | "info" | "success";

/** A single toast notification entry. */
export interface Toast {
  id: string;
  severity: ToastSeverity;
  title: string;
  message?: string;
  /** Auto-dismiss delay in ms. 0 = persistent until manually dismissed. */
  duration: number;
}

/** Options for adding a toast (id and duration have defaults). */
export type AddToastOptions = Omit<Toast, "id" | "duration"> & { duration?: number };

/** Default auto-dismiss durations per severity. @see AIR-101 UX design spec §6 */
export const SEVERITY_DURATION: Record<ToastSeverity, number> = {
  error: 8000,
  warning: 6000,
  info: 4000,
  success: 4000,
};

/** Maximum number of toasts shown simultaneously. */
export const MAX_TOASTS = 5;

type Action = { type: "ADD"; toast: Toast } | { type: "REMOVE"; id: string };

function reducer(state: Toast[], action: Action): Toast[] {
  switch (action.type) {
    case "ADD":
      return [action.toast, ...state].slice(0, MAX_TOASTS);
    case "REMOVE":
      return state.filter((t) => t.id !== action.id);
  }
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (options: AddToastOptions) => void;
  removeToast: (id: string) => void;
}

const ToastCtx = createContext<ToastContextValue | null>(null);

/** Provides the toast queue to all descendants. Render ToastContainer inside the same tree. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, []);

  const addToast = useCallback((options: AddToastOptions) => {
    const toast: Toast = {
      ...options,
      id: crypto.randomUUID(),
      duration: options.duration ?? SEVERITY_DURATION[options.severity],
    };
    dispatch({ type: "ADD", toast });
  }, []);

  const removeToast = useCallback((id: string) => {
    dispatch({ type: "REMOVE", id });
  }, []);

  return (
    <ToastCtx.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastCtx.Provider>
  );
}

/** Access the toast queue and dispatch helpers. Must be called inside <ToastProvider>. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
