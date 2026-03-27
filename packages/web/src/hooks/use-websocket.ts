import { useEffect, useRef, useSyncExternalStore } from "react";
import type { WsClientMessage, WsServerMessage, WsEvent } from "@/types/api";

/** Connection status for the WebSocket manager. */
export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "reconnecting";

type EventListener = (event: WsEvent) => void;
type StatusListener = (status: ConnectionStatus) => void;

/**
 * Manages a WebSocket connection with auto-reconnect, subscription tracking,
 * and event dispatch.
 */
export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private eventListeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();
  private subscriptions = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private _status: ConnectionStatus = "disconnected";

  constructor(url: string) {
    this.url = url;
  }

  /** Current connection status. */
  get status(): ConnectionStatus {
    return this._status;
  }

  /** Open the WebSocket connection. No-op if already connected or connecting. */
  connect(): void {
    if (this.ws) return;
    this.setStatus(this._status === "disconnected" ? "connecting" : "reconnecting");

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.setStatus("connected");
      this.reconnectDelay = 1000;
      for (const channel of this.subscriptions) {
        this.send({ type: "subscribe", channel });
      }
    };

    this.ws.onmessage = (e) => {
      const message = JSON.parse(e.data as string) as WsServerMessage;
      this.handleMessage(message);
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this._status !== "disconnected") {
        this.setStatus("reconnecting");
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {};
  }

  /** Close the connection and cancel any pending reconnect. */
  disconnect(): void {
    this.setStatus("disconnected");
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  /** Subscribe to a channel. Sends immediately if connected, otherwise queued for next connect. */
  subscribe(channel: string): void {
    this.subscriptions.add(channel);
    if (this._status === "connected") {
      this.send({ type: "subscribe", channel });
    }
  }

  /** Unsubscribe from a channel. */
  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    if (this._status === "connected") {
      this.send({ type: "unsubscribe", channel });
    }
  }

  /** Register a listener for incoming server events. Returns a cleanup function. */
  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Register a listener for connection status changes. Returns a cleanup function. */
  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private send(message: WsClientMessage): void {
    // readyState 1 === OPEN per the WebSocket spec
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(message: WsServerMessage): void {
    switch (message.type) {
      case "ping":
        this.send({ type: "pong" });
        break;
      case "event":
        for (const listener of this.eventListeners) {
          listener(message);
        }
        break;
      case "connected":
      case "pong":
        break;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
}

let manager: WebSocketManager | null = null;

/**
 * Returns the singleton WebSocketManager for the given URL.
 * Creates one on first call.
 */
export function getWebSocketManager(url: string): WebSocketManager {
  if (!manager) {
    manager = new WebSocketManager(url);
  }
  return manager;
}

/**
 * React hook that subscribes to connection status changes via useSyncExternalStore.
 */
export function useConnectionStatus(wsManager: WebSocketManager): ConnectionStatus {
  const statusRef = useRef(wsManager.status);

  return useSyncExternalStore(
    (callback) => {
      return wsManager.onStatusChange((status) => {
        statusRef.current = status;
        callback();
      });
    },
    () => statusRef.current,
  );
}

/**
 * React hook that returns a connected WebSocketManager for the given URL.
 * Connects on mount and disconnects on unmount.
 */
export function useWebSocket(url: string): WebSocketManager {
  const managerRef = useRef<WebSocketManager | null>(null);

  if (!managerRef.current) {
    managerRef.current = getWebSocketManager(url);
  }

  useEffect(() => {
    const m = managerRef.current!;
    m.connect();
    return () => m.disconnect();
  }, [url]);

  return managerRef.current;
}
