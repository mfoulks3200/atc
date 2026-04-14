import * as React from "react";
import {
  GLOSSARY,
  RULES,
  groupRulesByPrefix,
  type GlossaryTerm,
  type RuleEntry,
} from "@/lib/glossary-data";

type Tab = "glossary" | "rules";

export interface GlossaryModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
}

function filterGlossary(query: string): GlossaryTerm[] {
  if (!query.trim()) return [...GLOSSARY];
  const q = query.toLowerCase();
  return GLOSSARY.filter(
    (entry) =>
      entry.term.toLowerCase().includes(q) || entry.definition.toLowerCase().includes(q),
  );
}

function filterRules(query: string): RuleEntry[] {
  if (!query.trim()) return [...RULES];
  const q = query.toLowerCase();
  return RULES.filter(
    (rule) =>
      rule.id.toLowerCase().includes(q) ||
      rule.summary.toLowerCase().includes(q) ||
      rule.prefix.toLowerCase().includes(q),
  );
}

export function GlossaryModal({ open, onClose, initialTab = "glossary" }: GlossaryModalProps) {
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setQuery("");
  }, [open, initialTab]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const glossaryResults = filterGlossary(query);
  const ruleResults = filterRules(query);
  const ruleGroups = groupRulesByPrefix(ruleResults);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Glossary and rules reference"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border shadow-2xl"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-4">
            <h2
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--accent-green)" }}
            >
              Reference
            </h2>
            <div className="flex gap-1">
              <TabButton active={tab === "glossary"} onClick={() => setTab("glossary")}>
                Glossary ({GLOSSARY.length})
              </TabButton>
              <TabButton active={tab === "rules"} onClick={() => setTab("rules")}>
                Rules ({RULES.length})
              </TabButton>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reference"
            className="text-lg"
            style={{ color: "var(--text-muted)" }}
          >
            ×
          </button>
        </div>

        <div className="border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
          <input
            type="text"
            autoFocus
            placeholder={tab === "glossary" ? "Filter terms..." : "Filter rules..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter"
            className="w-full rounded-md border px-3 py-1.5 text-xs outline-none"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "glossary" ? (
            <GlossaryList entries={glossaryResults} />
          ) : (
            <RulesList groups={ruleGroups} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-widest"
      style={{
        color: active ? "var(--accent-green)" : "var(--text-muted)",
        backgroundColor: active ? "var(--bg-elevated)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function GlossaryList({ entries }: { entries: GlossaryTerm[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        No terms match your filter.
      </p>
    );
  }
  return (
    <dl className="space-y-3">
      {entries.map((entry) => (
        <div
          key={entry.term}
          className="rounded-md border p-3"
          style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border)" }}
        >
          <dt
            className="mb-1 text-xs font-semibold"
            style={{ color: "var(--accent-green)" }}
          >
            {entry.term}
          </dt>
          <dd
            className="text-[11px] leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {entry.definition}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RulesList({
  groups,
}: {
  groups: Array<{ prefix: string; rules: RuleEntry[] }>;
}) {
  if (groups.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        No rules match your filter.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.prefix}>
          <h3
            className="mb-2 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-dim)" }}
          >
            {group.prefix} ({group.rules.length})
          </h3>
          <ul className="space-y-1.5">
            {group.rules.map((rule) => (
              <li
                key={rule.id}
                className="flex gap-3 rounded-md border p-2 text-[11px]"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border)",
                }}
              >
                <span
                  className="shrink-0 font-mono text-[10px] font-semibold"
                  style={{ color: "var(--accent-green)" }}
                >
                  {rule.id}
                </span>
                <span className="flex-1" style={{ color: "var(--text-secondary)" }}>
                  {rule.summary}
                </span>
                {rule.section && (
                  <span
                    className="shrink-0 font-mono text-[10px]"
                    style={{ color: "var(--text-dim)" }}
                  >
                    §{rule.section}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
