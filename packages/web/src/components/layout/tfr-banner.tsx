import { useGlobalTfr } from "@/hooks/use-global-tfr.js";

/**
 * Persistent sticky banner rendered between the header and main content
 * whenever a global TFR is active. Disappears automatically when the TFR
 * is lifted via WebSocket event on the `tfr:global` channel.
 *
 * @see RULE-TFR-1
 */
export function TfrBanner() {
  const { state, activeIds } = useGlobalTfr();

  if (state !== "active") return null;

  const count = activeIds.length;

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-testid="tfr-banner"
      className="flex shrink-0 items-center gap-3 px-5 py-2"
      style={{
        backgroundColor: "color-mix(in srgb, var(--accent-yellow) 8%, var(--bg-elevated))",
        borderBottom: "1px solid color-mix(in srgb, var(--accent-yellow) 25%, transparent)",
        boxShadow: "0 1px 8px color-mix(in srgb, var(--accent-yellow) 10%, transparent)",
        animation: "tfr-banner-in 200ms ease-out",
      }}
    >
      {/* Pulsing beacon — mirrors the ATC radar-pulse convention */}
      <span
        className="pulse shrink-0"
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: "var(--accent-yellow)",
          boxShadow: "0 0 5px var(--accent-yellow)",
        }}
      />

      <span
        className="text-[9px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--accent-yellow)" }}
      >
        TFR Active
      </span>

      <span aria-hidden="true" className="text-[9px]" style={{ color: "var(--text-dim)" }}>
        —
      </span>

      <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        Operations restricted
      </span>

      {count > 1 && (
        <span
          data-testid="tfr-banner-count"
          className="ml-1 text-[9px]"
          style={{ color: "var(--text-dim)" }}
        >
          ({count} active)
        </span>
      )}
    </div>
  );
}
