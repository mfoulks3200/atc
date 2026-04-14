/**
 * AgentManager owns the runtime lifecycle of agent subprocesses.
 *
 * The manager delegates the actual launch/pause/terminate work to a registered
 * {@link AgentAdapter}, but it is the source of truth for the in-memory
 * {@link AgentHandle} bookkeeping, crash detection, PID reaping, and restart
 * re-attach. Persisted identity lives in {@link AgentStore}; this class keeps
 * the two views in sync.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */

import type { AgentAdapter, AgentHandle, AgentLaunchOptions } from "../adapters/adapter.js";
import type { AdapterRegistry } from "../adapters/registry.js";
import type { AgentStore } from "../state/agent-store.js";
import type { AgentRecord, AgentStatus } from "../types.js";
import { isProcessAlive as defaultIsProcessAlive } from "./pid.js";

/**
 * Options required to launch a new agent through the manager.
 *
 * @see RULE-PILOT-1
 */
export interface AgentManagerLaunchOptions {
  /** Unique agent identifier (UUID) to assign to the new agent. */
  agentId: string;
  /** Adapter type string to resolve from the registry (e.g. "claude-agent-sdk"). */
  adapterType: string;
  /** Project name the agent belongs to. */
  projectName: string;
  /** Callsign of the craft the agent is piloting. */
  callsign: string;
  /** Full launch options forwarded to the adapter. */
  launchOptions: AgentLaunchOptions;
}

/**
 * Liveness probe signature. Returns `true` when the given PID is alive.
 *
 * Extracted for testability — production code uses {@link defaultIsProcessAlive}.
 */
export type LivenessProbe = (pid: number) => boolean;

/**
 * Dependencies injected into an {@link AgentManager} instance.
 */
export interface AgentManagerDeps {
  /** Registry used to resolve adapters by type string. */
  adapterRegistry: AdapterRegistry;
  /** Persistent store for agent records. */
  agentStore: AgentStore;
  /** Optional liveness probe override (defaults to the shared PID checker). */
  isProcessAlive?: LivenessProbe;
}

/**
 * Manages agent subprocess lifecycles for the daemon.
 *
 * Responsibilities:
 * - Launch agents via the appropriate adapter, persist the resulting record.
 * - Track live {@link AgentHandle}s keyed by agent id.
 * - Detect crashes by polling PID liveness and reconcile {@link AgentStore}.
 * - On daemon restart, re-attach to records whose process is still alive and
 *   mark the rest `terminated`.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */
export class AgentManager {
  private readonly _handles: Map<string, AgentHandle> = new Map();
  private readonly _adapters: Map<string, string> = new Map();
  private readonly _adapterRegistry: AdapterRegistry;
  private readonly _agentStore: AgentStore;
  private readonly _isProcessAlive: LivenessProbe;

  /**
   * @param deps - Registry, store, and optional liveness probe.
   */
  constructor(deps: AgentManagerDeps) {
    this._adapterRegistry = deps.adapterRegistry;
    this._agentStore = deps.agentStore;
    this._isProcessAlive = deps.isProcessAlive ?? defaultIsProcessAlive;
  }

  /**
   * Launch a new agent, delegating to the adapter registered for the given
   * adapter type. The returned handle is stored in-memory and the agent
   * record is upserted into {@link AgentStore} with status `running`.
   *
   * @param options - Launch configuration.
   * @returns The created {@link AgentRecord}.
   * @throws {Error} If no adapter is registered for `adapterType`.
   *
   * @see RULE-PILOT-1
   */
  async launch(options: AgentManagerLaunchOptions): Promise<AgentRecord> {
    const adapter = this._adapterRegistry.get(options.adapterType);
    if (adapter === undefined) {
      throw new Error(`No adapter registered for type "${options.adapterType}"`);
    }

    const handle = await adapter.launch(options.launchOptions);
    this._handles.set(options.agentId, handle);
    this._adapters.set(options.agentId, options.adapterType);

    const record: AgentRecord = {
      id: options.agentId,
      adapterType: options.adapterType,
      pid: handle.pid,
      projectName: options.projectName,
      callsign: options.callsign,
      status: "running",
      adapterMeta: handle.adapterMeta,
    };
    this._agentStore.set(record);
    return record;
  }

  /**
   * Gracefully stop a running agent by delegating to the adapter's
   * `terminate` method and marking the store record `terminated`.
   *
   * No-ops if the agent id is unknown.
   *
   * @param agentId - Unique agent identifier.
   *
   * @see RULE-PILOT-1
   */
  async stop(agentId: string): Promise<void> {
    const handle = this._handles.get(agentId);
    if (handle === undefined) {
      return;
    }
    const adapter = this._resolveAdapter(agentId);
    if (adapter !== undefined) {
      await adapter.terminate(handle);
    }
    this._handles.delete(agentId);
    this._agentStore.updateStatus(agentId, "terminated");
  }

  /**
   * Returns the in-memory handle for an agent, or `undefined` if the manager
   * has no live reference for it.
   *
   * @param agentId - Unique agent identifier.
   */
  getHandle(agentId: string): AgentHandle | undefined {
    return this._handles.get(agentId);
  }

  /**
   * Sweep all tracked agents, marking any whose underlying process has exited
   * as `terminated`. The dead handles are removed from the in-memory map.
   *
   * Agents that have no PID (pure in-process stubs) are skipped.
   *
   * @returns The list of agent ids that were reaped.
   *
   * @see RULE-PILOT-1
   */
  reap(): string[] {
    const reaped: string[] = [];
    for (const [agentId, handle] of this._handles) {
      if (handle.pid === undefined) {
        continue;
      }
      if (!this._isProcessAlive(handle.pid)) {
        this._handles.delete(agentId);
        this._agentStore.updateStatus(agentId, "terminated");
        reaped.push(agentId);
      }
    }
    return reaped;
  }

  /**
   * Re-attach the manager to records persisted in {@link AgentStore} after a
   * daemon restart.
   *
   * For each stored record:
   * - If the record has a live PID, rebuild an {@link AgentHandle} and keep
   *   the status as-is.
   * - If the record has no PID or the PID is gone, mark the record
   *   `terminated` and leave it out of the in-memory handle map.
   *
   * The store is expected to have been loaded from disk before this is called.
   *
   * @returns A summary of re-attached and terminated agent ids.
   *
   * @see RULE-PILOT-1
   */
  reattach(): { reattached: string[]; terminated: string[] } {
    const reattached: string[] = [];
    const terminated: string[] = [];

    for (const record of this._agentStore.list()) {
      if (record.status === "terminated") {
        continue;
      }
      if (record.pid !== undefined && this._isProcessAlive(record.pid)) {
        this._handles.set(record.id, {
          agentId: record.id,
          pid: record.pid,
          adapterMeta: record.adapterMeta,
        });
        this._adapters.set(record.id, record.adapterType);
        reattached.push(record.id);
      } else {
        this._agentStore.updateStatus(record.id, "terminated");
        terminated.push(record.id);
      }
    }

    return { reattached, terminated };
  }

  /**
   * Force the in-memory status to reflect an adapter-reported change without
   * going through launch/stop. Used by higher layers (e.g. stdout crash
   * detection) to push a status update through the store.
   *
   * @param agentId - Unique agent identifier.
   * @param status  - New lifecycle status.
   *
   * @see RULE-PILOT-1
   */
  setStatus(agentId: string, status: AgentStatus): void {
    this._agentStore.updateStatus(agentId, status);
    if (status === "terminated") {
      this._handles.delete(agentId);
    }
  }

  /**
   * Resolve the adapter for a tracked agent id, if one is registered.
   */
  private _resolveAdapter(agentId: string): AgentAdapter | undefined {
    const adapterType = this._adapters.get(agentId);
    if (adapterType === undefined) {
      return undefined;
    }
    return this._adapterRegistry.get(adapterType);
  }
}
