import { PageHeader } from "@/components/base/page-header";

const PROFILE_FIELDS = [
  { label: "Port", type: "number" as const, placeholder: "7700" },
  { label: "Host", type: "text" as const, placeholder: "127.0.0.1" },
  { label: "Log Level", type: "select" as const, options: ["debug", "info", "warn", "error"] },
  { label: "Auto-Recover", type: "toggle" as const },
  { label: "WebSocket Heartbeat Interval (s)", type: "number" as const, placeholder: "15" },
  { label: "State Flush Interval (s)", type: "number" as const, placeholder: "30" },
];

export function Component() {
  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: "Profile" }]} />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="mb-4 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            PROFILE CONFIGURATION
          </div>
          <div className="space-y-3">
            {PROFILE_FIELDS.map((item) => (
              <div key={item.label}>
                <label className="mb-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {item.label}
                </label>
                {item.type === "select" ? (
                  <select
                    disabled
                    className="w-full rounded-md border px-3 py-1.5 text-xs"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {item.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : item.type === "toggle" ? (
                  <div
                    className="inline-block rounded-md border px-3 py-1.5 text-xs"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border)",
                      color: "var(--text-dim)",
                    }}
                  >
                    false (read-only)
                  </div>
                ) : (
                  <input
                    type={item.type}
                    disabled
                    placeholder={item.placeholder}
                    className="w-full rounded-md border px-3 py-1.5 text-xs"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 text-[11px]" style={{ color: "var(--text-dim)" }}>
            Profile configuration is currently read-only at boot. A runtime profile config endpoint is planned.
          </div>
        </div>
      </div>
    </div>
  );
}
