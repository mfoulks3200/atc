/**
 * WebSocket message handler — routes incoming client messages to the
 * appropriate subsystem: channel registry, heartbeat tracker, or
 * global config store.
 */

import { ConfigValidationError, UnknownConfigKeyError } from "@airtrafficcontrol/errors";
import type { WsClientMessage, WsServerMessage } from "../../types.js";
import type { ChannelRegistry } from "./channels.js";
import type { HeartbeatTracker } from "./heartbeat.js";
import type { LayeredConfigStore } from "../../config/layered-store.js";
import type { GlobalConfig } from "../../config/schema.js";

/**
 * Process a single incoming WebSocket message from a client.
 *
 * Dispatches on the message type. Config mutations are awaited; subscribe /
 * unsubscribe / ping / pong are synchronous.
 */
export async function handleWsMessage(
  message: WsClientMessage,
  clientId: string,
  send: (data: WsServerMessage) => void,
  channels: ChannelRegistry,
  heartbeat: HeartbeatTracker,
  globalConfigStore: LayeredConfigStore<GlobalConfig> | null = null,
): Promise<void> {
  switch (message.type) {
    case "subscribe":
      channels.subscribe(clientId, message.channel, send as (data: unknown) => void);
      return;
    case "unsubscribe":
      channels.unsubscribe(clientId, message.channel);
      return;
    case "pong":
      heartbeat.receivePong(clientId);
      return;
    case "ping":
      send({ type: "pong", timestamp: new Date().toISOString() });
      return;
    case "config.patch":
    case "config.replace":
    case "config.unset":
      await dispatchConfig(message, send, globalConfigStore);
      return;
  }
}

async function dispatchConfig(
  message: Extract<WsClientMessage, { type: "config.patch" | "config.replace" | "config.unset" }>,
  send: (data: WsServerMessage) => void,
  globalConfigStore: LayeredConfigStore<GlobalConfig> | null,
): Promise<void> {
  const { requestId } = message;

  if (message.scope !== "global") {
    send({
      type: "config.ack",
      requestId,
      ok: false,
      error: { code: "UNKNOWN_SCOPE", message: `Unknown config scope: ${String(message.scope)}` },
    });
    return;
  }

  if (globalConfigStore === null) {
    send({
      type: "config.ack",
      requestId,
      ok: false,
      error: { code: "UNAVAILABLE", message: "Global config store not available" },
    });
    return;
  }

  try {
    let merged: GlobalConfig;
    if (message.type === "config.patch") {
      merged = await globalConfigStore.patch(message.body as Partial<GlobalConfig>);
    } else if (message.type === "config.replace") {
      merged = await globalConfigStore.replace(message.body as GlobalConfig);
    } else {
      merged = await globalConfigStore.unset(message.key as keyof GlobalConfig & string);
    }
    send({
      type: "config.ack",
      requestId,
      ok: true,
      config: merged as unknown as Record<string, unknown>,
    });
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      send({
        type: "config.ack",
        requestId,
        ok: false,
        error: {
          code: "INVALID_CONFIG",
          message: err.message,
          issues: err.issues as unknown[],
        },
      });
      return;
    }
    if (err instanceof UnknownConfigKeyError) {
      send({
        type: "config.ack",
        requestId,
        ok: false,
        error: { code: "UNKNOWN_CONFIG_KEY", message: err.message },
      });
      return;
    }
    send({
      type: "config.ack",
      requestId,
      ok: false,
      error: { code: "INTERNAL", message: (err as Error).message },
    });
  }
}
