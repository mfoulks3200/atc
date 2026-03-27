/**
 * @atc/daemon — Public API barrel export.
 *
 * Re-exports all public types, classes, and functions from the daemon package.
 *
 * @see RULE-CRAFT-1 through RULE-CRAFT-8 for craft lifecycle rules.
 * @see RULE-PILOT-1 for pilot identity and lifecycle rules.
 * @see RULE-TOWER-1 for tower merge coordination rules.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  GlobalConfig,
  ProfileConfig,
  AdapterConfig,
  ProjectMetadata,
  ChecklistItemConfig,
  McpServerConfig,
  AgentStatus,
  AgentRecord,
  VectorState,
  BlackBoxEntry,
  ControlState,
  IntercomMessage,
  CraftState,
  PilotRecord,
  WsEvent,
  WsClientMessage,
  WsServerMessage,
  TokenUsage,
  ToolUsageEntry,
  SkillUsageEntry,
  AgentUsageReport,
} from "./types.js";

// ---------------------------------------------------------------------------
// Adapter interfaces
// ---------------------------------------------------------------------------

export type {
  AgentAdapter,
  AgentHandle,
  AgentLaunchOptions,
  AgentResumeContext,
} from "./adapters/adapter.js";

// ---------------------------------------------------------------------------
// Daemon class
// ---------------------------------------------------------------------------

export { Daemon } from "./daemon.js";

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export { createApp } from "./server/app.js";
export type { AppOptions } from "./server/app.js";

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

export { AdapterRegistry } from "./adapters/registry.js";

// ---------------------------------------------------------------------------
// State stores
// ---------------------------------------------------------------------------

export { AgentStore } from "./state/agent-store.js";
export { CraftStore } from "./state/craft-store.js";
export { TowerStore } from "./state/tower-store.js";

// ---------------------------------------------------------------------------
// WebSocket channels
// ---------------------------------------------------------------------------

export { ChannelRegistry } from "./server/websocket/channels.js";

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

export {
  loadGlobalConfig,
  loadProfileConfig,
  loadProjectMetadata,
  resolveProfilePath,
} from "./config/loader.js";

// ---------------------------------------------------------------------------
// Config schema defaults
// ---------------------------------------------------------------------------

export { GLOBAL_CONFIG_DEFAULTS, PROFILE_CONFIG_DEFAULTS } from "./config/schema.js";

// ---------------------------------------------------------------------------
// Git utilities
// ---------------------------------------------------------------------------

export { initBareRepo, cloneBareRepo, fetchBareRepo } from "./git/bare-repo.js";
export { createWorktree, removeWorktree } from "./git/worktree.js";

// ---------------------------------------------------------------------------
// Checklist runner
// ---------------------------------------------------------------------------

export { runChecklist } from "./checklist/runner.js";
export type { ChecklistResult, ChecklistItemResult } from "./checklist/runner.js";

// ---------------------------------------------------------------------------
// Process utilities
// ---------------------------------------------------------------------------

export { writePidFile, readPidFile, removePidFile, isProcessAlive } from "./process/pid.js";
