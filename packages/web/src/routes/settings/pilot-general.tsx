import { PageHeader } from "@/components/base/page-header";
import { useParams } from "react-router";

export function Component() {
  const { id } = useParams<{ id: string }>();
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Settings", to: "/settings" }, { label: id! }, { label: "General" }]}
      />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Pilot settings coming soon.
          </div>
        </div>
      </div>
    </div>
  );
}
