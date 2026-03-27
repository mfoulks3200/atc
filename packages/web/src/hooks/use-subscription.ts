import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WsEvent } from "@/types/api.js";
import type { WebSocketManager } from "./use-websocket.js";

interface SetDataUpdate {
  strategy: "setData";
  keys: readonly (readonly string[])[];
  data: unknown;
}

interface InvalidateUpdate {
  strategy: "invalidate";
  keys: readonly (readonly string[])[];
}

type QueryUpdate = SetDataUpdate | InvalidateUpdate;

/**
 * Maps a WebSocket event to a TanStack Query cache update descriptor.
 *
 * Returns either a `setData` update (when the event payload contains a full
 * entity) or an `invalidate` update (when only partial data is available and
 * a refetch is needed).
 */
export function mapEventToQueryUpdate(event: WsEvent): QueryUpdate {
  const { channel, data } = event;
  const project = data.project as string | undefined;
  const callsign = data.callsign as string | undefined;

  // Craft events
  if (channel.startsWith("craft:") && project && callsign) {
    if (data.craft) {
      return {
        strategy: "setData",
        keys: [["crafts", project, callsign]],
        data: data.craft,
      };
    }
    return {
      strategy: "invalidate",
      keys: [
        ["crafts", project, callsign],
        ["crafts", project],
      ],
    };
  }

  // Agent events
  if (channel.startsWith("agent:")) {
    const agentId = data.agentId as string | undefined;
    if (agentId && data.agent) {
      return {
        strategy: "setData",
        keys: [["agents", agentId]],
        data: data.agent,
      };
    }
    if (agentId) {
      return {
        strategy: "invalidate",
        keys: [["agents", agentId], ["agents"]],
      };
    }
    return { strategy: "invalidate", keys: [["agents"]] };
  }

  // Tower events
  if (channel === "tower" || channel.startsWith("tower:")) {
    if (project) {
      return { strategy: "invalidate", keys: [["tower", project]] };
    }
    return { strategy: "invalidate", keys: [["tower"]] };
  }

  // Project events
  if (channel.startsWith("project:") && project) {
    return {
      strategy: "invalidate",
      keys: [["projects", project], ["projects"]],
    };
  }

  // Fallback
  return { strategy: "invalidate", keys: [] };
}

/**
 * React hook that subscribes to a WebSocket channel and bridges incoming
 * events to the TanStack Query cache — writing full entities directly when
 * available, or invalidating stale queries otherwise.
 *
 * @param wsManager - The WebSocketManager instance to listen on.
 * @param channel - The channel to subscribe to, or `null` to skip.
 */
export function useSubscription(wsManager: WebSocketManager, channel: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!channel) return;

    wsManager.subscribe(channel);

    const unsubscribe = wsManager.onEvent((event) => {
      if (channel !== "*" && event.channel !== channel) return;

      const update = mapEventToQueryUpdate(event);

      if (update.strategy === "setData") {
        for (const key of update.keys) {
          queryClient.setQueryData([...key], update.data);
        }
      } else {
        for (const key of update.keys) {
          queryClient.invalidateQueries({ queryKey: [...key] });
        }
      }
    });

    return () => {
      wsManager.unsubscribe(channel);
      unsubscribe();
    };
  }, [wsManager, channel, queryClient]);
}
