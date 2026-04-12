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
import { configRoutes } from "./routes/config.js";
import { projectConfigRoutes } from "./routes/project-config.js";
import { pilotConfigRoutes } from "./routes/pilot-config.js";
import type { LayeredConfigStore } from "../config/layered-store.js";
import type { GlobalConfig, ProjectMetadataConfig } from "../config/schema.js";
import { PilotConfigStore } from "../config/pilot-config-store.js";

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
  /** Store for global configuration. */
  globalConfigStore?: LayeredConfigStore<GlobalConfig>;
  /** Map of project name -> LayeredConfigStore for project config. */
  projectConfigStores?: Map<string, LayeredConfigStore<ProjectMetadataConfig>>;
  /** Store for per-pilot configuration (in-memory). */
  pilotConfigStore?: PilotConfigStore;
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
  app.decorate("globalConfigStore", options.globalConfigStore ?? null);
  app.decorate(
    "projectConfigStores",
    options.projectConfigStores ?? new Map<string, LayeredConfigStore<ProjectMetadataConfig>>(),
  );
  app.decorate("pilotStore", new Map<string, Map<string, PilotRecord>>());
  app.decorate(
    "pilotConfigStore",
    options.pilotConfigStore ??
      new PilotConfigStore(
        (options.channelRegistry ?? app.channelRegistry).publish.bind(
          options.channelRegistry ?? app.channelRegistry,
        ),
      ),
  );

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
  void app.register(projectConfigRoutes);
  void app.register(pilotConfigRoutes);

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
            instance.projectConfigStores,
            instance.pilotConfigStore,
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
    /** Registry of adapter implementations. */
    adapterRegistry: AdapterRegistry;
    /** Pub/sub channel registry for WebSocket clients. */
    channelRegistry: ChannelRegistry;
    /** In-memory pilot store: project name -> pilot id -> PilotRecord. */
    pilotStore: Map<string, Map<string, PilotRecord>>;
    /** Store for global configuration, if wired. */
    globalConfigStore: LayeredConfigStore<GlobalConfig> | null;
    /** Map of project name -> LayeredConfigStore for project config. */
    projectConfigStores: Map<string, LayeredConfigStore<ProjectMetadataConfig>>;
    /** In-memory store for per-pilot config. */
    pilotConfigStore: PilotConfigStore;
  }
}
