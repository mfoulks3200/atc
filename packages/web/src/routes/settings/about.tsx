import { PageHeader } from "@/components/base/page-header";

export function Component() {
  const version = __ATC_VERSION__;
  const changelog = __ATC_CHANGELOG__;

  // Parse changelog into sections (split on ## headers)
  const sections = changelog
    .split(/^## /m)
    .filter(Boolean)
    .slice(0, 5)
    .map((section) => {
      const [title, ...body] = section.split("\n");
      return { title: title.trim(), body: body.join("\n").trim() };
    });

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: "About" }]} />
      <div className="mt-5 space-y-4">
        {/* Version */}
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="mb-2 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            VERSION
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--accent-green)" }}>
            {version}
          </div>
        </div>

        {/* Changelog */}
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            CHANGELOG
          </div>
          {sections.length === 0 ? (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              No changelog entries available.
            </div>
          ) : (
            <div className="space-y-3">
              {sections.map((section) => (
                <div key={section.title}>
                  <div className="mb-1 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                    {section.title}
                  </div>
                  <pre
                    className="whitespace-pre-wrap text-[11px] leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {section.body}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
