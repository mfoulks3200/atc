import { useCallback, useId, useRef, useState } from "react";

interface HistoricalKeyIndicatorProps {
  /** Pilot callsign who signed the entry. */
  author: string;
  /** ISO-8601 UTC timestamp when the signing key was created. */
  keyCreatedAt: string;
  /** ISO-8601 UTC timestamp when the key was rotated and archived. */
  keyRotatedAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Amber lock+clock icon displayed on Black Box entries signed with a rotated-but-valid archived key.
 * Shows a tooltip on hover (300 ms delay) and on keyboard focus.
 *
 * @see RULE-BBOX-* (key archival retention)
 * @see AIR-348
 */
export function HistoricalKeyIndicator({
  author,
  keyCreatedAt,
  keyRotatedAt,
}: HistoricalKeyIndicatorProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"top" | "bottom">("top");
  const timerId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();

  const show = useCallback(() => {
    timerId.current = setTimeout(() => {
      if (triggerRef.current) {
        const { top } = triggerRef.current.getBoundingClientRect();
        setPlacement(top > 56 ? "top" : "bottom");
      }
      setOpen(true);
    }, 300);
  }, []);

  const hide = useCallback(() => {
    if (timerId.current !== null) {
      clearTimeout(timerId.current);
      timerId.current = null;
    }
    setOpen(false);
  }, []);

  const tooltipText = `Signed with ${author}'s key from ${formatDate(keyCreatedAt)}. Key rotated ${formatDate(keyRotatedAt)}. Signature is valid.`;

  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        aria-label="Signed with historical key — hover for details"
        data-testid="historical-key-trigger"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{
          all: "unset",
          cursor: "help",
          position: "relative",
          width: 16,
          height: 16,
          color: "var(--accent-yellow)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {/* 16×16 closed padlock */}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <rect x="2.5" y="7" width="11" height="8" rx="1.5" />
          <path
            d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
        {/* 8×8 clock overlay at bottom-right corner */}
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: -2,
            right: -3,
            borderRadius: "50%",
            background: "var(--bg-surface, #0d1424)",
          }}
        >
          <circle
            cx="4"
            cy="4"
            r="3.25"
            stroke="currentColor"
            strokeWidth="0.8"
            fill="var(--bg-surface, #0d1424)"
          />
          <line
            x1="4"
            y1="4"
            x2="4"
            y2="1.75"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <line
            x1="4"
            y1="4"
            x2="5.75"
            y2="4"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          data-testid="historical-key-tooltip"
          style={{
            position: "absolute",
            ...(placement === "top"
              ? { bottom: "calc(100% + 6px)" }
              : { top: "calc(100% + 6px)" }),
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            padding: "4px 8px",
            borderRadius: 4,
            fontSize: 10,
            lineHeight: 1.4,
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          {tooltipText}
        </div>
      )}
    </span>
  );
}
