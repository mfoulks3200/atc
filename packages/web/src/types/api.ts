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
  | "ChecklistRun";

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
