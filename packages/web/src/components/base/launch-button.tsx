import { useState } from "react";
import { useLaunchCraft } from "@/hooks/use-api";
import type { CraftState } from "@/types/api";

interface LaunchButtonProps {
  project: string;
  craft: CraftState;
}

interface Precondition {
  ok: boolean;
  message: string;
}

export function evaluatePreconditions(craft: CraftState): Precondition {
  if (craft.status !== "Taxiing") {
    return { ok: false, message: `Craft must be in Taxiing (currently ${craft.status}).` };
  }
  if (!craft.captain) {
    return { ok: false, message: "Launch requires a captain pilot assigned to the craft." };
  }
  if (!craft.flightPlan || craft.flightPlan.length === 0) {
    return { ok: false, message: "Launch requires at least one vector in the flight plan." };
  }
  if (!craft.cargo) {
    return { ok: false, message: "Launch requires cargo (mission description) set on the craft." };
  }
  return { ok: true, message: "Ready for launch." };
}

export function LaunchButton({ project, craft }: LaunchButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const launch = useLaunchCraft(project, craft.callsign);

  const pre = evaluatePreconditions(craft);
  const isTaxiing = craft.status === "Taxiing";
  const disabled = !pre.ok || launch.isPending;

  async function handleConfirm() {
    setErrorMessage(null);
    try {
      await launch.mutateAsync();
      setConfirmOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Launch failed");
    }
  }

  if (!isTaxiing) {
    return null;
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setConfirmOpen(true);
          }}
          disabled={disabled}
          title={pre.ok ? "Launch craft" : pre.message}
          aria-label="Launch craft"
          data-testid="launch-button"
          className="rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-opacity"
          style={{
            backgroundColor: disabled ? "var(--bg-elevated)" : "var(--accent-green)",
            color: disabled ? "var(--text-dim)" : "var(--bg-base)",
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
            minWidth: 120,
          }}
        >
          {launch.isPending ? "Launching..." : "Launch"}
        </button>
        {!pre.ok && (
          <span
            data-testid="launch-button-disabled-reason"
            className="text-[10px]"
            style={{ color: "var(--text-dim)" }}
          >
            {pre.message}
          </span>
        )}
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="launch-confirm-title"
        >
          <div
            className="w-full max-w-md rounded-md border"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="border-b px-4 py-3"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                id="launch-confirm-title"
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Launch {craft.callsign}?
              </span>
            </div>
            <div className="space-y-2 px-4 py-4 text-xs" style={{ color: "var(--text-secondary)" }}>
              <div>
                This will transition the craft from <strong>Taxiing</strong> to{" "}
                <strong>InFlight</strong> and begin streaming agent activity.
              </div>
              <dl className="mt-3 space-y-1.5">
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-dim)" }}>Captain</dt>
                  <dd>{craft.captain}</dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-dim)" }}>Flight plan</dt>
                  <dd>
                    {craft.flightPlan.length} vector
                    {craft.flightPlan.length === 1 ? "" : "s"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-dim)" }}>Branch</dt>
                  <dd>{craft.branch}</dd>
                </div>
              </dl>
            </div>
            {errorMessage && (
              <div
                data-testid="launch-error"
                role="alert"
                className="mx-4 mb-3 rounded-md px-3 py-2 text-xs"
                style={{
                  backgroundColor: "rgba(255, 85, 85, 0.12)",
                  color: "var(--accent-red)",
                  border: "1px solid var(--accent-red)",
                }}
              >
                <div className="font-semibold">Launch failed</div>
                <div className="mt-1 break-words">{errorMessage}</div>
              </div>
            )}
            <div
              className="flex justify-end gap-2 border-t px-4 py-3"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={launch.isPending}
                className="rounded-md px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="launch-confirm-button"
                onClick={handleConfirm}
                disabled={launch.isPending}
                className="rounded-md px-4 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: launch.isPending
                    ? "var(--bg-elevated)"
                    : "var(--accent-green)",
                  color: launch.isPending ? "var(--text-muted)" : "var(--bg-base)",
                }}
              >
                {launch.isPending ? "Launching..." : "Confirm Launch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
