/** Craft lifecycle status values. */
export type CraftStatus =
  | "Taxiing"
  | "InFlight"
  | "LandingChecklist"
  | "ClearedToLand"
  | "GoAround"
  | "Emergency"
  | "Landed"
  | "ReturnToOrigin";

/** Vector status within a flight plan. */
export type VectorStatus = "Pending" | "Passed" | "Failed";

/** Agent lifecycle status. */
export type AgentStatus = "running" | "paused" | "suspended" | "terminated";

/** Black box entry type. */
export type BlackBoxEntryType =
  | "Decision"
  | "VectorPassed"
  | "GoAround"
  | "Conflict"
  | "Observation"
  | "EmergencyDeclaration"
  | "ChecklistRun"
  | "ChecklistItem"
  | "TFRIssued"
  | "TFRLifted"
  | "CraftCreated"
  | "Launched"
  | "VectorFailed"
  | "ClearanceRequested"
  | "TowerEnqueued"
  | "TowerDequeued"
  | "StateTransition"
  | "AgentOutput"
  | "Merge"
  | "MergeStale"
  | "MergeConflict";

export interface SystemNotification {
  source: string;
  summary: string;
  outcome: "passed" | "failed" | "advisory-only";
  blackBoxEntryIndex: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

export interface VectorState {
  name: string;
  acceptanceCriteria: string;
  status: VectorStatus;
  evidence?: string;
  reportedAt?: string;
}

export interface BlackBoxEntry {
  timestamp: string;
  author: string;
  type: BlackBoxEntryType;
  content: string;
}

export interface ControlState {
  mode: "exclusive" | "shared";
  holder?: string;
  sharedAreas?: { pilotId: string; area: string }[];
}

export interface IntercomMessage {
  from: string;
  seat: string;
  content: string;
  timestamp: string;
}

export interface CraftState {
  callsign: string;
  createdAt: string;
  branch: string;
  cargo: string;
  category: string;
  status: CraftStatus;
  captain: string;
  firstOfficers: string[];
  jumpseaters: string[];
  flightPlan: VectorState[];
  blackBox: BlackBoxEntry[];
  intercom: IntercomMessage[];
  controls: ControlState;
}

export interface ProjectMetadata {
  name: string;
  remoteUrl: string;
  categories: string[];
  checklist: { name: string; command: string; timeout?: number }[];
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
}

export interface AgentRecord {
  id: string;
  adapterType: string;
  pid?: number;
  projectName: string;
  callsign: string;
  status: AgentStatus;
  adapterMeta: Record<string, unknown>;
}

export interface PilotRecord {
  identifier: string;
  certifications: string[];
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

export interface StatusResponse {
  profile: string;
  projects: number;
  crafts: number;
  agents: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface AgentUsageReport {
  agentId: string;
  callsign: string;
  timestamp: string;
  tokens: TokenUsage;
  tools: { name: string; calls: number; failures: number }[];
  skills: { name: string; invocations: number }[];
  duration: number;
}

export interface GlobalConfig {
  defaultProfile: string;
}

export interface ProfileConfig {
  port: number;
  host: string;
  logLevel: "debug" | "info" | "warn" | "error";
  autoRecover: boolean;
  wsHeartbeatInterval: number;
  stateFlushInterval: number;
}

export interface PilotConfig {
  certifications: string[];
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  skills: string[];
}

export interface ConfigResponse<T> {
  config: T;
  overrides: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// WebSocket types
// ---------------------------------------------------------------------------

export interface WsEvent {
  type: "event";
  channel: string;
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export type WsServerMessage =
  | { type: "connected"; sessionId: string }
  | WsEvent
  | { type: "ping" }
  | { type: "pong"; timestamp: string };

export type WsClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string }
  | { type: "ping" }
  | { type: "pong" };

// ---------------------------------------------------------------------------
// Spec-Driven Development (SDD) types — §2.7 and §4.6
// ---------------------------------------------------------------------------

/** A single vector entry in a spec document. @see RULE-SDD-2 */
export interface SpecVector {
  name: string;
  criteria: string[];
}

/** Pilot assignment overrides in a spec document. @see RULE-SDD-6 @see RULE-SDD-7 */
export interface SpecPilots {
  captain?: string;
  firstOfficers?: string[];
  requireCertifications?: string[];
  maxFirstOfficers?: number;
}

/**
 * Structured spec document submitted to ATC to automatically create a craft.
 * @see RULE-SDD-1 through RULE-SDD-4
 */
export interface SpecDocument {
  title: string;
  cargo: string;
  category: string;
  vectors: SpecVector[];
  callsign?: string;
  autoLaunch?: boolean;
  notes?: string;
  pilots?: SpecPilots;
  metadata?: Record<string, unknown>;
}

/** SDD error codes returned by POST /api/v1/projects/:name/crafts/from-spec. @see §4.6.8 */
export type SddErrorCode =
  | "SPEC_PARSE_ERROR"
  | "SPEC_VALIDATION_ERROR"
  | "UNKNOWN_CATEGORY"
  | "CALLSIGN_CONFLICT"
  | "NO_CERTIFIED_PILOT"
  | "PILOT_NOT_CERTIFIED"
  | "PILOT_ROLE_CONFLICT"
  | "BRANCH_CREATION_FAILED";

/** Human-readable messages for each SDD error code. */
export const SDD_ERROR_MESSAGES: Record<SddErrorCode, string> = {
  SPEC_PARSE_ERROR: "Spec document is malformed YAML/JSON — check syntax and try again.",
  SPEC_VALIDATION_ERROR:
    "Spec is missing required fields. Ensure title, cargo, category, and at least one vector are present.",
  UNKNOWN_CATEGORY: "Category does not match any project-configured categories.",
  CALLSIGN_CONFLICT:
    "This callsign is already in use. Remove the callsign override to auto-generate one.",
  NO_CERTIFIED_PILOT:
    "No available pilot holds the required certification for this category.",
  PILOT_NOT_CERTIFIED:
    "A named pilot does not hold the required certification for this category.",
  PILOT_ROLE_CONFLICT: "The same pilot cannot be both captain and first officer.",
  BRANCH_CREATION_FAILED: "Git branch could not be created. The craft was not saved — try again.",
};

/**
 * Daemon representation of a Temporary Flight Restriction.
 * Mirrors the TfrState interface in @airtrafficcontrol/daemon.
 */
export interface TfrState {
  identifier: string;
  scope: "global" | "project" | "craft";
  target: string | null;
  mode: "graceful" | "immediate";
  reason: string;
  issuedBy: "user" | "tower";
  issuedAt: string;
  liftedAt: string | null;
}

// ---------------------------------------------------------------------------
// Craft diff types — used by the diff view component
// ---------------------------------------------------------------------------

/** A file changed between the craft branch and its base branch. */
export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted";
}

/**
 * Response from GET /api/v1/projects/:name/crafts/:callsign/diff.
 * @see RULE-CRAFT-1
 */
export interface CraftDiffResponse {
  baseBranch: string;
  craftBranch: string;
  files: DiffFile[];
}

/**
 * Response from GET /api/v1/projects/:name/crafts/:callsign/diff/files/{filePath}.
 * `original` is null for added files; `modified` is null for deleted files.
 * Both are null and `binary` is true for binary files.
 */
export interface CraftDiffFileResponse {
  path: string;
  original: string | null;
  modified: string | null;
  binary?: boolean;
}
