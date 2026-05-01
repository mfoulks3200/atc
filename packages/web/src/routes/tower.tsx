import { useState } from "react";
import { useParams } from "react-router";
import { useTowerQueue, useCrafts, useGrantMerge, useDenyClearance } from "@/hooks/use-api";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import { PageHeader } from "@/components/base/page-header";
import { QueueCard } from "@/components/base/queue-card";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const wsManager = useWsManager();
  useSubscription(wsManager, `tower:${name}`);
  const { data: queue } = useTowerQueue(name!);
  const { data: crafts } = useCrafts(name!);
  const grantMerge = useGrantMerge(name!);
  const denyClearance = useDenyClearance(name!);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const craftMap = new Map(crafts?.map((c) => [c.callsign, c]) ?? []);

  function setError(callsign: string, message: string | null) {
    setErrors((prev) => ({ ...prev, [callsign]: message }));
  }

  async function handleMerge(callsign: string) {
    setError(callsign, null);
    try {
      await grantMerge.mutateAsync({ callsign });
    } catch (err) {
      setError(callsign, err instanceof Error ? err.message : "Merge failed");
    }
  }

  async function handleDeny(callsign: string) {
    setError(callsign, null);
    try {
      await denyClearance.mutateAsync(callsign);
    } catch (err) {
      setError(callsign, err instanceof Error ? err.message : "Deny failed");
    }
  }

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "Projects", to: "/projects" },
          { label: name!, to: `/projects/${name}` },
          { label: "Tower Queue" },
        ]}
      />
      <div className="mt-5">
        <div className="mb-3 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          MERGE QUEUE — {name?.toUpperCase()}
        </div>
        <div className="flex items-start gap-3">
          {(!queue || queue.length === 0) ? (
            <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
              Queue is empty. No crafts awaiting clearance.
            </div>
          ) : (
            queue.map((entry, i) => {
              const craft = craftMap.get(entry.callsign);
              if (!craft) return null;
              const isCleared = craft.status === "ClearedToLand";
              const label = isCleared ? "CLEARED" : "CHECKING";
              const isMergePending =
                grantMerge.isPending && grantMerge.variables?.callsign === entry.callsign;
              const isDenyPending =
                denyClearance.isPending && denyClearance.variables === entry.callsign;
              return (
                <div key={entry.callsign} className="flex items-start gap-3">
                  {i > 0 && <div className="pt-10 text-xl" style={{ color: "var(--text-dim)" }}>→</div>}
                  <QueueCard
                    position={i + 1}
                    craft={craft}
                    label={label}
                    onMerge={() => handleMerge(entry.callsign)}
                    onDeny={() => handleDeny(entry.callsign)}
                    mergeIsPending={isMergePending}
                    denyIsPending={isDenyPending}
                    errorMessage={errors[entry.callsign]}
                  />
                </div>
              );
            })
          )}
          <div className="flex items-start gap-3">
            {queue && queue.length > 0 && (
              <div className="pt-10 text-xl" style={{ color: "var(--text-dim)" }}>→</div>
            )}
            <div className="flex min-h-[120px] flex-[0.6] flex-col items-center justify-center rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>RUNWAY</div>
              <div className="mt-2 text-2xl" style={{ color: "var(--border)" }}>⊘</div>
              <div className="mt-1 text-[10px]" style={{ color: "var(--text-dim)" }}>main branch</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
