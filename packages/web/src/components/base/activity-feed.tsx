import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWsManager } from "@/hooks/ws-context";
import type { BlackBoxEntry, BlackBoxEntryType, WsEvent } from "@/types/api";
import { HistoricalKeyIndicator } from "./historical-key-indicator.js";

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
  KeyRotated: { label: "KEY ROTATED", color: "var(--accent-yellow)", kind: "lifecycle" },
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

// All defined BlackBoxEntry keys in display order (trace context last).
const ENTRY_FIELD_ORDER: (keyof BlackBoxEntry)[] = [
  "timestamp",
  "type",
  "author",
  "content",
  "signature",
  "traceId",
  "spanId",
  "parentSpanId",
];

interface SignatureCellProps {
  value: string;
}

function SignatureCell({ value }: SignatureCellProps) {
  const [copied, setCopied] = useState(false);
  const preview = value.length > 20 ? `${value.slice(0, 20)}…` : value;

  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{preview}</span>
      <button
        type="button"
        onClick={copy}
        className="rounded px-1.5 py-px text-[9px] uppercase tracking-wider transition-colors"
        style={{
          color: copied ? "var(--accent-green)" : "var(--text-dim)",
          backgroundColor: copied
            ? "color-mix(in srgb, var(--accent-green) 12%, transparent)"
            : "color-mix(in srgb, var(--text-dim) 12%, transparent)",
          border: `1px solid ${copied ? "color-mix(in srgb, var(--accent-green) 30%, transparent)" : "color-mix(in srgb, var(--text-dim) 30%, transparent)"}`,
        }}
        aria-label="Copy full signature"
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}

interface EntryInspectorProps {
  entry: BlackBoxEntry;
  regionRef: React.RefObject<HTMLDivElement | null>;
  expanded: boolean;
}

function EntryInspector({ entry, regionRef, expanded }: EntryInspectorProps) {
  return (
    <div
      style={{
        maxHeight: expanded ? "600px" : "0",
        overflow: "hidden",
        transition: "max-height 0.22s ease",
      }}
      aria-hidden={!expanded}
    >
      {expanded && (
        <div
          ref={regionRef}
          role="region"
          tabIndex={0}
          aria-label={`Details for ${entry.type} entry`}
          className="mx-2 mb-1 mt-0.5 rounded border p-2 outline-none focus-visible:ring-1"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--bg-base)",
            // @ts-expect-error CSS custom property
            "--tw-ring-color": "var(--accent-blue)",
          }}
        >
          <table className="w-full border-collapse">
            <tbody>
              {ENTRY_FIELD_ORDER.map((key) => {
                const value = entry[key];
                if (value === undefined || value === null) return null;
                return (
                  <tr key={key}>
                    <td
                      className="w-28 shrink-0 py-0.5 pr-3 align-top font-mono text-[10px]"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {key}
                    </td>
                    <td
                      className="break-all py-0.5 align-top font-mono text-[10px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {key === "signature" ? (
                        <SignatureCell value={String(value)} />
                      ) : (
                        String(value)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface ActivityFeedProps {
  callsign: string;
  initial: BlackBoxEntry[];
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
 * Each entry row is clickable to expand a full key-value inspector panel.
 */
export function ActivityFeed({ callsign, initial }: ActivityFeedProps) {
  const wsManager = useWsManager();
  const [liveEntries, setLiveEntries] = useState<BlackBoxEntry[]>([]);
  const [tail, setTail] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      const key = `${e.timestamp}|${e.type}|${e.author}|${e.content}`;
      if (seen.has(key)) return;
      seen.add(key);
      combined.push(e);
    };
    for (const e of initial) push(e);
    for (const e of liveEntries) push(e);
    combined.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return combined;
  }, [initial, liveEntries]);

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
                <ActivityEntry key={entryKey(entry, i)} entry={entry} />
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
  );
}

interface ActivityEntryProps {
  entry: BlackBoxEntry;
}

function ActivityEntry({ entry }: ActivityEntryProps) {
  const style = ENTRY_STYLES[entry.type] ?? FALLBACK_STYLE;
  const isOutput = style.kind === "output";
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => regionRef.current?.focus(), 30);
      } else {
        triggerRef.current?.focus();
      }
      return next;
    });
  }, []);

  if (isOutput) {
    return (
      <li>
        <div className="flex items-start border-l" style={{ borderColor: "color-mix(in srgb, var(--text-dim) 30%, transparent)" }}>
          <button
            ref={triggerRef}
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 gap-2 py-0.5 pl-2 pr-1 text-left font-mono text-[10.5px] leading-snug transition-colors"
            style={{
              color: "var(--text-muted)",
              backgroundColor: expanded
                ? "color-mix(in srgb, var(--bg-elevated) 40%, transparent)"
                : "transparent",
            }}
          >
            <span className="shrink-0 tabular-nums" style={{ color: "var(--text-dim)" }}>
              {formatTime(entry.timestamp)}
            </span>
            <span className="shrink-0" style={{ color: "var(--text-dim)" }}>
              {entry.author}
            </span>
            <span className="whitespace-pre-wrap break-words">{entry.content}</span>
            <span
              className="ml-auto shrink-0 self-start pl-2 text-[8px] opacity-40"
              style={{ color: "var(--text-dim)" }}
              aria-hidden="true"
            >
              {expanded ? "▲" : "▼"}
            </span>
          </button>
          {entry.historicalKey && (
            <span className="shrink-0 self-center pr-1">
              <HistoricalKeyIndicator
                author={entry.author}
                keyCreatedAt={entry.historicalKey.createdAt}
                keyRotatedAt={entry.historicalKey.rotatedAt}
              />
            </span>
          )}
        </div>
        <EntryInspector entry={entry} regionRef={regionRef} expanded={expanded} />
      </li>
    );
  }

  return (
    <li>
      <div
        className="flex items-start rounded-sm"
        style={{
          backgroundColor: expanded
            ? "color-mix(in srgb, var(--bg-elevated) 90%, transparent)"
            : "color-mix(in srgb, var(--bg-elevated) 60%, transparent)",
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-2 py-1 pl-2 pr-1 text-left text-[11px] leading-snug transition-colors"
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
          <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
            {entry.author}
          </span>
          <span
            className="min-w-0 flex-1 whitespace-pre-wrap break-words"
            style={{ color: "var(--text-secondary)" }}
          >
            {entry.content}
          </span>
          <span
            className="shrink-0 self-start pl-1 pt-px text-[8px] opacity-40"
            style={{ color: "var(--text-dim)" }}
            aria-hidden="true"
          >
            {expanded ? "▲" : "▼"}
          </span>
        </button>
        {entry.historicalKey && (
          <span className="shrink-0 self-center pr-1">
            <HistoricalKeyIndicator
              author={entry.author}
              keyCreatedAt={entry.historicalKey.createdAt}
              keyRotatedAt={entry.historicalKey.rotatedAt}
            />
          </span>
        )}
      </div>
      <EntryInspector entry={entry} regionRef={regionRef} expanded={expanded} />
    </li>
  );
}
