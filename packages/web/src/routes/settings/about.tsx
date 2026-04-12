import { PageHeader } from "@/components/base/page-header";

export function Component() {
  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: "About" }]} />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            About page will be implemented in the next task.
          </div>
        </div>
      </div>
    </div>
  );
}
