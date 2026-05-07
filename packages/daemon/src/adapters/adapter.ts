/**
 * Agent adapter interfaces for pluggable agent runtime backends.
 *
 * An adapter abstracts how the daemon launches, communicates with, and
 * controls an underlying agent process. Different adapter implementations
 * (e.g. "claude-agent-sdk", "mock") conform to the same interface so the
 * daemon core remains runtime-agnostic.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */

import type { Readable } from "node:stream";
import type {
  AgentStatus,
  AgentUsageReport,
  CraftState,
  IntercomMessage,
  McpServerConfig,
} from "../types.js";

/**
 * An opaque handle returned by an adapter when an agent is launched.
 * The daemon holds this handle and passes it back to the adapter for all
 * subsequent operations on that agent.
 *
 * @see RULE-PILOT-1 for pilot identity rules.
 */
export interface AgentHandle {
  /** Unique agent identifier (UUID). */
  agentId: string;
  /** OS process ID, if the agent is backed by a subprocess. */
  pid?: number;
  /** Adapter-specific metadata (e.g. session IDs, connection info). */
  adapterMeta: Record<string, unknown>;
  /**
   * Optional readable stream of the agent subprocess's stdout. When present,
   * the daemon's output pipe captures lines and writes them to the craft's
   * black box and WebSocket stream.
   */
  stdout?: Readable;
  /**
   * Optional readable stream of the agent subprocess's stderr. Captured the
   * same way as {@link stdout}.
   */
  stderr?: Readable;
  /**
   * Optional hook invoked when the underlying subprocess exits or crashes.
   * The daemon uses this to drain remaining output, push a terminal status
   * transition, and release the in-memory handle.
   *
   * Returns an unsubscribe function so the manager can detach on stop.
   */
  onExit?: (
    cb: (info: { code: number | null; signal: NodeJS.Signals | null }) => void,
  ) => () => void;
}

/**
 * Options passed to an adapter when launching a new agent.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 * @see RULE-SEAT-1 through RULE-SEAT-3 for seat assignment rules.
 */
export interface AgentLaunchOptions {
  /** Unique agent identifier (UUID) to assign to the new agent. */
  agentId: string;
  /** Absolute path to the git worktree the agent should operate in. */
  worktreePath: string;
  /** Full persisted craft state to load the agent with. */
  craft: CraftState;
  /** Project name this craft belongs to (used in API URL construction). */
  projectName: string;
  /** Pilot identifier this agent represents (used as `from` in intercom messages). */
  pilotId?: string;
  /** System prompt text injected into the agent's context at startup. */
  systemPrompt: string;
  /** Prior intercom messages to replay into the agent's context. */
  intercomHistory: IntercomMessage[];
  /** Adapter-specific configuration key/value pairs. */
  adapterConfig: Record<string, unknown>;
  /** Named MCP server configurations to make available to the agent. */
  mcpServers: Record<string, McpServerConfig>;
  /**
   * Additional environment variables to inject into the agent subprocess.
   * The daemon populates `env['ATC_PILOT_TOKEN']` before calling {@link AgentAdapter.launch}.
   *
   * @see RULE-MCPAUTH-2
   */
  env?: Record<string, string>;
}

/**
 * Context provided to an adapter when resuming a previously paused agent.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */
export interface AgentResumeContext {
  /** Current craft state to restore the agent with. */
  craft: CraftState;
  /** Intercom history to replay into the resumed agent's context. */
  intercomHistory: IntercomMessage[];
  /** String representation of the agent's last known internal state. */
  lastKnownState: string;
  /**
   * Additional environment variables to inject into the agent subprocess on resume.
   * The daemon populates `env['ATC_PILOT_TOKEN']` with a freshly issued token before
   * calling {@link AgentAdapter.resume}.
   *
   * @see RULE-MCPAUTH-4
   */
  env?: Record<string, string>;
}

/**
 * Contract for a pluggable agent runtime adapter.
 *
 * Each adapter implementation must fulfil this interface so the daemon can
 * manage agents without knowing the underlying runtime (subprocess, SDK
 * session, remote worker, etc.).
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */
export interface AgentAdapter {
  /**
   * Launch a new agent and return a handle the daemon can use to manage it.
   *
   * @param options - Configuration and initial state for the new agent.
   * @returns A promise that resolves to an {@link AgentHandle}.
   */
  launch(options: AgentLaunchOptions): Promise<AgentHandle>;

  /**
   * Pause a running agent without terminating it.
   * The agent should be resumable via {@link resume}.
   *
   * @param handle - The handle of the agent to pause.
   */
  pause(handle: AgentHandle): Promise<void>;

  /**
   * Resume a previously paused agent, restoring its context.
   *
   * @param handle  - The handle of the agent to resume.
   * @param context - Context to inject when resuming.
   */
  resume(handle: AgentHandle, context: AgentResumeContext): Promise<void>;

  /**
   * Permanently terminate an agent.
   *
   * @param handle - The handle of the agent to terminate.
   */
  terminate(handle: AgentHandle): Promise<void>;

  /**
   * Check whether an agent is still alive and responsive.
   *
   * @param handle - The handle of the agent to check.
   * @returns `true` if the agent is alive, `false` otherwise.
   */
  isAlive(handle: AgentHandle): Promise<boolean>;

  /**
   * Send an intercom message to a running agent.
   *
   * @param handle  - The handle of the target agent.
   * @param message - The intercom message to deliver.
   */
  sendMessage(handle: AgentHandle, message: IntercomMessage): Promise<void>;

  /**
   * Register a callback to receive intercom messages from an agent.
   *
   * @param handle   - The handle of the agent to listen to.
   * @param callback - Invoked with each incoming {@link IntercomMessage}.
   */
  onMessage(handle: AgentHandle, callback: (message: IntercomMessage) => void): void;

  /**
   * Register a callback to receive agent lifecycle status changes.
   *
   * @param handle   - The handle of the agent to monitor.
   * @param callback - Invoked with each new {@link AgentStatus}.
   */
  onStatusChange(handle: AgentHandle, callback: (status: AgentStatus) => void): void;

  /**
   * Register a callback to receive periodic usage reports from an agent.
   *
   * @param handle   - The handle of the agent to monitor.
   * @param callback - Invoked with each {@link AgentUsageReport}.
   */
  onUsageReport(handle: AgentHandle, callback: (report: AgentUsageReport) => void): void;
}
