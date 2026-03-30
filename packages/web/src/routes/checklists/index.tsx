import { useChecklistTemplates, useChecklistBindings } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import type { ChecklistBinding } from "@/types/checklist";

export function Component() {
  const { data: templates } = useChecklistTemplates();
  const { data: bindings } = useChecklistBindings();

  const bindingsForTemplate = (id: string): ChecklistBinding[] =>
    (bindings ?? []).filter((b) => b.templateId === id);

  return (
    <div>
      <PageHeader crumbs={[{ label: "Checklists" }]} />
      <div className="mt-5 flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <span className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Checklist Templates
          </span>
          <span className="ml-3 text-xs" style={{ color: "var(--text-dim)" }}>
            {templates?.length ?? 0} templates
          </span>
        </div>
        <button
          className="rounded px-3 py-1.5 text-xs"
          style={{ background: "var(--accent-blue, #3b82f6)", color: "white" }}
        >
          + New Template
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {(!templates || templates.length === 0) ? (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            No checklist templates defined.
          </div>
        ) : (
          templates.map((tpl) => {
            const tplBindings = bindingsForTemplate(tpl.id);
            const requiredCount = tpl.items.filter((i) => i.severity === "required").length;
            const advisoryCount = tpl.items.filter((i) => i.severity === "advisory").length;

            return (
              <div
                key={tpl.id}
                className="flex items-center justify-between rounded-md p-3"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <div>
                  <div className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
                    {tpl.name}
                  </div>
                  <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-dim)" }}>
                    {tpl.items.length} items · {requiredCount} required, {advisoryCount} advisory
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tplBindings.map((b) => (
                    <span
                      key={`${b.event}-${b.craftCategory}`}
                      className="rounded px-2 py-0.5 text-[10px]"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                    >
                      {b.event}
                    </span>
                  ))}
                  {tplBindings.length > 0 && (
                    <span
                      className="rounded px-2 py-0.5 text-[10px]"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                    >
                      {[...new Set(tplBindings.map((b) => b.craftCategory))].join(", ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
