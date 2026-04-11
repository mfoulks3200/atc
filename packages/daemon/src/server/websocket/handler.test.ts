import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleWsMessage } from "./handler.js";
import type { WsClientMessage } from "../../types.js";
import { ChannelRegistry } from "./channels.js";
import { HeartbeatTracker } from "./heartbeat.js";
import { createGlobalConfigStore } from "../../config/global-store.js";

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

async function bootStore() {
  const atcDir = await mkdtemp(join(tmpdir(), "atc-ws-cfg-"));
  const channels = new ChannelRegistry();
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const store = createGlobalConfigStore(atcDir, channels.publish.bind(channels), logger);
  await store.load();
  return { atcDir, channels, store };
}

describe("handleWsMessage — config.* dispatch", () => {
  it("config.patch returns config.ack ok:true with merged config", async () => {
    const { atcDir, channels, store } = await bootStore();
    const sent: unknown[] = [];
    const send = (m: unknown) => sent.push(m);
    const heartbeat = new HeartbeatTracker(3);
    await handleWsMessage(
      {
        type: "config.patch",
        scope: "global",
        body: { defaultProfile: "staging" },
        requestId: "r1",
      },
      "c1",
      send as Parameters<typeof handleWsMessage>[2],
      channels,
      heartbeat,
      store,
    );
    expect(sent).toEqual([
      {
        type: "config.ack",
        requestId: "r1",
        ok: true,
        config: { defaultProfile: "staging" },
      },
    ]);
    await store.stop();
    await rm(atcDir, { recursive: true, force: true });
  });

  it("config.replace with invalid body returns config.ack ok:false", async () => {
    const { atcDir, channels, store } = await bootStore();
    const sent: unknown[] = [];
    const send = (m: unknown) => sent.push(m);
    const heartbeat = new HeartbeatTracker(3);
    await handleWsMessage(
      {
        type: "config.replace",
        scope: "global",
        body: { defaultProfile: 42 as unknown as string },
        requestId: "r2",
      },
      "c1",
      send as Parameters<typeof handleWsMessage>[2],
      channels,
      heartbeat,
      store,
    );
    expect(sent).toHaveLength(1);
    const ack = sent[0] as {
      type: string;
      ok: boolean;
      error: { code: string };
    };
    expect(ack.type).toBe("config.ack");
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe("INVALID_CONFIG");
    await store.stop();
    await rm(atcDir, { recursive: true, force: true });
  });

  it("config.unset on unknown key returns ok:false UNKNOWN_CONFIG_KEY", async () => {
    const { atcDir, channels, store } = await bootStore();
    const sent: unknown[] = [];
    const send = (m: unknown) => sent.push(m);
    const heartbeat = new HeartbeatTracker(3);
    await handleWsMessage(
      { type: "config.unset", scope: "global", key: "bogus", requestId: "r3" },
      "c1",
      send as Parameters<typeof handleWsMessage>[2],
      channels,
      heartbeat,
      store,
    );
    const ack = sent[0] as { ok: boolean; error: { code: string } };
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe("UNKNOWN_CONFIG_KEY");
    await store.stop();
    await rm(atcDir, { recursive: true, force: true });
  });

  it("publishes on config:global after a successful WS mutation", async () => {
    const { atcDir, channels, store } = await bootStore();
    const received: unknown[] = [];
    channels.subscribe("observer", "config:global", (data) => received.push(data));
    const heartbeat = new HeartbeatTracker(3);
    await handleWsMessage(
      {
        type: "config.patch",
        scope: "global",
        body: { defaultProfile: "dev" },
        requestId: "r4",
      },
      "c1",
      ((_m: unknown) => undefined) as Parameters<typeof handleWsMessage>[2],
      channels,
      heartbeat,
      store,
    );
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      config: { defaultProfile: "dev" },
      source: "api",
    });
    await store.stop();
    await rm(atcDir, { recursive: true, force: true });
  });
});
