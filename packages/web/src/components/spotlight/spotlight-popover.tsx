import { forwardRef } from "react";

export interface SpotlightPopoverProps {
  title: string;
  body: string;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

export const SpotlightPopover = forwardRef<HTMLDivElement, SpotlightPopoverProps>(
  ({ title, body, stepIndex, stepCount, onNext, onBack, onClose, style }, ref) => {
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === stepCount - 1;
    return (
      <div
        ref={ref}
        role="dialog"
        aria-label={title}
        className="pointer-events-auto relative rounded-[10px] border p-4 shadow-xl"
        style={{
          width: 260,
          maxWidth: "90vw",
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
          ...style,
        }}
      >
        <button
          type="button"
          aria-label="Close tour"
          onClick={onClose}
          className="absolute right-2.5 top-2 bg-transparent px-1.5 py-0.5 text-base leading-none"
          style={{ color: "var(--text-dim)" }}
        >
          ×
        </button>
        <h4 className="mb-1.5 pr-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h4>
        <p className="mb-3.5 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {body}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: stepCount }).map((_, i) => (
              <span
                key={i}
                data-testid="spotlight-dot"
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: i === stepIndex ? "var(--accent-green)" : "var(--border)",
                }}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onBack}
              disabled={isFirst}
              className="rounded-md border px-2.5 py-1 text-xs disabled:opacity-40"
              style={{
                backgroundColor: "transparent",
                borderColor: "var(--border)",
                color: "var(--text-muted)",
              }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={onNext}
              autoFocus
              className="rounded-md border px-2.5 py-1 text-xs font-semibold"
              style={{
                backgroundColor: "var(--accent-green)",
                borderColor: "var(--accent-green)",
                color: "var(--bg-base)",
              }}
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    );
  },
);
SpotlightPopover.displayName = "SpotlightPopover";
