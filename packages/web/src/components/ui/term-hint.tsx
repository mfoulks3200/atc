import * as React from "react";
import { cn } from "@/lib/utils";
import { findRule, findTerm } from "@/lib/glossary-data";

type BaseProps = {
  children?: React.ReactNode;
  className?: string;
};

type TermProps = BaseProps & { term: string; rule?: never };
type RuleProps = BaseProps & { rule: string; term?: never };

export type TermHintProps = TermProps | RuleProps;

interface Resolved {
  heading: string;
  body: string;
  footer?: string;
}

function resolve(props: TermHintProps): Resolved | null {
  if ("term" in props && props.term) {
    const entry = findTerm(props.term);
    if (!entry) return null;
    return { heading: entry.term, body: entry.definition };
  }
  if ("rule" in props && props.rule) {
    const entry = findRule(props.rule);
    if (!entry) return null;
    return {
      heading: entry.id,
      body: entry.summary,
      footer: entry.section ? `§${entry.section}` : undefined,
    };
  }
  return null;
}

export function TermHint(props: TermHintProps) {
  const { children, className } = props;
  const resolved = resolve(props);
  const [open, setOpen] = React.useState(false);
  const hintId = React.useId();

  if (!resolved) {
    return children ? <span className={className}>{children}</span> : null;
  }

  return (
    <span className={cn("relative inline-flex items-center gap-1", className)}>
      {children}
      <button
        type="button"
        aria-label={`Definition of ${resolved.heading}`}
        aria-describedby={open ? hintId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border text-[9px] font-semibold leading-none"
        style={{
          borderColor: "var(--border)",
          color: "var(--text-dim)",
          backgroundColor: "var(--bg-elevated)",
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          id={hintId}
          className="absolute left-full top-full z-50 ml-1 mt-1 w-64 rounded-md border p-2 text-[11px] shadow-lg"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          <span
            className="mb-1 block text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--accent-green)" }}
          >
            {resolved.heading}
          </span>
          <span className="block leading-relaxed">{resolved.body}</span>
          {resolved.footer && (
            <span className="mt-1 block text-[9px]" style={{ color: "var(--text-dim)" }}>
              {resolved.footer}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
