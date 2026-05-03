import { useEffect, useMemo, useRef, useState } from "react";
import { useWsManager } from "@/hooks/ws-context";
import type {
  BlackBoxEntry,
  BlackBoxEntryType,
  BlackBoxVerifyResponse,
  PilotRecord,
  VerificationState,
  WsEvent,
} from "@/types/api";
import { VerificationDetailModal } from "./verification-detail-modal.js";

interface EntryStyle {
  label: string;
  color: string;
  kind: "lifecycle" | "output" | "merge" | "emergency" | "checklist" | "tfr";
}

const ENTRY_STYLES: Record<BlackBoxEntryType, EntryStyle> = {
  CraftCreated: { label: "CREATED", color: "var(--accent-blue)", kind: "lifecycle" },
  Launched: { label: "LAUNCHED", color: "var(--accent-green)", kind: "lifecycle" },
  StateTransition: { label: "TRANSITION", color: "var(--accent-blue)", kind: "lifecycle" },
  Decision: { label: "DECISION", color: "var(--accent-blue)", kind: "lifecycle" },
  Observation: { label: "OBS", color: "var(--text-muted)", kind: "lifecycle" },
  Conflict: { label: "CONFLICT", color: "var(--accent-red)", kind: "lifecycle" },
  VectorPassed: { label: "VECTOR PASS", color: "var(--accent-green)", kind: "lifecycle" },
  VectorFailed: { label: "VECTOR FAIL", color: "var(--accent-red)", kind: "lifecycle" },
  GoAround: { label: "GO-AROUND", color: "var(--accent-yellow)", kind: "lifecycle" },
  ChecklistRun: { label: "CHECKLIST", color: "var(--accent-yellow)", kind: "checklist" },
  ChecklistItem: { label: "CHECK ITEM", color: "var(--accent-yellow)", kind: "checklist" },
  ClearanceRequested: { label: "CLEARANCE", color: "var(--accent-blue)", kind: "lifecycle" },
  TowerEnqueued: { label: "TOWER IN", color: "var(--accent-blue)", kind: "lifecycle" },
  TowerDequeued: { label: "TOWER OUT", color: "var(--accent-blue)", kind: "lifecycle" },
  Merge: { label: "MERGE", color: "var(--accent-green)", kind: "merge" },
  MergeStale: { label: "STALE", color: "var(--accent-yellow)", kind: "merge" },
  MergeConflict: { label: "CONFLICT", color: "var(--accent-red)", kind: "merge" },
  EmergencyDeclaration: { label: "EMERGENCY", color: "var(--accent-red)", kind: "emergency" },
  TFRIssued: { label: "TFR", color: "var(--accent-yellow)", kind: "tfr" },
  TFRLifted: { label: "TFR LIFT", color: "var(--text-muted)", kind: "tfr" },
  AgentOutput: { label: "OUT", color: "var(--text-dim)", kind: "output" },
};

const FALLBACK_STYLE: EntryStyle = {
  label: "EVENT",
  color: "var(--text-muted)",
  kind: "lifecycle",
};

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

function entryKey(e: BlackBoxEntry, i: number): string {
  return `${e.timestamp}-${e.type}-${e.author}-${i}`;
}

/** Dedup key matching the dedup logic in the feed combiner. */
function entryDedupeKey(e: BlackBoxEntry): string {
  return `${e.timestamp}|${e.type}|${e.author}|${e.content}`;
}

// ---------------------------------------------------------------------------
// Integrity bar
// ---------------------------------------------------------------------------

interface IntegrityBarProps {
  verifyData: BlackBoxVerifyResponse;
  pilots: PilotRecord[];
  onOpen: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

function IntegrityBar({ verifyData, pilots, onOpen, triggerRef }: IntegrityBarProps) {
  const { tampered, unresolvable } = verifyData;

  const keyedPilots = new Set(
    pilots.filter((p) => p.publicKey != null).map((p) => p.identifier),
  );
  const unsignedKeyed = verifyData.entries.filter(
    (e) => e.verificationState === "unsigned" && keyedPilots.has(e.author),
  ).length;

  let label: string;
  let color: string;

  if (tampered > 0 && unresolvable > 0) {
    label = `✗ Mismatch on ${tampered} ${tampered === 1 ? "entry" : "entries"}, ${unresolvable} unresolvable`;
    color = "var(--accent-red)";
  } else if (tampered > 0) {
    label = `✗ Mismatch on ${tampered} ${tampered === 1 ? "entry" : "entries"}`;
    color = "var(--accent-red)";
  } else if (unresolvable > 0) {
    label = `⚠ ${unresolvable} unresolvable ${unresolvable === 1 ? "author" : "authors"}`;
    color = "var(--accent-yellow)";
  } else if (unsignedKeyed > 0) {
    label = `⚠ ${unsignedKeyed} unsigned from keyed ${unsignedKeyed === 1 ? "pilot" : "pilots"}`;
    color = "var(--accent-yellow)";
  } else if (verifyData.verified > 0 && verifyData.unsigned === 0) {
    label = "✓ All verified";
    color = "var(--accent-green)";
  } else {
    // All unsigned from keyless pilots — no indicator per spec
    return null;
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={onOpen}
      data-testid="integrity-bar"
      className="rounded-sm border px-2 py-0.5 text-[9px] uppercase tracking-wider transition-colors"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ActivityFeedProps {
  callsign: string;
  initial: BlackBoxEntry[];
  /** When provided, shows the integrity bar and per-entry verification indicators. */
  verifyData?: BlackBoxVerifyResponse;
  /** Pilot list for cross-referencing unsigned entries against the key registry. */
  pilots?: PilotRecord[];
}

/**
 * Live activity feed for a craft. Seeds from the initial black box list,
 * then merges real-time `craft.blackbox.appended` events off the
 * `craft:<callsign>` WebSocket channel.
 *
 * Supports a follow-tail toggle: when enabled the scroll container pins to
 * the latest entry. If the user scrolls up, tail is paused automatically and
 * a "jump to latest" affordance appears.
 *
 * When `verifyData` is provided, shows an integrity bar summarising
 * cryptographic verification state and a Verification Detail modal on click.
 */
export function ActivityFeed({ callsign, initial, verifyData, pilots = [] }: ActivityFeedProps) {
  const wsManager = useWsManager();
  const [liveEntries, setLiveEntries] = useState<BlackBoxEntry[]>([]);
  const [tail, setTail] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const integrityBarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setLiveEntries([]);
  }, [callsign]);

  useEffect(() => {
    const unsubscribe = wsManager.onEvent((event: WsEvent) => {
      if (event.channel !== `craft:${callsign}`) return;
      if (event.event !== "craft.blackbox.appended") return;
      const entry = event.data?.entry as BlackBoxEntry | undefined;
      if (!entry) return;
      setLiveEntries((prev) => [...prev, entry]);
    });
    return unsubscribe;
  }, [wsManager, callsign]);

  const entries = useMemo(() => {
    const seen = new Set<string>();
    const combined: BlackBoxEntry[] = [];
    const push = (e: BlackBoxEntry) => {
      const key = entryDedupeKey(e);
      if (seen.has(key)) return;
      seen.add(key);
      combined.push(e);
    };
    for (const e of initial) push(e);
    for (const e of liveEntries) push(e);
    combined.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return combined;
  }, [initial, liveEntries]);

  // Build a lookup from dedup key → verification state
  const verificationMap = useMemo<Map<string, VerificationState>>(() => {
    if (!verifyData) return new Map();
    const map = new Map<string, VerificationState>();
    for (const e of verifyData.entries) {
      map.set(entryDedupeKey(e), e.verificationState);
    }
    return map;
  }, [verifyData]);

  useEffect(() => {
    if (!tail) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, tail]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom <= 40;
    setTail(nearBottom);
  }

  function jumpToLatest() {
    setTail(true);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  return (
    <>
      <div
        className="rounded-md border"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-between border-b px-3.5 py-2"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <span
              className="text-[9px] uppercase tracking-widest"
              style={{ color: "var(--text-dim)" }}
            >
              ACTIVITY
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </span>
            {verifyData && (
              <IntegrityBar
                verifyData={verifyData}
                pilots={pilots}
                onOpen={() => setModalOpen(true)}
                triggerRef={integrityBarRef}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (tail ? setTail(false) : jumpToLatest())}
              className="rounded-sm border px-2 py-0.5 text-[9px] uppercase tracking-wider transition-colors"
              style={{
                color: tail ? "var(--accent-green)" : "var(--text-muted)",
                borderColor: tail
                  ? "color-mix(in srgb, var(--accent-green) 35%, transparent)"
                  : "var(--border)",
                backgroundColor: tail
                  ? "color-mix(in srgb, var(--accent-green) 10%, transparent)"
                  : "transparent",
              }}
              aria-pressed={tail}
            >
              {tail ? "● Tailing" : "Tail paused"}
            </button>
          </div>
        </div>
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-[28rem] overflow-auto px-3.5 py-2"
          >
            {entries.length === 0 ? (
              <div
                className="py-8 text-center text-xs"
                style={{ color: "var(--text-dim)" }}
              >
                No activity yet. Lifecycle events and agent output will stream here.
              </div>
            ) : (
              <ol className="space-y-0.5">
                {entries.map((entry, i) => (
                  <ActivityEntry
                    key={entryKey(entry, i)}
                    entry={entry}
                    verificationState={verificationMap.get(entryDedupeKey(entry))}
                  />
                ))}
              </ol>
            )}
          </div>
          {!tail && entries.length > 0 && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider shadow-lg"
              style={{
                color: "var(--accent-green)",
                backgroundColor: "var(--bg-elevated)",
                borderColor: "color-mix(in srgb, var(--accent-green) 35%, transparent)",
              }}
            >
              ↓ Jump to latest
            </button>
          )}
        </div>
      </div>

      {modalOpen && verifyData && (
        <VerificationDetailModal
          entries={verifyData.entries}
          pilots={pilots}
          onClose={() => setModalOpen(false)}
          triggerRef={integrityBarRef}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Entry component
// ---------------------------------------------------------------------------

interface ActivityEntryProps {
  entry: BlackBoxEntry;
  verificationState?: VerificationState;
}

function VerificationIcon({ state, author }: { state: VerificationState; author: string }) {
  if (state === "signed-valid") {
    return (
      <span
        role="img"
        aria-label="Signature verified"
        className="shrink-0 text-[10px]"
        style={{ color: "var(--accent-green)" }}
      >
        🔒
      </span>
    );
  }
  if (state === "signed-invalid") {
    return (
      <span
        role="img"
        aria-label="Signature mismatch — this entry may have been tampered with"
        className="shrink-0 text-[10px]"
        style={{ color: "var(--accent-red)" }}
      >
        ✗
      </span>
    );
  }
  if (state === "author-not-found") {
    return (
      <span
        role="img"
        aria-label={`Author unresolvable — pilot record for '${author}' could not be resolved`}
        title={`Author not found — no pilot record for '${author}'. Signature cannot be verified.`}
        className="shrink-0 cursor-help text-[10px]"
        style={{ color: "var(--accent-yellow)" }}
      >
        ?⃝
      </span>
    );
  }
  // unsigned — no indicator
  return null;
}

function ActivityEntry({ entry, verificationState }: ActivityEntryProps) {
  const style = ENTRY_STYLES[entry.type] ?? FALLBACK_STYLE;
  const isOutput = style.kind === "output";

  if (isOutput) {
    return (
      <li
        className="flex gap-2 border-l py-0.5 pl-2 pr-1 font-mono text-[10.5px] leading-snug"
        style={{
          borderColor: "color-mix(in srgb, var(--text-dim) 30%, transparent)",
          color: "var(--text-muted)",
        }}
      >
        <span className="shrink-0 tabular-nums" style={{ color: "var(--text-dim)" }}>
          {formatTime(entry.timestamp)}
        </span>
        <span className="shrink-0" style={{ color: "var(--text-dim)" }}>
          {entry.author}
        </span>
        {verificationState && (
          <VerificationIcon state={verificationState} author={entry.author} />
        )}
        <span className="whitespace-pre-wrap break-words">{entry.content}</span>
      </li>
    );
  }

  return (
    <li
      className="flex items-start gap-2 rounded-sm py-1 pl-2 pr-1 text-[11px] leading-snug"
      style={{
        backgroundColor: "color-mix(in srgb, var(--bg-elevated) 60%, transparent)",
      }}
    >
      <span
        className="shrink-0 tabular-nums pt-px"
        style={{ color: "var(--text-dim)" }}
      >
        {formatTime(entry.timestamp)}
      </span>
      <span
        className="shrink-0 rounded-sm px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider"
        style={{
          color: style.color,
          backgroundColor: `color-mix(in srgb, ${style.color} 15%, transparent)`,
        }}
      >
        {style.label}
      </span>
      <span className="shrink-0 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        {entry.author}
        {verificationState && (
          <VerificationIcon state={verificationState} author={entry.author} />
        )}
      </span>
      <span
        className="min-w-0 flex-1 whitespace-pre-wrap break-words"
        style={{ color: "var(--text-secondary)" }}
      >
        {entry.content}
      </span>
    </li>
  );
}
