import { useParams } from "react-router";
import { useCraft, useCraftBlackBox, useCraftIntercom, useCraftVectors } from "@/hooks/use-api";
import { useWsManager } from "@/hooks/ws-context";
import { useSubscription } from "@/hooks/use-subscription";
import { PageHeader } from "@/components/base/page-header";
import { StatusBadge } from "@/components/base/status-badge";
import { VectorProgress } from "@/components/base/vector-progress";
import { CrewMember } from "@/components/base/crew-member";
import { BlackBoxEntryRow } from "@/components/base/black-box-entry";
import { IntercomMessage } from "@/components/base/intercom-message";

export function Component() {
  const { name, callsign } = useParams<{ name: string; callsign: string }>();
  const wsManager = useWsManager();
  useSubscription(wsManager, `craft:${callsign}`);
  const { data: craft } = useCraft(name!, callsign!);
  const { data: blackBox } = useCraftBlackBox(name!, callsign!);
  const { data: intercom } = useCraftIntercom(name!, callsign!);
  const { data: vectors } = useCraftVectors(name!, callsign!);

  if (!craft) {
    return <div className="py-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>Loading...</div>;
  }

  const passedCount = craft.flightPlan.filter((v) => v.status === "Passed").length;

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "Projects", to: "/projects" },
          { label: name!, to: `/projects/${name}` },
          { label: "Crafts", to: `/projects/${name}` },
          { label: callsign! },
        ]}
      />
      <div className="mt-5 flex items-start justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{craft.callsign}</span>
            <StatusBadge status={craft.status} />
          </div>
          <div className="mt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>branch: {craft.branch} · category: {craft.category}</div>
          <div className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>{craft.cargo}</div>
        </div>
        <div className="text-right text-[11px]" style={{ color: "var(--text-dim)" }}>
          <div>Controls: <span style={{ color: "var(--accent-green)" }}>{craft.controls.mode.toUpperCase()}</span></div>
          {craft.controls.holder && <div className="mt-0.5">Holder: <span style={{ color: "var(--text-secondary)" }}>{craft.controls.holder}</span></div>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="mb-2.5 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>CREW</div>
          <div className="space-y-2">
            <CrewMember identifier={craft.captain} seat="captain" />
            {craft.firstOfficers.map((fo) => <CrewMember key={fo} identifier={fo} seat="firstOfficer" />)}
            {craft.jumpseaters.map((js) => <CrewMember key={js} identifier={js} seat="jumpseat" />)}
          </div>
        </div>
        <div className="rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="mb-2.5 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>FLIGHT PLAN</div>
          <VectorProgress vectors={craft.flightPlan} />
          <div className="mb-3 mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{passedCount} of {craft.flightPlan.length} vectors passed</div>
          <div className="space-y-1.5">
            {(vectors ?? craft.flightPlan).map((v) => (
              <div key={v.name} className="flex items-center justify-between rounded-md p-2" style={{ backgroundColor: "var(--bg-elevated)" }}>
                <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{v.name}</span>
                <StatusBadge status={v.status} variant="vector" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="mb-2.5 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>BLACK BOX</div>
        {(!blackBox || blackBox.length === 0) ? (
          <div className="py-4 text-center text-xs" style={{ color: "var(--text-dim)" }}>No black box entries.</div>
        ) : (
          [...blackBox].reverse().map((entry, i) => <BlackBoxEntryRow key={`${entry.timestamp}-${i}`} entry={entry} />)
        )}
      </div>
      <div className="mt-4 rounded-md border p-3.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="mb-2.5 text-[9px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>INTERCOM</div>
        {(!intercom || intercom.length === 0) ? (
          <div className="py-4 text-center text-xs" style={{ color: "var(--text-dim)" }}>No intercom messages.</div>
        ) : (
          <div className="space-y-2">
            {intercom.map((msg, i) => <IntercomMessage key={`${msg.timestamp}-${i}`} message={msg} />)}
          </div>
        )}
      </div>
    </div>
  );
}
