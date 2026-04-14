import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { PageHeader } from "@/components/base/page-header";
import { usePilotConfig, usePatchPilotConfig } from "@/hooks/use-api";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";

const CERT_OPTIONS = ["captain", "first-officer", "jumpseat"];

export function Component() {
  const { id } = useParams<{ id: string }>();
  const wsManager = useWsManager();
  useSubscription(wsManager, `config:pilot:${id}`);
  const { data, isLoading } = usePilotConfig(id!);
  const patchConfig = usePatchPilotConfig(id!);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.config) {
      setCertifications(data.config.certifications);
    }
  }, [data]);

  const toggleCert = (cert: string) => {
    if (certifications.includes(cert)) {
      setCertifications(certifications.filter((c) => c !== cert));
    } else {
      setCertifications([...certifications, cert]);
    }
  };

  const handleSave = () => {
    patchConfig.mutate(
      { certifications },
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
        <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: id! }, { label: "General" }]} />
        <div className="mt-5 text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: id! }, { label: "General" }]} />
      <div className="mt-5">
        <div className="rounded-md border p-4" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            CERTIFICATIONS
          </div>
          <div className="flex gap-2">
            {CERT_OPTIONS.map((cert) => (
              <button
                key={cert}
                onClick={() => toggleCert(cert)}
                className="rounded-md px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: certifications.includes(cert) ? "rgba(0, 255, 136, 0.15)" : "var(--bg-elevated)",
                  color: certifications.includes(cert) ? "var(--accent-green)" : "var(--text-muted)",
                  border: certifications.includes(cert) ? "1px solid var(--accent-green)" : "1px solid var(--border)",
                }}
              >
                {cert}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
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
