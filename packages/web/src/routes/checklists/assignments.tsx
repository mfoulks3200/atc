import { useState } from "react";
import { useChecklistTemplates, useChecklistBindings } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";

const LIFECYCLE_EVENTS = [
  "before:takeoff", "after:takeoff",
  "before:vector-complete", "after:vector-complete",
  "before:landing-check", "after:landing-check",
  "before:go-around", "after:go-around",
  "before:emergency", "after:emergency",
  "before:landing", "after:landing",
] as const;

export function Component() {
  const { data: templates } = useChecklistTemplates();
  const { data: bindings } = useChecklistBindings();
  const [selectedCategory, setSelectedCategory] = useState<string>("*");

  const categories = ["*", "feature", "hotfix", "refactor"];

  const bindingsForEvent = (event: string) =>
    (bindings ?? []).filter(
      (b) => b.event === event &&
        (selectedCategory === "*" ? true : b.craftCategory === selectedCategory || b.craftCategory === "*"),
    );

  const templateName = (id: string) => templates?.find((t) => t.id === id)?.name ?? id;

  return (
    <div>
      <PageHeader crumbs={[{ label: "Checklists", to: "/checklists" }, { label: "Event Assignments" }]} />
      <div className="mt-5 flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            className="rounded-full px-3.5 py-1 text-xs"
            style={{
              background: cat === selectedCategory ? "var(--accent-blue, #3b82f6)" : "var(--bg-elevated)",
              color: cat === selectedCategory ? "white" : "var(--text-muted)",
            }}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat === "*" ? "All Categories" : cat}
          </button>
        ))}
      </div>

      <div className="relative mt-6" style={{ paddingLeft: "28px" }}>
        <div className="absolute top-0 bottom-0" style={{ left: "12px", width: "2px", background: "var(--border)" }} />
        {LIFECYCLE_EVENTS.map((event) => {
          const eventBindings = bindingsForEvent(event);
          const hasBindings = eventBindings.length > 0;
          return (
            <div key={event} className="relative mb-6">
              <div
                className="absolute rounded-full"
                style={{
                  left: "-22px", top: "4px", width: "12px", height: "12px",
                  background: hasBindings ? "var(--accent-blue, #3b82f6)" : "var(--border)",
                  border: "2px solid var(--bg-base, #1e293b)",
                }}
              />
              <div className="text-[10px] uppercase tracking-widest" style={{ color: hasBindings ? "var(--text-muted)" : "var(--text-dim)" }}>
                {event}
              </div>
              <div className="mt-2">
                {eventBindings.length > 0 ? (
                  eventBindings.map((b) => (
                    <div
                      key={`${b.templateId}-${b.craftCategory}`}
                      className="flex items-center justify-between rounded-md border p-2.5"
                      style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ color: "var(--accent-blue, #3b82f6)" }}>{"\u25A0"}</span>
                        <span className="text-[11px]" style={{ color: "var(--text-primary)" }}>
                          {templateName(b.templateId)}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                          {templates?.find((t) => t.id === b.templateId)?.items.length ?? 0} items
                        </span>
                      </div>
                      <span className="cursor-pointer text-xs" style={{ color: "var(--text-dim)" }}>{"\u00D7"}</span>
                    </div>
                  ))
                ) : (
                  <div className="cursor-pointer rounded-md border border-dashed p-2.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
                    + Assign checklist template...
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
