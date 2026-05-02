import { useEffect, useRef, useCallback } from "react";
import type { VerifiedBlackBoxEntry, PilotRecord } from "@/types/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerificationDetailModalProps {
  /** All entries with verification state annotations. */
  entries: VerifiedBlackBoxEntry[];
  /** Pilot registry for cross-referencing unsigned entry authors. */
  pilots: PilotRecord[];
  /** Called when the modal should close. */
  onClose: () => void;
  /** Ref of the element that triggered the modal — focus returns here on close. */
  triggerRef: React.RefObject<HTMLElement | null>;
  /** Called when the user clicks "View entry" — receives the entry index in the black box. */
  onViewEntry?: (entryIndex: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  count: number;
  color: "red" | "amber";
  children: React.ReactNode;
}

function Section({ title, count, color, children }: SectionProps) {
  const tokenMap = {
    red: "var(--accent-red)",
    amber: "var(--accent-yellow)",
  } as const;
  const token = tokenMap[color];
  return (
    <section aria-label={`${title} (${count})`}>
      <h3
        className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: token }}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: token }}
          aria-hidden="true"
        />
        {title}
        <span
          className="ml-auto rounded-sm px-1.5 py-px text-[9px] font-bold tabular-nums"
          style={{
            color: token,
            backgroundColor: `color-mix(in srgb, ${token} 15%, transparent)`,
          }}
        >
          {count}
        </span>
      </h3>
      <ol className="space-y-2">{children}</ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Entry row
// ---------------------------------------------------------------------------

interface EntryRowProps {
  label: string;
  detail: string;
  entryIndex: number;
  onViewEntry?: (i: number) => void;
}

function EntryRow({ label, detail, entryIndex, onViewEntry }: EntryRowProps) {
  return (
    <li
      className="rounded-sm border px-3 py-2 text-[11px] leading-snug"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "color-mix(in srgb, var(--bg-elevated) 60%, transparent)",
      }}
    >
      <p style={{ color: "var(--text-secondary)" }}>
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>{" "}
        {detail}
      </p>
      {onViewEntry && (
        <button
          type="button"
          onClick={() => onViewEntry(entryIndex)}
          className="mt-1 text-[10px] underline underline-offset-2"
          style={{ color: "var(--accent-blue)" }}
        >
          View entry ↗
        </button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

/**
 * Verification Detail modal for the Black Box activity feed integrity bar.
 *
 * Displays per-entry verification anomalies grouped by severity:
 * 1. Signature Mismatches (signed-invalid — red)
 * 2. Unresolvable Authors (author-not-found — amber)
 * 3. Unsigned from Keyed Pilots (unsigned where pilot has a registered key — amber)
 *
 * Accessibility: focus trap, Escape closes, role=dialog, aria-modal=true,
 * aria-labelledby, WCAG AA contrast. Focus returns to triggerRef on close.
 *
 * @see AIR-344
 * @see RULE-BBOX-8
 */
export function VerificationDetailModal({
  entries,
  pilots,
  onClose,
  triggerRef,
  onViewEntry,
}: VerificationDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = "vdm-title";

  // Build a set of pilot identifiers that have a registered public key
  const keyedPilots = new Set(
    pilots.filter((p) => p.publicKey != null).map((p) => p.identifier),
  );

  // Categorise entries
  const tamperedEntries = entries.filter((e) => e.verificationState === "signed-invalid");
  const unresolvableEntries = entries.filter((e) => e.verificationState === "author-not-found");
  const unsignedKeyedEntries = entries.filter(
    (e) => e.verificationState === "unsigned" && keyedPilots.has(e.author),
  );

  // Focus the dialog on mount, return focus on close
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const first = getFocusable(el)[0];
    if (first) first.focus();
    else el.focus();

    return () => {
      const target = triggerRef.current;
      if (target) target.focus();
    };
  }, [triggerRef]);

  // Focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const el = dialogRef.current;
      if (!el) return;
      const focusable = getFocusable(el);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  const hasContent =
    tamperedEntries.length > 0 ||
    unresolvableEntries.length > 0 ||
    unsignedKeyedEntries.length > 0;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        data-testid="verification-detail-modal"
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-md border shadow-2xl outline-none"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-[9px] uppercase tracking-widest"
              style={{ color: "var(--text-dim)" }}
            >
              BLACK BOX
            </span>
            <h2
              id={titleId}
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-primary)" }}
            >
              Verification Details
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close verification details"
            onClick={onClose}
            className="rounded-sm px-1.5 py-0.5 text-[11px] transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-auto px-4 py-4">
          {!hasContent ? (
            <p
              className="py-6 text-center text-xs"
              data-testid="vdm-all-clear"
              style={{ color: "var(--text-dim)" }}
            >
              No verification anomalies detected.
            </p>
          ) : (
            <>
              {/* 1 — Signature Mismatches */}
              {tamperedEntries.length > 0 && (
                <Section
                  title="Signature Mismatches"
                  count={tamperedEntries.length}
                  color="red"
                >
                  {tamperedEntries.map((entry, i) => (
                    <EntryRow
                      key={`tampered-${i}`}
                      label="Signature mismatch:"
                      detail={`Entry by "${entry.author}" failed cryptographic verification. This may indicate tampering.`}
                      entryIndex={entries.indexOf(entry)}
                      onViewEntry={onViewEntry}
                    />
                  ))}
                </Section>
              )}

              {/* 2 — Unresolvable Authors */}
              {unresolvableEntries.length > 0 && (
                <Section
                  title="Unresolvable Authors"
                  count={unresolvableEntries.length}
                  color="amber"
                >
                  {unresolvableEntries.map((entry, i) => (
                    <EntryRow
                      key={`unresolvable-${i}`}
                      label="Author not found:"
                      detail={`Pilot record for "${entry.author}" could not be resolved. This may indicate a deleted pilot or an identifier mismatch. The entry's signature cannot be verified.`}
                      entryIndex={entries.indexOf(entry)}
                      onViewEntry={onViewEntry}
                    />
                  ))}
                </Section>
              )}

              {/* 3 — Unsigned from Keyed Pilots */}
              {unsignedKeyedEntries.length > 0 && (
                <Section
                  title="Unsigned from Keyed Pilots"
                  count={unsignedKeyedEntries.length}
                  color="amber"
                >
                  {unsignedKeyedEntries.map((entry, i) => (
                    <EntryRow
                      key={`unsigned-keyed-${i}`}
                      label="Unsigned:"
                      detail={`Entry by "${entry.author}" has no signature, but this pilot has a registered key. Entries written before key registration are expected to be unsigned.`}
                      entryIndex={entries.indexOf(entry)}
                      onViewEntry={onViewEntry}
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex shrink-0 items-center justify-end border-t px-4 py-2.5"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border px-3 py-1 text-[10px] uppercase tracking-wider transition-colors"
            style={{
              color: "var(--text-secondary)",
              borderColor: "var(--border)",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
