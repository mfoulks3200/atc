/**
 * Daemon-specific type definitions for the ATC daemon process.
 *
 * These types cover configuration, runtime state, agent lifecycle,
 * WebSocket messaging, and usage reporting used throughout @atc/daemon.
 *
 * @see RULE-CRAFT-1 through RULE-CRAFT-8 for craft lifecycle constraints.
 * @see RULE-CTRL-1 through RULE-CTRL-5 for controls state rules.
 */

import type { BlackBoxEntryType, CraftStatus } from "@atc/types";

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/**
 * Top-level global configuration.
 * Specifies which named profile is active when the daemon starts.
 */
export interface GlobalConfig {
  /** The name of the profile to use by default. */
  defaultProfile: string;
}

/**
 * Per-profile daemon runtime configuration.
 * Controls networking, logging, persistence, and the underlying adapter.
 */
export interface ProfileConfig {
  /** TCP port the daemon HTTP/WS server listens on. */
  port: number;
  /** Hostname or IP address to bind. */
  host: string;
  /** Minimum log severity level. */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Whether the daemon should automatically attempt recovery on unexpected shutdown. */
  autoRecover: boolean;
  /** Interval in milliseconds between WebSocket heartbeat pings. */
  wsHeartbeatInterval: number;
  /** Interval in milliseconds between state flushes to persistent storage. */
  stateFlushInterval: number;
  /** Configuration for the agent adapter. */
  adapter: AdapterConfig;
}

/**
 * Configuration for a pluggable agent adapter.
 * The `type` string selects the adapter implementation; `config` is passed through.
 */
export interface AdapterConfig {
  /** Adapter identifier (e.g. "claude-agent-sdk", "mock"). */
  type: string;
  /** Adapter-specific configuration key/value pairs. */
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Project metadata
// ---------------------------------------------------------------------------

/**
 * Metadata describing a registered project (repository) managed by the daemon.
 */
export interface ProjectMetadata {
  /** Human-readable project name. */
  name: string;
  /** Git remote URL for the project repository. */
  remoteUrl: string;
  /** Category tags used to match crafts to projects. */
  categories: string[];
  /** Ordered list of checklist items that must pass before merging. */
  checklist: ChecklistItemConfig[];
  /** Named MCP server configurations available to agents on this project. */
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * A single checklist step that runs a command and verifies it exits cleanly.
 *
 * @see RULE-VEC-3 for acceptance criteria verification requirements.
 */
export interface ChecklistItemConfig {
  /** Display name for this checklist step. */
  name: string;
  /** Shell command to execute. */
  command: string;
  /** Optional timeout in milliseconds before the step is considered failed. */
  timeout?: number;
}

/**
 * Configuration for spawning an MCP (Model Context Protocol) server process.
 */
export interface McpServerConfig {
  /** Executable to run. */
  command: string;
  /** Arguments passed to the executable. */
  args: string[];
  /** Optional environment variables for the server process. */
  env?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Agent runtime types
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of a running agent process.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */
export type AgentStatus = "running" | "paused" | "suspended" | "terminated";

/**
 * A live record of an agent managed by the daemon.
 *
 * @see RULE-PILOT-1 for pilot identity rules.
 * @see RULE-SEAT-1 through RULE-SEAT-3 for seat assignment rules.
 */
export interface AgentRecord {
  /** Unique agent identifier (UUID). */
  id: string;
  /** Adapter type used to launch this agent (e.g. "claude-agent-sdk"). */
  adapterType: string;
  /** OS process ID, if the agent is backed by a subprocess. */
  pid?: number;
  /** Name of the project this agent is operating on. */
  projectName: string;
  /** Aviation callsign assigned to this agent's craft. */
  callsign: string;
  /** Current lifecycle status of the agent. */
  status: AgentStatus;
  /** Adapter-specific metadata (e.g. session IDs, connection info). */
  adapterMeta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Craft state types (persisted daemon representation)
// ---------------------------------------------------------------------------

/**
 * Persisted state of a single vector within a craft's flight plan.
 *
 * @see RULE-VEC-1 through RULE-VEC-5 for vector rules.
 */
export interface VectorState {
  /** Vector name / title. */
  name: string;
  /** Human-readable acceptance criteria for this vector. */
  acceptanceCriteria: string;
  /** Current pass/fail/pending status. */
  status: "Pending" | "Passed" | "Failed";
  /** Optional evidence string submitted when the vector was evaluated. */
  evidence?: string;
  /** ISO-8601 timestamp when the vector was reported on. */
  reportedAt?: string;
}

/**
 * A single entry in a craft's black box event log.
 *
 * @see RULE-BB-1 through RULE-BB-4 for black box rules.
 */
export interface BlackBoxEntry {
  /** ISO-8601 timestamp of the event. */
  timestamp: string;
  /** Callsign or system identifier of the author. */
  author: string;
  /** Semantic type of the log entry. */
  type: BlackBoxEntryType;
  /** Human-readable content of the log entry. */
  content: string;
}

/**
 * Current state of controls on a craft.
 *
 * @see RULE-CTRL-1 through RULE-CTRL-5 for controls rules.
 */
export interface ControlState {
  /** Whether controls are held exclusively or shared between pilots. */
  mode: "exclusive" | "shared";
  /** Pilot ID of the exclusive holder, if mode is "exclusive". */
  holder?: string;
  /** List of pilots and their shared areas, if mode is "shared". */
  sharedAreas?: { pilotId: string; area: string }[];
}

/**
 * A message recorded in a craft's intercom (in-flight communication log).
 *
 * @see RULE-CRAFT-5 for intercom usage constraints.
 */
export interface IntercomMessage {
  /** Sender callsign or pilot ID. */
  from: string;
  /** Seat type of the sender (captain, firstOfficer, jumpseat). */
  seat: string;
  /** Message body. */
  content: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
}

/**
 * Full persisted state of a single craft, as maintained by the daemon.
 *
 * @see RULE-CRAFT-1 through RULE-CRAFT-8 for craft rules.
 */
export interface CraftState {
  /** Unique aviation callsign (matches the git branch name). */
  callsign: string;
  /** Git branch name this craft is tied to. */
  branch: string;
  /** Human-readable description of the work (the "cargo"). */
  cargo: string;
  /** Category tag used for project routing. */
  category: string;
  /** Current craft lifecycle status. */
  status: CraftStatus;
  /** Pilot ID of the captain (pilot-in-command). */
  captain: string;
  /** Pilot IDs of all first officers aboard. */
  firstOfficers: string[];
  /** Pilot IDs of all jumpseaters (observers). */
  jumpseaters: string[];
  /** Ordered list of vectors in the flight plan. */
  flightPlan: VectorState[];
  /** Append-only black box event log. */
  blackBox: BlackBoxEntry[];
  /** In-flight intercom message history. */
  intercom: IntercomMessage[];
  /** Current controls state. */
  controls: ControlState;
}

// ---------------------------------------------------------------------------
// WebSocket message types
// ---------------------------------------------------------------------------

/**
 * A WebSocket event payload pushed from the daemon to a subscribed client.
 */
export interface WsEvent {
  type: "event";
  /** Channel identifier (e.g. "craft:my-branch", "tower"). */
  channel: string;
  /** Domain event name (e.g. "craft.status.changed"). */
  event: string;
  /** ISO-8601 timestamp of the event. */
  timestamp: string;
  /** Event-specific data payload. */
  data: Record<string, unknown>;
}

/**
 * Discriminated union of all messages a WebSocket client may send to the daemon.
 */
export type WsClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string }
  | { type: "ping" }
  | { type: "pong" };

/**
 * Discriminated union of all messages the daemon may push to WebSocket clients.
 */
export type WsServerMessage =
  | { type: "connected"; sessionId: string }
  | WsEvent
  | { type: "ping" }
  | { type: "pong" };

// ---------------------------------------------------------------------------
// Usage reporting types
// ---------------------------------------------------------------------------

/**
 * Token usage counts for a single agent session or report window.
 */
export interface TokenUsage {
  /** Number of input tokens consumed. */
  input: number;
  /** Number of output tokens produced. */
  output: number;
  /** Number of tokens read from the prompt cache, if applicable. */
  cacheRead?: number;
  /** Number of tokens written to the prompt cache, if applicable. */
  cacheWrite?: number;
}

/**
 * Usage statistics for a single tool across an agent session.
 */
export interface ToolUsageEntry {
  /** Tool name. */
  name: string;
  /** Total number of calls made. */
  calls: number;
  /** Number of calls that resulted in an error or failure. */
  failures: number;
}

/**
 * Usage statistics for a single skill across an agent session.
 */
export interface SkillUsageEntry {
  /** Skill name. */
  name: string;
  /** Total number of times the skill was invoked. */
  invocations: number;
}

/**
 * Aggregated usage report for one agent over a reporting period.
 */
export interface AgentUsageReport {
  /** Unique agent identifier. */
  agentId: string;
  /** Aviation callsign for the agent's craft. */
  callsign: string;
  /** ISO-8601 timestamp of when this report was generated. */
  timestamp: string;
  /** Token consumption breakdown. */
  tokens: TokenUsage;
  /** Per-tool usage statistics. */
  tools: ToolUsageEntry[];
  /** Per-skill usage statistics. */
  skills: SkillUsageEntry[];
  /** Total active duration in milliseconds. */
  duration: number;
}
