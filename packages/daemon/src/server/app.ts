import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { randomUUID } from "node:crypto";
import { AgentStore } from "../state/agent-store.js";
import { CraftStore } from "../state/craft-store.js";
import { TowerStore } from "../state/tower-store.js";
import { PilotStore } from "../state/pilot-store.js";
import { TfrStore } from "../state/tfr-store.js";
import { AdapterRegistry } from "../adapters/registry.js";
import { ChannelRegistry } from "./websocket/channels.js";
import { HeartbeatTracker } from "./websocket/heartbeat.js";
import { handleWsMessage } from "./websocket/handler.js";
import type { WsClientMessage, WsServerMessage } from "../types.js";
import { healthRoutes } from "./routes/health.js";
import { projectRoutes } from "./routes/projects.js";
import { craftRoutes } from "./routes/crafts.js";
import { vectorRoutes } from "./routes/vectors.js";
import { towerRoutes } from "./routes/tower.js";
import { agentRoutes } from "./routes/agents.js";
import { pilotRoutes } from "./routes/pilots.js";
import { intercomRoutes } from "./routes/intercom.js";
import { blackboxRoutes } from "./routes/blackbox.js";
import { configRoutes } from "./routes/config.js";
import { tfrRoutes } from "./routes/tfr.js";
import type { LayeredConfigStore } from "../config/layered-store.js";
import type { GlobalConfig } from "../config/schema.js";

/**
 * Options passed to {@link createApp}.
 *
 * @see RULE-CRAFT-1 for craft lifecycle context.
 */
export interface AppOptions {
  /** Path to the profile directory the daemon is serving. */
  profileDir?: string;
  /** Store for agent records. */
  agentStore?: AgentStore;
  /** Store for craft state. */
  craftStore?: CraftStore;
  /** Store for tower landing queues. */
  towerStore?: TowerStore;
  /** Store for pilot records. */
  pilotStore?: PilotStore;
  /** Store for Temporary Flight Restrictions. */
  tfrStore?: TfrStore;
  /** Registry of adapter implementations. */
  adapterRegistry?: AdapterRegistry;
  /** Pub/sub channel registry for WebSocket clients. */
  channelRegistry?: ChannelRegistry;
  /** Store for global configuration. */
  globalConfigStore?: LayeredConfigStore<GlobalConfig>;
}

/**
 * Creates and configures a Fastify application instance.
 *
 * Registers all core route plugins and decorates the instance with
 * daemon-specific properties derived from {@link AppOptions}.
 *
 * @param options - Optional configuration for the app instance.
 * @returns A configured {@link FastifyInstance} ready to listen.
 */
export function createApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate("profileDir", options.profileDir ?? "");
  app.decorate("agentStore", options.agentStore ?? new AgentStore("/tmp/atc-default"));
  app.decorate("craftStore", options.craftStore ?? new CraftStore("/tmp/atc-default"));
  app.decorate("towerStore", options.towerStore ?? new TowerStore("/tmp/atc-default"));
  app.decorate("pilotStore", options.pilotStore ?? new PilotStore("/tmp/atc-default"));
  app.decorate("tfrStore", options.tfrStore ?? new TfrStore("/tmp/atc-default"));
  app.decorate("adapterRegistry", options.adapterRegistry ?? new AdapterRegistry());
  app.decorate("channelRegistry", options.channelRegistry ?? new ChannelRegistry());
  app.decorate("globalConfigStore", options.globalConfigStore ?? null);

  void app.register(websocket);

  void app.register(healthRoutes);
  void app.register(projectRoutes);
  void app.register(craftRoutes);
  void app.register(vectorRoutes);
  void app.register(towerRoutes);
  void app.register(agentRoutes);
  void app.register(pilotRoutes);
  void app.register(intercomRoutes);
  void app.register(blackboxRoutes);
  void app.register(configRoutes);
  void app.register(tfrRoutes);

  const heartbeat = new HeartbeatTracker(3);

  void app.register(async (instance) => {
    instance.get("/ws", { websocket: true }, (socket) => {
      const clientId = randomUUID();
      heartbeat.addClient(clientId);

      const send = (data: WsServerMessage) => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify(data));
        }
      };

      send({ type: "connected", sessionId: clientId });

      socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const message = JSON.parse(raw.toString()) as WsClientMessage;
          void handleWsMessage(
            message,
            clientId,
            send,
            instance.channelRegistry,
            heartbeat,
            instance.globalConfigStore,
          );
        } catch {
          // ignore malformed messages
        }
      });

      socket.on("close", () => {
        heartbeat.removeClient(clientId);
        instance.channelRegistry.removeClient(clientId);
      });
    });
  });

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    /** Absolute path to the active profile directory. */
    profileDir: string;
    /** Store for agent records. */
    agentStore: AgentStore;
    /** Store for craft state. */
    craftStore: CraftStore;
    /** Store for tower landing queues. */
    towerStore: TowerStore;
    /** Persistent store for pilot records. */
    pilotStore: PilotStore;
    /** Store for Temporary Flight Restrictions. */
    tfrStore: TfrStore;
    /** Registry of adapter implementations. */
    adapterRegistry: AdapterRegistry;
    /** Pub/sub channel registry for WebSocket clients. */
    channelRegistry: ChannelRegistry;
    /** Store for global configuration, if wired. */
    globalConfigStore: LayeredConfigStore<GlobalConfig> | null;
  }
}
