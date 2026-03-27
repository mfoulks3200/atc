import { useParams } from "react-router";
import { useTowerQueue, useCrafts } from "@/hooks/use-api";
import { PageHeader } from "@/components/base/page-header";
import { QueueCard } from "@/components/base/queue-card";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const { data: queue } = useTowerQueue(name!);
  const { data: crafts } = useCrafts(name!);

  const craftMap = new Map(crafts?.map((c) => [c.callsign, c]) ?? []);

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
        {(!queue || queue.length === 0) ? (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            Queue is empty. No crafts awaiting clearance.
          </div>
        ) : (
          <div className="flex items-start gap-3">
            {queue.map((callsign, i) => {
              const craft = craftMap.get(callsign);
              if (!craft) return null;
              const isCleared = craft.status === "ClearedToLand";
              const label = isCleared ? "CLEARED" : "CHECKING";
              return (
                <div key={callsign} className="flex items-start gap-3">
                  {i > 0 && <div className="pt-10 text-xl" style={{ color: "var(--text-dim)" }}>→</div>}
                  <QueueCard position={i + 1} craft={craft} label={label} />
                </div>
              );
            })}
            <div className="flex items-start gap-3">
              <div className="pt-10 text-xl" style={{ color: "var(--text-dim)" }}>→</div>
              <div className="flex min-h-[120px] flex-[0.6] flex-col items-center justify-center rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <div className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>RUNWAY</div>
                <div className="mt-2 text-2xl" style={{ color: "var(--border)" }}>⊘</div>
                <div className="mt-1 text-[10px]" style={{ color: "var(--text-dim)" }}>main branch</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
