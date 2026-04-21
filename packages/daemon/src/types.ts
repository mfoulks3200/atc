/**
 * Daemon-specific type definitions for the ATC daemon process.
 *
 * These types cover configuration, runtime state, agent lifecycle,
 * WebSocket messaging, and usage reporting used throughout @airtrafficcontrol/daemon.
 *
 * @see RULE-CRAFT-1 through RULE-CRAFT-8 for craft lifecycle constraints.
 * @see RULE-CTRL-1 through RULE-CTRL-5 for controls state rules.
 */

import type { BlackBoxEntryType, CraftStatus, SpecVectorCommand } from "@airtrafficcontrol/types";

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export type { GlobalConfig, ProfileConfig, AdapterConfig } from "./config/schema.js";

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
  /** Pilot identifier this agent is acting as (captain or first officer id). */
  pilotId?: string;
  /** Current lifecycle status of the agent. */
  status: AgentStatus;
  /** Adapter-specific metadata (e.g. session IDs, connection info). */
  adapterMeta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Craft state types (persisted daemon representation)
// ---------------------------------------------------------------------------

/**
 * Result of a vector command execution, persisted in VectorState.
 * @see RULE-VCMD-11
 */
export interface VectorCommandResult {
  /** Outcome of the command run. */
  status: "passed" | "failed" | "timed_out";
  /** Exit code (present when status is failed or timed_out). */
  exitCode?: number;
  /** Captured stdout, truncated to 4096 chars in API responses (64 KB in black box). */
  stdout: string;
  /** Captured stderr, truncated to 4096 chars in API responses (16 KB in black box). */
  stderr: string;
  /** ISO-8601 timestamp when the command ran. */
  ranAt: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Whether the command was killed due to timeout. */
  timedOut: boolean;
}

/**
 * Persisted state of a single vector within a craft's flight plan.
 *
 * @see RULE-VEC-1 through RULE-VEC-5 for vector rules.
 * @see RULE-VCMD-11 for commandResult lifecycle.
 */
export interface VectorState {
  /** Vector name / title. */
  name: string;
  /**
   * Natural language acceptance criteria. Absent when the vector has a
   * command-only gate. When both `criteria` and `command` are present,
   * `criteria` documents the human intent behind the command.
   * @see RULE-SDD-2, RULE-VCMD-2
   */
  criteria?: string[];
  /**
   * Legacy single-string acceptance criteria field. Kept for backward
   * compatibility with existing craft records. New vectors created via SDD
   * use `criteria[]` instead.
   * @deprecated Use `criteria` array instead.
   */
  acceptanceCriteria?: string;
  /** Optional machine-executable verification gate. @see RULE-VCMD-1 */
  command?: SpecVectorCommand;
  /**
   * Gate type derived from whether `command` is present.
   * `"nl"` = natural-language only; `"command"` = has command gate.
   * @see RULE-VCMD-1
   */
  gateType?: "nl" | "command";
  /** Current pass/fail/pending status. */
  status: "Pending" | "Passed" | "Failed";
  /**
   * Last command execution result. Populated after the first command run;
   * updated on each subsequent run. Absent for NL-only vectors.
   * @see RULE-VCMD-11
   */
  commandResult?: VectorCommandResult;
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
  /** ISO-8601 timestamp when the craft was created (flight plan opened). */
  createdAt: string;
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
  /** Whether this craft is paused by a TFR. @see RULE-TFR-5 */
  holdingPattern: boolean;
}

/**
 * Persisted state of a Temporary Flight Restriction, as maintained by the daemon.
 *
 * @see RULE-TFR-1 through RULE-TFR-8
 */
export interface TfrState {
  /** Unique TFR identifier. */
  identifier: string;
  /** Scope: "global", "project", or "craft". */
  scope: "global" | "project" | "craft";
  /** Project name (scope=project) or callsign (scope=craft). Null for global. */
  target: string | null;
  /** Enforcement mode: "graceful" or "immediate". */
  mode: "graceful" | "immediate";
  /** Why the TFR was issued. */
  reason: string;
  /** Who issued the TFR: "user" or "tower". */
  issuedBy: "user" | "tower";
  /** ISO-8601 timestamp when the TFR was issued. */
  issuedAt: string;
  /** ISO-8601 timestamp when the TFR was lifted. Null while active. */
  liftedAt: string | null;
}

// ---------------------------------------------------------------------------
// Pilot record types
// ---------------------------------------------------------------------------

/**
 * A registered pilot within a project.
 *
 * @see RULE-PILOT-1 for pilot identity rules.
 * @see RULE-SEAT-1 through RULE-SEAT-3 for seat assignment rules.
 */
export interface PilotRecord {
  /** Unique pilot identifier. */
  identifier: string;
  /** List of certifications held by the pilot (e.g. "captain", "firstOfficer"). */
  certifications: string[];
  /** Named MCP server configurations available to this pilot. */
  mcpServers: Record<string, McpServerConfig>;
  /**
   * Optional role-specific context appended to the ATC pilot briefing when
   * this pilot is launched. Use this to describe specializations, preferred
   * patterns, or standing instructions that go beyond the generic briefing.
   */
  systemPrompt?: string;
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
  | { type: "pong" }
  | { type: "config.patch"; scope: "global"; body: Record<string, unknown>; requestId: string }
  | { type: "config.replace"; scope: "global"; body: Record<string, unknown>; requestId: string }
  | { type: "config.unset"; scope: "global"; key: string; requestId: string }
  | { type: "config.patch"; scope: "project"; project: string; body: Record<string, unknown>; requestId: string }
  | { type: "config.replace"; scope: "project"; project: string; body: Record<string, unknown>; requestId: string }
  | { type: "config.unset"; scope: "project"; project: string; key: string; requestId: string }
  | { type: "config.patch"; scope: "pilot"; pilotId: string; body: Record<string, unknown>; requestId: string }
  | { type: "config.replace"; scope: "pilot"; pilotId: string; body: Record<string, unknown>; requestId: string }
  | { type: "config.unset"; scope: "pilot"; pilotId: string; key: string; requestId: string };

/**
 * Discriminated union of all messages the daemon may push to WebSocket clients.
 */
export type WsServerMessage =
  | { type: "connected"; sessionId: string }
  | WsEvent
  | { type: "ping" }
  | { type: "pong"; timestamp: string }
  | {
      type: "config.ack";
      requestId: string;
      ok: true;
      config: Record<string, unknown>;
    }
  | {
      type: "config.ack";
      requestId: string;
      ok: false;
      error: { code: string; message: string; issues?: unknown[] };
    };

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
