import { useState, useEffect } from "react";
import { PageHeader } from "@/components/base/page-header";
import { useGlobalConfig, usePatchGlobalConfig } from "@/hooks/use-api";

export function Component() {
  const { data, isLoading } = useGlobalConfig();
  const patchConfig = usePatchGlobalConfig();
  const [defaultProfile, setDefaultProfile] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.config) {
      setDefaultProfile(data.config.defaultProfile);
    }
  }, [data]);

  const handleSave = () => {
    patchConfig.mutate(
      { defaultProfile },
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
        <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: "General" }]} />
        <div className="mt-5 text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: "General" }]} />
      <div className="mt-5">
        <div
          className="rounded-md border p-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="mb-4 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            GLOBAL CONFIGURATION
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>
              Default Profile
            </label>
            <input
              type="text"
              value={defaultProfile}
              onChange={(e) => setDefaultProfile(e.target.value)}
              className="w-full rounded-md border px-3 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={patchConfig.isPending}
              className="rounded-md px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: "var(--accent-green)", color: "var(--bg-base)" }}
            >
              {patchConfig.isPending ? "Saving..." : "Save"}
            </button>
            {saved && (
              <span className="text-[11px]" style={{ color: "var(--accent-green)" }}>Saved</span>
            )}
            {patchConfig.isError && (
              <span className="text-[11px]" style={{ color: "var(--accent-red)" }}>
                Error: {patchConfig.error.message}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
