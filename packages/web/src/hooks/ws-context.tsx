import { createContext, useContext } from "react";
import type { WebSocketManager } from "./use-websocket";

interface WsContextValue {
  manager: WebSocketManager;
  url: string;
}

const WsContext = createContext<WsContextValue | null>(null);

export const WsProvider = WsContext.Provider;

export function useWsManager(): WebSocketManager {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWsManager must be used within WsProvider");
  return ctx.manager;
}

export function useWsUrl(): string {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWsUrl must be used within WsProvider");
  return ctx.url;
}
