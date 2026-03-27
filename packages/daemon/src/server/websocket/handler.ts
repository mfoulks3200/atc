/**
 * WebSocket message handler — routes incoming client messages to the
 * appropriate subsystem (channel registry or heartbeat tracker).
 *
 * This is the single entry point for all inbound WebSocket frames. It
 * dispatches on the message type and delegates to the relevant module,
 * keeping the concerns of pub/sub routing and heartbeat tracking
 * cleanly separated.
 */

import type { WsClientMessage, WsServerMessage } from "../../types.js";
import type { ChannelRegistry } from "./channels.js";
import type { HeartbeatTracker } from "./heartbeat.js";

/**
 * Process a single incoming WebSocket message from a client.
 *
 * Handles all four message types in the {@link WsClientMessage} union:
 * - `"subscribe"` — registers the client for a channel pattern.
 * - `"unsubscribe"` — removes a channel registration.
 * - `"pong"` — acknowledges a server-initiated ping, resetting the missed count.
 * - `"ping"` — client-initiated keepalive; replied to immediately with a pong.
 *
 * @param message   - The parsed inbound message from the client.
 * @param clientId  - Unique identifier for the sending WebSocket client.
 * @param send      - Function that serializes and delivers a message back to the client.
 * @param channels  - The channel registry managing pub/sub subscriptions.
 * @param heartbeat - The heartbeat tracker monitoring client liveness.
 */
export function handleWsMessage(
  message: WsClientMessage,
  clientId: string,
  send: (data: WsServerMessage) => void,
  channels: ChannelRegistry,
  heartbeat: HeartbeatTracker,
): void {
  switch (message.type) {
    case "subscribe":
      channels.subscribe(clientId, message.channel, send as (data: unknown) => void);
      break;
    case "unsubscribe":
      channels.unsubscribe(clientId, message.channel);
      break;
    case "pong":
      heartbeat.receivePong(clientId);
      break;
    case "ping":
      send({ type: "pong", timestamp: new Date().toISOString() });
      break;
  }
}
