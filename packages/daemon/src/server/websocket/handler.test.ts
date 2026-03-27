import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleWsMessage } from "./handler.js";
import type { WsClientMessage, WsServerMessage } from "../../types.js";
import type { ChannelRegistry } from "./channels.js";
import type { HeartbeatTracker } from "./heartbeat.js";

describe("handleWsMessage", () => {
  let send: ReturnType<typeof vi.fn>;
  let channels: { subscribe: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn> };
  let heartbeat: { receivePong: ReturnType<typeof vi.fn> };
  const CLIENT_ID = "client-abc";

  beforeEach(() => {
    send = vi.fn();
    channels = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    heartbeat = {
      receivePong: vi.fn(),
    };
  });

  it("subscribe: adds subscription to channels", () => {
    const message: WsClientMessage = { type: "subscribe", channel: "craft:alpha" };

    handleWsMessage(
      message,
      CLIENT_ID,
      send,
      channels as unknown as ChannelRegistry,
      heartbeat as unknown as HeartbeatTracker,
    );

    expect(channels.subscribe).toHaveBeenCalledOnce();
    expect(channels.subscribe).toHaveBeenCalledWith(CLIENT_ID, "craft:alpha", send);
    expect(channels.unsubscribe).not.toHaveBeenCalled();
    expect(heartbeat.receivePong).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("unsubscribe: removes subscription from channels", () => {
    const message: WsClientMessage = { type: "unsubscribe", channel: "craft:alpha" };

    handleWsMessage(
      message,
      CLIENT_ID,
      send,
      channels as unknown as ChannelRegistry,
      heartbeat as unknown as HeartbeatTracker,
    );

    expect(channels.unsubscribe).toHaveBeenCalledOnce();
    expect(channels.unsubscribe).toHaveBeenCalledWith(CLIENT_ID, "craft:alpha");
    expect(channels.subscribe).not.toHaveBeenCalled();
    expect(heartbeat.receivePong).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("pong: resets heartbeat missed count for the client", () => {
    const message: WsClientMessage = { type: "pong" };

    handleWsMessage(
      message,
      CLIENT_ID,
      send,
      channels as unknown as ChannelRegistry,
      heartbeat as unknown as HeartbeatTracker,
    );

    expect(heartbeat.receivePong).toHaveBeenCalledOnce();
    expect(heartbeat.receivePong).toHaveBeenCalledWith(CLIENT_ID);
    expect(channels.subscribe).not.toHaveBeenCalled();
    expect(channels.unsubscribe).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("ping: replies immediately with a pong message containing a timestamp", () => {
    const before = new Date().toISOString();
    const message: WsClientMessage = { type: "ping" };

    handleWsMessage(
      message,
      CLIENT_ID,
      send,
      channels as unknown as ChannelRegistry,
      heartbeat as unknown as HeartbeatTracker,
    );

    const after = new Date().toISOString();

    expect(send).toHaveBeenCalledOnce();
    const reply = send.mock.calls[0][0] as { type: string; timestamp: string };
    expect(reply.type).toBe("pong");
    expect(reply.timestamp >= before).toBe(true);
    expect(reply.timestamp <= after).toBe(true);

    expect(channels.subscribe).not.toHaveBeenCalled();
    expect(channels.unsubscribe).not.toHaveBeenCalled();
    expect(heartbeat.receivePong).not.toHaveBeenCalled();
  });
});
