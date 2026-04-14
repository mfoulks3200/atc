import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { PageHeader } from "@/components/base/page-header";
import { useProjectConfig, usePatchProjectConfig } from "@/hooks/use-api";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const { data, isLoading } = useProjectConfig(name!);
  const patchConfig = usePatchProjectConfig(name!);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [checklist, setChecklist] = useState<{ name: string; command: string; timeout?: number }[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.config) {
      setCategories(data.config.categories);
      setChecklist(data.config.checklist);
    }
  }, [data]);

  const addCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()]);
      setNewCategory("");
    }
  };

  const removeCategory = (cat: string) => {
    setCategories(categories.filter((c) => c !== cat));
  };

  const addChecklistItem = () => {
    setChecklist([...checklist, { name: "", command: "" }]);
  };

  const updateChecklistItem = (index: number, field: "name" | "command", value: string) => {
    const updated = [...checklist];
    updated[index] = { ...updated[index], [field]: value };
    setChecklist(updated);
  };

  const removeChecklistItem = (index: number) => {
    setChecklist(checklist.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    patchConfig.mutate(
      { categories, checklist },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: name! }, { label: "General" }]} />
        <div className="mt-5 text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: name! }, { label: "General" }]} />
      <div className="mt-5 space-y-4">
        {/* Categories */}
        <div className="rounded-md border p-4" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            CATEGORIES
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <span
                key={cat}
                className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px]"
                style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}
              >
                {cat}
                <button
                  onClick={() => removeCategory(cat)}
                  className="ml-1 text-[10px]"
                  style={{ color: "var(--text-dim)" }}
                >
                  x
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              placeholder="Add category..."
              className="flex-1 rounded-md border px-3 py-1.5 text-xs"
              style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
            <button
              onClick={addCategory}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Checklist */}
        <div className="rounded-md border p-4" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            CHECKLIST ITEMS
          </div>
          <div className="space-y-2">
            {checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md p-2" style={{ backgroundColor: "var(--bg-elevated)" }}>
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateChecklistItem(i, "name", e.target.value)}
                  placeholder="Name"
                  className="w-1/3 rounded-md border px-2 py-1 text-[11px]"
                  style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
                <input
                  type="text"
                  value={item.command}
                  onChange={(e) => updateChecklistItem(i, "command", e.target.value)}
                  placeholder="Command"
                  className="flex-1 rounded-md border px-2 py-1 font-mono text-[11px]"
                  style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
                <button onClick={() => removeChecklistItem(i)} className="text-[11px]" style={{ color: "var(--accent-red)" }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addChecklistItem}
            className="mt-2 rounded-md px-3 py-1.5 text-xs"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            + Add Item
          </button>
        </div>

        {/* Save */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={patchConfig.isPending}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
          >
            {patchConfig.isPending ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-[11px]" style={{ color: "var(--accent-green)" }}>Saved</span>}
          {patchConfig.isError && <span className="text-[11px]" style={{ color: "var(--accent-red)" }}>Error: {patchConfig.error.message}</span>}
        </div>
      </div>
    </div>
  );
}
