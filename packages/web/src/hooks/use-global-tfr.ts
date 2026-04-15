import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useWsManager } from "@/hooks/ws-context";
import type { TfrState } from "@/types/api";

const TFR_GLOBAL_CHANNEL = "tfr:global";
const KILL_SWITCH_REASON = "Sidebar kill switch";

export type GlobalTfrState = "loading" | "idle" | "active" | "unknown";

export interface UseGlobalTfrResult {
  /** Semantic state of the global hold. */
  state: GlobalTfrState;
  /** Identifiers of every currently-active global TFR. */
  activeIds: readonly string[];
  /** True while an issue or lift request is in flight. */
  pending: boolean;
  /** Most recent mutation or fetch error, or null. */
  error: Error | null;
  /** Issue a new global TFR with hardcoded kill-switch defaults. */
  issue: () => Promise<void>;
  /** Lift every currently-active global TFR in parallel. */
  lift: () => Promise<void>;
}

interface TfrGlobalWsEvent {
  type: "event";
  channel: string;
  event: string;
  timestamp: string;
  data: {
    tfr: TfrState;
  };
}

export function useGlobalTfr(): UseGlobalTfrResult {
  const wsManager = useWsManager();
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const query = useQuery<TfrState[]>({
    queryKey: ["tfrs", "active"],
    queryFn: () => apiClient.get<TfrState[]>("/api/v1/tfrs?active=true"),
  });

  // Sync activeIds from the initial fetch result (filtered to global scope).
  useEffect(() => {
    if (!query.data) return;
    const globalIds = query.data
      .filter((tfr) => tfr.scope === "global" && tfr.liftedAt === null)
      .map((tfr) => tfr.identifier);
    setActiveIds(globalIds);
  }, [query.data]);

  // Subscribe to tfr:global WebSocket channel.
  useEffect(() => {
    wsManager.subscribe(TFR_GLOBAL_CHANNEL);
    const unsub = wsManager.onEvent((event) => {
      const wsEvent = event as unknown as TfrGlobalWsEvent;
      if (wsEvent.channel !== TFR_GLOBAL_CHANNEL) return;
      const tfr = wsEvent.data?.tfr;
      if (!tfr || tfr.scope !== "global") return;

      if (wsEvent.event === "tfr.issued") {
        setActiveIds((ids) =>
          ids.includes(tfr.identifier) ? ids : [...ids, tfr.identifier],
        );
      } else if (wsEvent.event === "tfr.lifted") {
        setActiveIds((ids) => ids.filter((id) => id !== tfr.identifier));
      }
    });
    return () => {
      wsManager.unsubscribe(TFR_GLOBAL_CHANNEL);
      unsub();
    };
  }, [wsManager]);

  const issue = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const tfr = await apiClient.post<TfrState>("/api/v1/tfrs", {
        scope: "global",
        target: null,
        mode: "immediate",
        reason: KILL_SWITCH_REASON,
        issuedBy: "user",
      });
      setActiveIds((ids) =>
        ids.includes(tfr.identifier) ? ids : [...ids, tfr.identifier],
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setPending(false);
    }
  }, []);

  const lift = useCallback(async () => {
    if (activeIds.length === 0) return;
    setPending(true);
    setError(null);

    const results = await Promise.allSettled(
      activeIds.map((id) =>
        apiClient.post<TfrState>(`/api/v1/tfrs/${id}/lift`).then(() => id),
      ),
    );

    const lifted = new Set<string>();
    const failures: Error[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        lifted.add(result.value);
      } else {
        const reason = result.reason;
        failures.push(reason instanceof Error ? reason : new Error(String(reason)));
      }
    }

    setActiveIds((ids) => ids.filter((id) => !lifted.has(id)));
    setPending(false);

    if (failures.length > 0) {
      const message =
        failures.length === activeIds.length
          ? `Failed to lift ${failures.length} global TFRs: ${failures[0].message}`
          : `Failed to lift ${failures.length} of ${activeIds.length} global TFRs: ${failures[0].message}`;
      const e = new Error(message);
      setError(e);
      throw e;
    }
  }, [activeIds]);

  const state: GlobalTfrState = query.isLoading
    ? "loading"
    : query.isError
      ? "unknown"
      : activeIds.length > 0
        ? "active"
        : "idle";

  return {
    state,
    activeIds,
    pending,
    error,
    issue,
    lift,
  };
}
