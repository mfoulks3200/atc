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

import type { AgentAdapter, AgentHandle, AgentLaunchOptions, AgentResumeContext } from "../adapters/adapter.js";
import type { AdapterRegistry } from "../adapters/registry.js";
import type { AgentStore } from "../state/agent-store.js";
import type { AgentRecord, AgentStatus } from "../types.js";
import { AgentOutputPipe, type CapturedLine } from "./output-pipe.js";
import { isProcessAlive as defaultIsProcessAlive } from "./pid.js";

/**
 * Default ring buffer cap, in lines, applied per agent when the daemon does
 * not override it. Sized to comfortably hold a few minutes of chatty output
 * without putting meaningful pressure on daemon memory.
 */
export const DEFAULT_OUTPUT_BUFFER_SIZE = 10_000;

/**
 * Context passed to the output sink for every captured line.
 */
export interface OutputContext {
  /** Agent id whose subprocess produced the line. */
  agentId: string;
  /** Project the agent's craft belongs to. */
  projectName: string;
  /** Craft callsign the agent is piloting. */
  callsign: string;
}

/**
 * Sink invoked once per captured line of agent stdout/stderr. Production
 * wiring appends the line to the craft's black box as an `AgentOutput` entry
 * and broadcasts it on `craft:<callsign>` via `appendBlackBoxEntry`.
 */
export type OutputSink = (ctx: OutputContext, line: CapturedLine) => void;

/**
 * @deprecated The intercom is now an explicit MCP tool the agent invokes
 * (see `createIntercomMcpServer` in the adapter). Agent assistant output is
 * no longer auto-forwarded to the intercom — it goes only to the black box
 * via `outputSink`. This type is retained as a no-op hook for backwards
 * compatibility with any external adapter wiring; the daemon no longer
 * supplies it.
 */
export type IntercomSink = (
  ctx: OutputContext,
  message: import("../types.js").IntercomMessage,
) => void;

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
  /** Pilot identifier this agent represents (used for intercom routing). */
  pilotId?: string;
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
  /**
   * Optional sink invoked once per captured stdout/stderr line. When omitted,
   * agent output is silently dropped (test/stub mode). The daemon wires this
   * to a function that appends an `AgentOutput` entry via
   * `appendBlackBoxEntry`, which fans the line out on the craft channel.
   */
  outputSink?: OutputSink;
  /**
   * Optional sink invoked when the agent emits an assistant text message.
   * The daemon wires this to append the message to the craft intercom and
   * forward it to other running agents on the same craft.
   */
  intercomSink?: IntercomSink;
  /**
   * Maximum number of stdout/stderr lines retained per agent in the in-memory
   * ring buffer. Defaults to {@link DEFAULT_OUTPUT_BUFFER_SIZE}. The cap
   * applies independently to each running agent.
   */
  outputBufferSize?: number;
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
  private readonly _pilotIds: Map<string, string> = new Map(); // agentId → pilotId
  private readonly _pipes: Map<string, AgentOutputPipe> = new Map();
  private readonly _exitDetachers: Map<string, () => void> = new Map();
  private readonly _adapterRegistry: AdapterRegistry;
  private readonly _agentStore: AgentStore;
  private readonly _isProcessAlive: LivenessProbe;
  private readonly _outputSink?: OutputSink;
  private readonly _intercomSink?: IntercomSink;
  private readonly _outputBufferSize: number;

  /**
   * @param deps - Registry, store, and optional liveness probe / output sink.
   */
  constructor(deps: AgentManagerDeps) {
    this._adapterRegistry = deps.adapterRegistry;
    this._agentStore = deps.agentStore;
    this._isProcessAlive = deps.isProcessAlive ?? defaultIsProcessAlive;
    this._outputSink = deps.outputSink;
    this._intercomSink = deps.intercomSink;
    this._outputBufferSize = deps.outputBufferSize ?? DEFAULT_OUTPUT_BUFFER_SIZE;
  }

  /**
   * Return all agent records from the store (all statuses).
   * Used by TFR routes to find running or paused agents by callsign.
   */
  listAgents(): AgentRecord[] {
    return this._agentStore.list();
  }

  /**
   * Return the in-memory ring buffer of captured output for an agent, or
   * `undefined` if the manager has no live pipe for it. Used by the future
   * craft activity view to seed clients with recent context on subscribe.
   */
  getOutputBuffer(agentId: string): CapturedLine[] | undefined {
    return this._pipes.get(agentId)?.snapshot();
  }

  /**
   * Pause a specific running agent by its id. Delegates to the adapter's
   * `pause()` method and marks the record as `paused` in the store.
   * No-ops if the agent has no live handle.
   *
   * @see RULE-TFR-5 for holding-pattern enforcement.
   */
  async pauseAgent(agentId: string): Promise<void> {
    const handle = this._handles.get(agentId);
    if (handle === undefined) return;
    const adapter = this._resolveAdapter(agentId);
    if (adapter === undefined) return;
    await adapter.pause(handle);
    this._agentStore.updateStatus(agentId, "paused");
  }

  /**
   * Resume a previously paused agent by its id. Delegates to the adapter's
   * `resume()` method with the provided context and marks the record as
   * `running` in the store. No-ops if the agent has no live handle.
   *
   * @see RULE-TFRP-4 for auto-resume on TFR lift.
   */
  async resumeAgent(agentId: string, context: AgentResumeContext): Promise<void> {
    const handle = this._handles.get(agentId);
    if (handle === undefined) return;
    const adapter = this._resolveAdapter(agentId);
    if (adapter === undefined) return;
    await adapter.resume(handle, context);
    this._agentStore.updateStatus(agentId, "running");
  }

  /**
   * Forward an intercom message to all running agents on a craft, excluding
   * the agent whose pilotId matches `message.from` (to avoid echo loops).
   * No-ops if no live handles exist for the callsign.
   *
   * @see RULE-CRAFT-5
   */
  async sendMessage(callsign: string, message: import("../types.js").IntercomMessage): Promise<void> {
    const recipients = this._agentStore
      .list()
      .filter((r) => r.callsign === callsign && r.status === "running" && r.pilotId !== message.from);
    for (const record of recipients) {
      const handle = this._handles.get(record.id);
      if (handle === undefined) continue;
      const adapterType = this._adapters.get(record.id);
      if (adapterType === undefined) continue;
      const adapter = this._adapterRegistry.get(adapterType);
      if (adapter === undefined) continue;
      await adapter.sendMessage(handle, message);
    }
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
    if (options.pilotId !== undefined) {
      this._pilotIds.set(options.agentId, options.pilotId);
    }
    this._attachOutputPipe(options.agentId, options.projectName, options.callsign, handle);

    const msgCtx: OutputContext = {
      agentId: options.agentId,
      projectName: options.projectName,
      callsign: options.callsign,
    };
    // Route assistant text into the black box only. The intercom is an
    // explicit MCP tool the agent invokes (see createIntercomMcpServer);
    // the adapter does not emit onMessage events for tool-triggered
    // intercom posts, so this sink stays focused on raw assistant output.
    if (this._outputSink !== undefined) {
      const sink = this._outputSink;
      adapter.onMessage(handle, (msg) => {
        sink(msgCtx, { text: msg.content, stream: "stdout", timestamp: new Date() });
      });
    }
    if (this._intercomSink !== undefined) {
      // Legacy path, retained for backwards compatibility with adapters
      // that still emit intercom events via onMessage. The production
      // daemon no longer supplies this sink.
      const sink = this._intercomSink;
      adapter.onMessage(handle, (msg) => {
        sink(msgCtx, msg);
      });
    }

    const record: AgentRecord = {
      id: options.agentId,
      adapterType: options.adapterType,
      pid: handle.pid,
      projectName: options.projectName,
      callsign: options.callsign,
      pilotId: options.pilotId,
      status: "running",
      adapterMeta: handle.adapterMeta,
    };
    this._agentStore.set(record);
    return record;
  }

  /**
   * Build an {@link AgentOutputPipe} for a freshly launched handle and wire
   * its stdout/stderr into the configured sink. If the handle exposes an
   * `onExit` hook, register a listener that drains the pipe and pushes a
   * `terminated` status transition through the store.
   *
   * Pipes are cleaned up by {@link _detachOutputPipe} on stop/reap.
   */
  private _attachOutputPipe(
    agentId: string,
    projectName: string,
    callsign: string,
    handle: AgentHandle,
  ): void {
    const hasStreams = handle.stdout !== undefined || handle.stderr !== undefined;
    if (!hasStreams && handle.onExit === undefined) {
      return;
    }
    const ctx: OutputContext = { agentId, projectName, callsign };
    const sink = this._outputSink;
    const pipe = new AgentOutputPipe(
      (line) => {
        if (sink !== undefined) {
          sink(ctx, line);
        }
      },
      { bufferSize: this._outputBufferSize },
    );
    if (handle.stdout !== undefined) {
      pipe.attach(handle.stdout, "stdout");
    }
    if (handle.stderr !== undefined) {
      pipe.attach(handle.stderr, "stderr");
    }
    this._pipes.set(agentId, pipe);

    if (handle.onExit !== undefined) {
      const detach = handle.onExit(() => {
        this._handleSubprocessExit(agentId);
      });
      this._exitDetachers.set(agentId, detach);
    }
  }

  /**
   * Drain and remove the pipe for an agent (if any). Idempotent.
   */
  private _detachOutputPipe(agentId: string): void {
    const pipe = this._pipes.get(agentId);
    if (pipe !== undefined) {
      pipe.close();
      this._pipes.delete(agentId);
    }
    const detach = this._exitDetachers.get(agentId);
    if (detach !== undefined) {
      detach();
      this._exitDetachers.delete(agentId);
    }
  }

  /**
   * Invoked by an `onExit` hook from the underlying handle. Drains the
   * remaining buffered output, pushes a terminal status transition through
   * {@link setStatus}, and releases the handle.
   */
  private _handleSubprocessExit(agentId: string): void {
    this._detachOutputPipe(agentId);
    if (this._handles.has(agentId)) {
      this.setStatus(agentId, "terminated");
    }
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
    this._detachOutputPipe(agentId);
    this._handles.delete(agentId);
    this._pilotIds.delete(agentId);
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
        this._detachOutputPipe(agentId);
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
        if (record.pilotId !== undefined) {
          this._pilotIds.set(record.id, record.pilotId);
        }
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
      this._detachOutputPipe(agentId);
      this._handles.delete(agentId);
      this._pilotIds.delete(agentId);
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
