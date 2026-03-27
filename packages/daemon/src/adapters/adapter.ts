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
  /** System prompt text injected into the agent's context at startup. */
  systemPrompt: string;
  /** Prior intercom messages to replay into the agent's context. */
  intercomHistory: IntercomMessage[];
  /** Adapter-specific configuration key/value pairs. */
  adapterConfig: Record<string, unknown>;
  /** Named MCP server configurations to make available to the agent. */
  mcpServers: Record<string, McpServerConfig>;
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
