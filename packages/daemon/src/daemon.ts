/**
 * Top-level Daemon orchestrator for the ATC daemon process.
 *
 * The Daemon class owns the full lifecycle of a running daemon instance:
 * loading config, initializing stores, starting the Fastify server,
 * scheduling periodic flushes, managing the PID file, and handling
 * OS shutdown signals.
 *
 * @see RULE-CRAFT-1 for craft lifecycle context.
 * @see RULE-PILOT-1 for pilot identity rules.
 * @see RULE-TOWER-1 for tower merge coordination.
 */

import { join } from "node:path";
import { loadProfileConfig } from "./config/loader.js";
import { AgentStore } from "./state/agent-store.js";
import { CraftStore } from "./state/craft-store.js";
import { TowerStore } from "./state/tower-store.js";
import { PilotStore } from "./state/pilot-store.js";
import { FlushScheduler } from "./state/persistence.js";
import { AdapterRegistry } from "./adapters/registry.js";
import { AgentManager } from "./process/agent-manager.js";
import { createApp } from "./server/app.js";
import { writePidFile, removePidFile } from "./process/pid.js";
import { createShutdownHandler, registerSignalHandlers } from "./process/signals.js";
import { createGlobalConfigStore } from "./config/global-store.js";
import { createProjectConfigStore } from "./config/project-store.js";
import type { LayeredConfigStore } from "./config/layered-store.js";
import type { GlobalConfig, ProjectMetadataConfig } from "./config/schema.js";
import { ChannelRegistry } from "./server/websocket/channels.js";
import { appendBlackBoxEntryWithRegistry } from "./server/routes/blackbox-helpers.js";
import { BlackBoxEntryType } from "@airtrafficcontrol/types";
import { reconcileOrphanWorktrees } from "./git/worktree-reconciler.js";

/** Path of the PID file relative to the profile directory. */
const PID_FILE = "daemon.pid";

/**
 * Top-level orchestrator for a running ATC daemon instance.
 *
 * Create one instance per process. Call {@link start} to bring the daemon
 * online and {@link stop} to shut it down cleanly. The daemon registers OS
 * signal handlers automatically on start so SIGTERM/SIGINT both trigger a
 * graceful shutdown.
 *
 * @example
 * ```ts
 * const daemon = new Daemon("/home/user/.atc/profiles/default");
 * await daemon.start();
 * console.log(`Listening on port ${daemon.port}`);
 * ```
 */
export class Daemon {
  private readonly _profileDir: string;
  private readonly _atcDir: string;
  private readonly _adapterRegistry: AdapterRegistry | undefined;
  private _globalConfigStore: LayeredConfigStore<GlobalConfig> | null = null;
  private _channelRegistry: ChannelRegistry | null = null;
  private _running = false;
  private _port = 0;
  private _app: Awaited<ReturnType<typeof createApp>> | null = null;
  private _flushScheduler: FlushScheduler | null = null;
  private _agentStore: AgentStore | null = null;
  private _craftStore: CraftStore | null = null;
  private _pilotStore: PilotStore | null = null;
  private _agentManager: AgentManager | null = null;
  private _projectConfigStores: Map<string, LayeredConfigStore<ProjectMetadataConfig>> = new Map();

  /**
   * @param profileDir - Absolute path to the profile directory. Must contain
   *   a `config.json` file and the standard subdirectory layout.
   * @param atcDir - Absolute path to the `.atc` root directory. Used as the
   *   location of the global `config.json` file.
   * @param adapterRegistry - Optional pre-configured adapter registry. If
   *   omitted, an empty registry is used (callers should register adapters
   *   before calling {@link start} or pass one here). This parameter exists
   *   to break the compile-time circular dependency between daemon and
   *   adapter packages — the entry point (start.ts) registers adapters after
   *   importing them independently.
   */
  constructor(profileDir: string, atcDir: string, adapterRegistry?: AdapterRegistry) {
    this._profileDir = profileDir;
    this._atcDir = atcDir;
    this._adapterRegistry = adapterRegistry;
  }

  /**
   * Whether the daemon is currently running and accepting connections.
   */
  get isRunning(): boolean {
    return this._running;
  }

  /**
   * The TCP port the HTTP/WS server is bound to.
   * Only meaningful after {@link start} resolves.
   */
  get port(): number {
    return this._port;
  }

  /**
   * Starts the daemon.
   *
   * Sequence:
   * 1. Load profile config via `loadProfileConfig`.
   * 2. Load persisted agent and pilot state.
   * 3. Reconcile orphaned git worktrees via `reconcileOrphanWorktrees`.
   * 4. Create a Fastify app via `createApp` with the profile dir and all stores.
   * 5. Listen on `config.port` / `config.host`.
   * 6. Capture the bound port from the server address.
   * 7. Start a `FlushScheduler` for periodic state persistence.
   * 8. Write PID file to `<profileDir>/daemon.pid`.
   * 9. Register SIGTERM/SIGINT signal handlers for graceful shutdown.
   * 10. Set `running = true`.
   *
   * @returns Resolves when the server is listening and fully initialized.
   */
  async start(): Promise<void> {
    const config = await loadProfileConfig(this._profileDir);

    const stateDir = join(this._profileDir, "state");
    const agentStore = new AgentStore(stateDir);
    const craftStore = new CraftStore(stateDir);
    const towerStore = new TowerStore(stateDir);
    const pilotStore = new PilotStore(stateDir);

    await agentStore.load();
    await pilotStore.load();

    const adapterRegistry = this._adapterRegistry ?? new AdapterRegistry();
    const channelRegistry = new ChannelRegistry();

    // The intercom is an explicit MCP tool on the agent side (see
    // createIntercomMcpServer in the adapter). Agent assistant text is NOT
    // auto-forwarded to the intercom — it goes only to the black box via
    // the outputSink below. The tool handler POSTs to the intercom route,
    // which is where inbound-to-other-agents fan-out happens.
    const agentManager = new AgentManager({
      adapterRegistry,
      agentStore,
      outputSink: (ctx, line) => {
        const craft = craftStore.get(ctx.projectName, ctx.callsign);
        if (craft === undefined) {
          return;
        }
        appendBlackBoxEntryWithRegistry(
          channelRegistry,
          ctx.projectName,
          craft,
          "system",
          BlackBoxEntryType.AgentOutput,
          `[${line.stream}] ${line.text}`,
        );
        craftStore.set(ctx.projectName, craft);
      },
    });
    agentManager.reattach();
    const logger = {
      warn: (msg: string) => {
        console.warn(msg);
      },
      info: (msg: string) => {
        console.info(msg);
      },
      error: (msg: string, err?: unknown) => {
        console.error(msg, err);
      },
    };
    const globalConfigStore = createGlobalConfigStore(
      this._atcDir,
      channelRegistry.publish.bind(channelRegistry),
      logger,
    );
    await globalConfigStore.load();
    globalConfigStore.start();

    // Load project config stores for all existing projects
    const projectConfigStores = new Map<string, LayeredConfigStore<ProjectMetadataConfig>>();
    const projectsDir = join(this._profileDir, "projects");
    try {
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(projectsDir);
      for (const entry of entries) {
        const projectDir = join(projectsDir, entry);
        const store = createProjectConfigStore(
          entry,
          projectDir,
          channelRegistry.publish.bind(channelRegistry),
          logger,
        );
        try {
          await store.load();
          store.start();
          projectConfigStores.set(entry, store);
        } catch {
          // Skip projects without valid metadata
        }
      }
    } catch {
      // No projects dir yet — empty map is fine
    }

    // Prune worktrees that have no matching active craft (orphaned from a prior
    // crash or incomplete cleanup). Runs before the HTTP server accepts traffic
    // so no routes can race against the prune operations.
    await reconcileOrphanWorktrees(this._profileDir, craftStore, logger);

    const app = createApp({
      profileDir: this._profileDir,
      agentStore,
      craftStore,
      towerStore,
      pilotStore,
      adapterRegistry,
      agentManager,
      channelRegistry,
      globalConfigStore,
      projectConfigStores,
    });

    await app.listen({ port: config.port, host: config.host });

    const address = app.server.address();
    this._port = typeof address === "string" ? config.port : (address?.port ?? config.port);

    const flushIntervalSeconds = config.stateFlushInterval / 1000;
    const flushScheduler = new FlushScheduler(async () => {
      await agentStore.save();
      await craftStore.saveAll();
      await pilotStore.save();
    }, flushIntervalSeconds);

    await writePidFile(join(this._profileDir, PID_FILE));

    const shutdownHandler = createShutdownHandler(async () => {
      await this.stop();
    });
    registerSignalHandlers(shutdownHandler);

    this._app = app;
    this._flushScheduler = flushScheduler;
    this._agentStore = agentStore;
    this._craftStore = craftStore;
    this._pilotStore = pilotStore;
    this._agentManager = agentManager;
    this._channelRegistry = channelRegistry;
    this._globalConfigStore = globalConfigStore;
    this._projectConfigStores = projectConfigStores;
    this._running = true;
  }

  /**
   * Stops the daemon gracefully.
   *
   * Sequence:
   * 1. If not running, return immediately.
   * 2. Flush all in-memory state to disk (`agentStore.save`, `craftStore.saveAll`).
   * 3. Stop the flush scheduler.
   * 4. Close the Fastify server.
   * 5. Remove the PID file.
   * 6. Set `running = false`.
   *
   * @returns Resolves when the server has fully closed and state is flushed.
   */
  async stop(): Promise<void> {
    if (!this._running) {
      return;
    }

    if (this._agentStore !== null) {
      await this._agentStore.save();
    }
    if (this._craftStore !== null) {
      await this._craftStore.saveAll();
    }
    if (this._pilotStore !== null) {
      await this._pilotStore.save();
    }

    this._flushScheduler?.stop();

    if (this._app !== null) {
      await this._app.close();
    }

    for (const store of this._projectConfigStores.values()) {
      await store.stop();
    }

    if (this._globalConfigStore !== null) {
      await this._globalConfigStore.stop();
    }

    await removePidFile(join(this._profileDir, PID_FILE));

    this._running = false;
  }
}
