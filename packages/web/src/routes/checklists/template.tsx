import { useState } from "react";
import { useParams } from "react-router";
import { useChecklistTemplate } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { ChecklistItemEditor } from "@/components/base/checklist-item-editor";
import type { ChecklistItemDef } from "@/types/checklist";

export function Component() {
  const { id } = useParams<{ id: string }>();
  const { data: template } = useChecklistTemplate(id!);
  const [name, setName] = useState(template?.name ?? "");
  const [items, setItems] = useState<ChecklistItemDef[]>(template?.items ?? []);

  if (template && name === "" && items.length === 0) {
    setName(template.name);
    setItems([...template.items]);
  }

  function updateItem(index: number, updated: ChecklistItemDef) {
    setItems((prev) => prev.map((item, i) => (i === index ? updated : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { name: "", severity: "required" as const, executor: { type: "shell" as const, command: "" } },
    ]);
  }

  return (
    <div>
      <PageHeader crumbs={[{ label: "Checklists", to: "/checklists" }, { label: name || "New Template" }]} />
      <div className="mt-5 flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <input
            className="bg-transparent text-base font-semibold"
            style={{ color: "var(--text-primary)", border: "none", outline: "none" }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template Name"
          />
          {template && (
            <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-dim)" }}>
              Template ID: {template.id}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button className="rounded border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "transparent" }}>
            Cancel
          </button>
          <button className="rounded px-3 py-1.5 text-xs" style={{ background: "var(--accent-blue, #3b82f6)", color: "white" }}>
            Save Template
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <ChecklistItemEditor key={index} item={item} onChange={(updated) => updateItem(index, updated)} onRemove={() => removeItem(index)} />
        ))}
        <div
          className="cursor-pointer rounded-lg border border-dashed p-3 text-center text-xs"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
          onClick={addItem}
        >
          + Add Checklist Item
        </div>
      </div>
    </div>
  );
}
