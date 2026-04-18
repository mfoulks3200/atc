/**
 * Real {@link AgentAdapter} implementation backed by the
 * `@anthropic-ai/claude-agent-sdk` `query()` primitive.
 *
 * Each launched agent owns one long-lived {@link Query} session. User-side
 * intercom messages are pushed into an input generator so the SDK runs in
 * streaming-input mode (a prerequisite for `interrupt()`). Assistant output,
 * lifecycle events, and usage reports produced by the SDK are forwarded to
 * callers via the registered {@link AgentAdapter} callbacks.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 * @see RULE-CRAFT-5 for intercom usage constraints.
 */

import type {
  AgentAdapter,
  AgentHandle,
  AgentLaunchOptions,
  AgentResumeContext,
  AgentStatus,
  AgentUsageReport,
  IntercomMessage,
  McpServerConfig,
} from "@airtrafficcontrol/daemon";
import type {
  McpStdioServerConfig,
  Options,
  Query,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { query as defaultQuery } from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt } from "./prompt-builder.js";

/**
 * Default Claude model used by the adapter.
 *
 * Opus 4.6 is the recommended model for agentic coding work. Callers may
 * override via `adapterConfig.model` on {@link AgentLaunchOptions}.
 */
export const DEFAULT_MODEL = "claude-opus-4-6";

/**
 * Shape of the `query` function from `@anthropic-ai/claude-agent-sdk`.
 *
 * Extracted so tests can inject a fake SDK client without depending on the
 * real transport (which spawns a Claude Code subprocess).
 */
export type QueryFn = (params: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}) => Query;

/**
 * Constructor dependencies for {@link ClaudeAgentSdkAdapter}.
 */
export interface ClaudeAgentSdkAdapterDeps {
  /** Override the SDK `query` implementation (used by tests). */
  query?: QueryFn;
}

/**
 * Per-agent runtime state tracked inside the adapter.
 */
interface AgentSession {
  readonly agentId: string;
  readonly worktreePath: string;
  readonly query: Query;
  readonly pushInput: (msg: SDKUserMessage) => void;
  readonly closeInput: () => void;
  status: AgentStatus;
  messageListeners: Array<(msg: IntercomMessage) => void>;
  statusListeners: Array<(status: AgentStatus) => void>;
  usageListeners: Array<(report: AgentUsageReport) => void>;
  callsign: string;
  /** Pilot identifier used as `from` in outgoing intercom messages. */
  pilotId: string;
  consumer: Promise<void>;
}

/**
 * Create an async input generator and a `push`/`close` pair that feeds into it.
 *
 * The Claude Agent SDK accepts an `AsyncIterable<SDKUserMessage>` as its
 * `prompt` argument for streaming-input mode. This helper bridges an
 * imperative "send a message" API to that iterable contract.
 */
function createInputChannel(): {
  iterable: AsyncIterable<SDKUserMessage>;
  push: (msg: SDKUserMessage) => void;
  close: () => void;
} {
  const pending: SDKUserMessage[] = [];
  const waiters: Array<(value: IteratorResult<SDKUserMessage>) => void> = [];
  let closed = false;

  const push = (msg: SDKUserMessage): void => {
    if (closed) return;
    const waiter = waiters.shift();
    if (waiter !== undefined) {
      waiter({ value: msg, done: false });
    } else {
      pending.push(msg);
    }
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter?.({ value: undefined, done: true });
    }
  };

  const iterable: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
      return {
        next(): Promise<IteratorResult<SDKUserMessage>> {
          const buffered = pending.shift();
          if (buffered !== undefined) {
            return Promise.resolve({ value: buffered, done: false });
          }
          if (closed) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise((resolve) => {
            waiters.push(resolve);
          });
        },
        return(): Promise<IteratorResult<SDKUserMessage>> {
          close();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };

  return { iterable, push, close };
}

/**
 * Convert a daemon-level {@link McpServerConfig} into the SDK's stdio shape.
 */
function toSdkMcpServers(
  servers: Record<string, McpServerConfig>,
): Record<string, McpStdioServerConfig> {
  const out: Record<string, McpStdioServerConfig> = {};
  for (const [name, cfg] of Object.entries(servers)) {
    out[name] = {
      type: "stdio",
      command: cfg.command,
      args: cfg.args,
      env: cfg.env,
    };
  }
  return out;
}

/**
 * Build an {@link SDKUserMessage} from an {@link IntercomMessage}.
 */
function toSdkUserMessage(msg: IntercomMessage): SDKUserMessage {
  const text = `[intercom] ${msg.from} (${msg.seat}): ${msg.content}`;
  return {
    type: "user",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [{ type: "text", text }],
    },
  };
}

/**
 * Build an initial kickoff {@link SDKUserMessage} from craft state.
 */
function buildKickoff(cargo: string): SDKUserMessage {
  return {
    type: "user",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [
        {
          type: "text",
          text: `Begin work on your assigned cargo:\n\n${cargo}`,
        },
      ],
    },
  };
}

/**
 * Real Claude Agent SDK adapter.
 *
 * Wraps `query()` from `@anthropic-ai/claude-agent-sdk` and surfaces the
 * streaming message loop through the {@link AgentAdapter} interface.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */
export class ClaudeAgentSdkAdapter implements AgentAdapter {
  private readonly _query: QueryFn;
  private readonly _sessions: Map<string, AgentSession> = new Map();

  /**
   * @param deps - Optional dependency overrides (primarily for tests).
   */
  constructor(deps: ClaudeAgentSdkAdapterDeps = {}) {
    this._query = deps.query ?? (defaultQuery as unknown as QueryFn);
  }

  /**
   * Launch a new agent session.
   *
   * Constructs an SDK {@link Query} scoped to the craft's worktree, seeds it
   * with the provided system prompt plus a kickoff user message derived from
   * the craft cargo, then spawns a background task that forwards SDK
   * messages to the adapter's registered callbacks.
   *
   * @see RULE-PILOT-1
   */
  async launch(options: AgentLaunchOptions): Promise<AgentHandle> {
    const channel = createInputChannel();

    // Build the pilot briefing automatically from craft state. The caller's
    // provided systemPrompt (if any non-empty) is appended as a project-specific
    // extension so route handlers can add local context without replacing the
    // core briefing.
    const pilotIdForPrompt = options.pilotId ?? options.craft.captain;
    const autoPrompt = buildSystemPrompt(
      options.craft,
      pilotIdForPrompt,
      options.projectName,
    );
    const finalSystemPrompt =
      options.systemPrompt && options.systemPrompt.trim().length > 0
        ? `${autoPrompt}\n\n---\n\n## Project-specific notes\n\n${options.systemPrompt}`
        : autoPrompt;

    const sdkOptions: Options = {
      cwd: options.worktreePath,
      model:
        typeof options.adapterConfig.model === "string"
          ? options.adapterConfig.model
          : DEFAULT_MODEL,
      systemPrompt: finalSystemPrompt,
      mcpServers: toSdkMcpServers(options.mcpServers),
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    };

    const q = this._query({ prompt: channel.iterable, options: sdkOptions });

    channel.push(buildKickoff(options.craft.cargo));
    for (const historic of options.intercomHistory) {
      channel.push(toSdkUserMessage(historic));
    }

    const session: AgentSession = {
      agentId: options.agentId,
      worktreePath: options.worktreePath,
      query: q,
      pushInput: channel.push,
      closeInput: channel.close,
      status: "running",
      messageListeners: [],
      statusListeners: [],
      usageListeners: [],
      callsign: options.craft.callsign,
      pilotId: options.pilotId ?? options.craft.callsign,
      consumer: Promise.resolve(),
    };
    session.consumer = this._consume(session);

    this._sessions.set(options.agentId, session);

    return {
      agentId: options.agentId,
      adapterMeta: { sessionKey: options.agentId },
    };
  }

  /**
   * Pause a running agent by interrupting the in-flight SDK query.
   *
   * @see RULE-PILOT-1
   */
  async pause(handle: AgentHandle): Promise<void> {
    const session = this._sessions.get(handle.agentId);
    if (session === undefined) return;
    await session.query.interrupt();
    this._setStatus(session, "paused");
  }

  /**
   * Resume a paused agent by replaying intercom history as new user messages.
   *
   * @see RULE-PILOT-1
   */
  async resume(handle: AgentHandle, context: AgentResumeContext): Promise<void> {
    const session = this._sessions.get(handle.agentId);
    if (session === undefined) return;
    for (const msg of context.intercomHistory) {
      session.pushInput(toSdkUserMessage(msg));
    }
    this._setStatus(session, "running");
  }

  /**
   * Terminate an agent by closing the SDK query and shutting down the
   * input channel.
   *
   * @see RULE-PILOT-1
   */
  async terminate(handle: AgentHandle): Promise<void> {
    const session = this._sessions.get(handle.agentId);
    if (session === undefined) return;
    this._setStatus(session, "terminated");
    session.closeInput();
    try {
      session.query.close();
    } catch {
      // Swallow close-time errors — the session is already being torn down.
    }
    this._sessions.delete(handle.agentId);
  }

  /**
   * Check whether an agent session is still being tracked and not terminated.
   *
   * @see RULE-PILOT-1
   */
  async isAlive(handle: AgentHandle): Promise<boolean> {
    const session = this._sessions.get(handle.agentId);
    if (session === undefined) return false;
    return session.status !== "terminated";
  }

  /**
   * Forward an intercom message into the agent's input stream.
   *
   * @see RULE-CRAFT-5
   */
  async sendMessage(handle: AgentHandle, message: IntercomMessage): Promise<void> {
    const session = this._sessions.get(handle.agentId);
    if (session === undefined) return;
    session.pushInput(toSdkUserMessage(message));
  }

  /**
   * Register a callback invoked for each assistant text chunk emitted by the SDK.
   *
   * @see RULE-CRAFT-5
   */
  onMessage(handle: AgentHandle, callback: (message: IntercomMessage) => void): void {
    const session = this._sessions.get(handle.agentId);
    if (session === undefined) return;
    session.messageListeners.push(callback);
  }

  /**
   * Register a callback invoked whenever the agent's lifecycle status changes.
   *
   * @see RULE-PILOT-1
   */
  onStatusChange(handle: AgentHandle, callback: (status: AgentStatus) => void): void {
    const session = this._sessions.get(handle.agentId);
    if (session === undefined) return;
    session.statusListeners.push(callback);
  }

  /**
   * Register a callback invoked when the SDK emits an end-of-turn result
   * message containing token/cost usage.
   */
  onUsageReport(handle: AgentHandle, callback: (report: AgentUsageReport) => void): void {
    const session = this._sessions.get(handle.agentId);
    if (session === undefined) return;
    session.usageListeners.push(callback);
  }

  /**
   * Background loop that iterates SDK messages and dispatches them to
   * registered callbacks. Runs for the lifetime of the session.
   */
  private async _consume(session: AgentSession): Promise<void> {
    try {
      for await (const message of session.query) {
        if (session.status === "terminated") break;
        this._dispatch(session, message);
      }
    } catch {
      // Errors in the SDK stream propagate as status changes, not throws,
      // to avoid unhandled rejections in the adapter consumer.
    } finally {
      if (session.status !== "terminated") {
        this._setStatus(session, "terminated");
      }
    }
  }

  /**
   * Route a single SDK message to the appropriate callback list.
   */
  private _dispatch(session: AgentSession, message: SDKMessage): void {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.length > 0) {
          const intercom: IntercomMessage = {
            from: session.pilotId,
            seat: "captain",
            content: block.text,
            timestamp: new Date().toISOString(),
          };
          for (const listener of session.messageListeners) {
            listener(intercom);
          }
        }
      }
      return;
    }

    if (message.type === "result" && message.subtype === "success") {
      const usage = message.usage;
      const report: AgentUsageReport = {
        agentId: session.agentId,
        callsign: session.callsign,
        timestamp: new Date().toISOString(),
        tokens: {
          input: usage.input_tokens ?? 0,
          output: usage.output_tokens ?? 0,
          cacheRead: usage.cache_read_input_tokens ?? undefined,
          cacheWrite: usage.cache_creation_input_tokens ?? undefined,
        },
        tools: [],
        skills: [],
        duration: message.duration_ms,
      };
      for (const listener of session.usageListeners) {
        listener(report);
      }
    }
  }

  /**
   * Update the cached status and fan out to all registered status listeners.
   */
  private _setStatus(session: AgentSession, status: AgentStatus): void {
    if (session.status === status) return;
    session.status = status;
    for (const listener of session.statusListeners) {
      listener(status);
    }
  }
}
