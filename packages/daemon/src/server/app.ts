import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { randomUUID } from "node:crypto";
import { AgentStore } from "../state/agent-store.js";
import { CraftStore } from "../state/craft-store.js";
import { TowerStore } from "../state/tower-store.js";
import { AdapterRegistry } from "../adapters/registry.js";
import { ChannelRegistry } from "./websocket/channels.js";
import { HeartbeatTracker } from "./websocket/heartbeat.js";
import { handleWsMessage } from "./websocket/handler.js";
import type { PilotRecord, WsClientMessage, WsServerMessage } from "../types.js";
import { healthRoutes } from "./routes/health.js";
import { projectRoutes } from "./routes/projects.js";
import { craftRoutes } from "./routes/crafts.js";
import { vectorRoutes } from "./routes/vectors.js";
import { towerRoutes } from "./routes/tower.js";
import { agentRoutes } from "./routes/agents.js";
import { pilotRoutes } from "./routes/pilots.js";
import { intercomRoutes } from "./routes/intercom.js";
import { blackboxRoutes } from "./routes/blackbox.js";

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
  /** Registry of adapter implementations. */
  adapterRegistry?: AdapterRegistry;
  /** Pub/sub channel registry for WebSocket clients. */
  channelRegistry?: ChannelRegistry;
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
  app.decorate("adapterRegistry", options.adapterRegistry ?? new AdapterRegistry());
  app.decorate("channelRegistry", options.channelRegistry ?? new ChannelRegistry());
  app.decorate("pilotStore", new Map<string, Map<string, PilotRecord>>());

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
          handleWsMessage(message, clientId, send, instance.channelRegistry, heartbeat);
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
    /** Registry of adapter implementations. */
    adapterRegistry: AdapterRegistry;
    /** Pub/sub channel registry for WebSocket clients. */
    channelRegistry: ChannelRegistry;
    /** In-memory pilot store: project name -> pilot id -> PilotRecord. */
    pilotStore: Map<string, Map<string, PilotRecord>>;
  }
}
