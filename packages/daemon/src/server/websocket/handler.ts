/**
 * WebSocket message handler — routes incoming client messages to the
 * appropriate subsystem: channel registry, heartbeat tracker, or
 * config stores (global, project, or pilot).
 */

import { ConfigValidationError, UnknownConfigKeyError } from "@airtrafficcontrol/errors";
import type { WsClientMessage, WsServerMessage } from "../../types.js";
import type { ChannelRegistry } from "./channels.js";
import type { HeartbeatTracker } from "./heartbeat.js";
import type { LayeredConfigStore } from "../../config/layered-store.js";
import type { GlobalConfig, ProjectMetadataConfig } from "../../config/schema.js";
import type { PilotConfigStore } from "../../config/pilot-config-store.js";

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
  projectConfigStores: Map<string, LayeredConfigStore<ProjectMetadataConfig>> = new Map(),
  pilotConfigStore: PilotConfigStore | null = null,
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
      await dispatchConfig(message, send, globalConfigStore, projectConfigStores, pilotConfigStore);
      return;
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

type ConfigMessage = Extract<
  WsClientMessage,
  { type: "config.patch" | "config.replace" | "config.unset" }
>;

function sendConfigError(
  send: (data: WsServerMessage) => void,
  requestId: string,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  send({
    type: "config.ack",
    requestId,
    ok: false,
    error: { code, message, ...extra },
  });
}

async function dispatchConfig(
  message: ConfigMessage,
  send: (data: WsServerMessage) => void,
  globalConfigStore: LayeredConfigStore<GlobalConfig> | null,
  projectConfigStores: Map<string, LayeredConfigStore<ProjectMetadataConfig>>,
  pilotConfigStore: PilotConfigStore | null,
): Promise<void> {
  const scope = (message as { scope: string }).scope;
  const requestId = message.requestId;

  if (scope === "global") {
    await dispatchGlobal(message as ConfigMessage & { scope: "global" }, send, globalConfigStore);
  } else if (scope === "project") {
    await dispatchProject(
      message as ConfigMessage & { scope: "project"; project: string },
      send,
      projectConfigStores,
    );
  } else if (scope === "pilot") {
    dispatchPilot(
      message as ConfigMessage & { scope: "pilot"; pilotId: string },
      send,
      pilotConfigStore,
    );
  } else {
    sendConfigError(send, requestId, "UNKNOWN_SCOPE", `Unknown config scope: ${scope}`);
  }
}

async function dispatchGlobal(
  message: ConfigMessage & { scope: "global" },
  send: (data: WsServerMessage) => void,
  globalConfigStore: LayeredConfigStore<GlobalConfig> | null,
): Promise<void> {
  const { requestId } = message;

  if (globalConfigStore === null) {
    sendConfigError(send, requestId, "UNAVAILABLE", "Global config store not available");
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
    handleConfigError(send, requestId, err);
  }
}

async function dispatchProject(
  message: ConfigMessage & { scope: "project"; project: string },
  send: (data: WsServerMessage) => void,
  projectConfigStores: Map<string, LayeredConfigStore<ProjectMetadataConfig>>,
): Promise<void> {
  const { requestId, project } = message;

  const store = projectConfigStores.get(project);
  if (store === undefined) {
    sendConfigError(send, requestId, "NOT_FOUND", `Project not found: ${project}`);
    return;
  }

  try {
    let merged: ProjectMetadataConfig;
    if (message.type === "config.patch") {
      merged = await store.patch(message.body as Partial<ProjectMetadataConfig>);
    } else if (message.type === "config.replace") {
      merged = await store.replace(message.body as ProjectMetadataConfig);
    } else {
      merged = await store.unset(message.key as keyof ProjectMetadataConfig & string);
    }
    send({
      type: "config.ack",
      requestId,
      ok: true,
      config: merged as unknown as Record<string, unknown>,
    });
  } catch (err) {
    handleConfigError(send, requestId, err);
  }
}

function dispatchPilot(
  message: ConfigMessage & { scope: "pilot"; pilotId: string },
  send: (data: WsServerMessage) => void,
  pilotConfigStore: PilotConfigStore | null,
): void {
  const { requestId, pilotId } = message;

  if (pilotConfigStore === null) {
    sendConfigError(send, requestId, "UNAVAILABLE", "Pilot config store not available");
    return;
  }

  try {
    let merged: Record<string, unknown>;
    if (message.type === "config.patch") {
      merged = pilotConfigStore.patch(
        pilotId,
        message.body as Parameters<PilotConfigStore["patch"]>[1],
      ) as unknown as Record<string, unknown>;
    } else if (message.type === "config.replace") {
      merged = pilotConfigStore.replace(
        pilotId,
        message.body as Parameters<PilotConfigStore["replace"]>[1],
      ) as unknown as Record<string, unknown>;
    } else {
      merged = pilotConfigStore.unset(
        pilotId,
        message.key as Parameters<PilotConfigStore["unset"]>[1],
      ) as unknown as Record<string, unknown>;
    }
    send({
      type: "config.ack",
      requestId,
      ok: true,
      config: merged,
    });
  } catch (err) {
    handleConfigError(send, requestId, err);
  }
}

function handleConfigError(
  send: (data: WsServerMessage) => void,
  requestId: string,
  err: unknown,
): void {
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
