import { createContext, useContext } from "react";
import type { WebSocketManager } from "./use-websocket";

const WsContext = createContext<WebSocketManager | null>(null);

export const WsProvider = WsContext.Provider;

export function useWsManager(): WebSocketManager {
  const manager = useContext(WsContext);
  if (!manager) throw new Error("useWsManager must be used within WsProvider");
  return manager;
}
