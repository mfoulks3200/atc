import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  simulateOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe("WebSocketManager", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it("connects and sends subscribe messages", async () => {
    const { WebSocketManager } = await import("./use-websocket");
    const manager = new WebSocketManager("ws://localhost:3100/ws");
    manager.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    manager.subscribe("craft:fix-auth");
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: "subscribe",
      channel: "craft:fix-auth",
    });
  });

  it("responds to server pings with pongs", async () => {
    const { WebSocketManager } = await import("./use-websocket");
    const manager = new WebSocketManager("ws://localhost:3100/ws");
    manager.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ type: "ping" });

    expect(JSON.parse(ws.sent[0])).toEqual({ type: "pong" });
  });

  it("dispatches events to listeners", async () => {
    const { WebSocketManager } = await import("./use-websocket");
    const manager = new WebSocketManager("ws://localhost:3100/ws");
    manager.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const listener = vi.fn();
    manager.onEvent(listener);

    const event = {
      type: "event",
      channel: "craft:fix-auth",
      event: "craft.status.changed",
      timestamp: "2026-03-26T14:32:01.000Z",
      data: { status: "InFlight" },
    };
    ws.simulateMessage(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it("tracks connection status", async () => {
    const { WebSocketManager } = await import("./use-websocket");
    const manager = new WebSocketManager("ws://localhost:3100/ws");

    expect(manager.status).toBe("disconnected");

    manager.connect();
    expect(manager.status).toBe("connecting");

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    expect(manager.status).toBe("connected");

    manager.disconnect();
    expect(manager.status).toBe("disconnected");
  });
});
