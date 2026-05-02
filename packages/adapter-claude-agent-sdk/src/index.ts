/**
 * @airtrafficcontrol/adapter-claude-agent-sdk — Public API barrel export.
 *
 * Exports the real Claude Agent SDK adapter and the system prompt builder
 * used to initialize agent context at launch time.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */

export {
  ClaudeAgentSdkAdapter,
  DEFAULT_MODEL,
  type ClaudeAgentSdkAdapterDeps,
  type QueryFn,
} from "./adapter.js";
export {
  buildSystemPrompt,
  deriveSeat,
  MAX_SYSTEM_PROMPT_TOKENS,
  MAX_BLACK_BOX_ENTRIES,
} from "./prompt-builder.js";
export {
  createControlsCanUseTool,
  decideForFileModification,
  decideForBash,
  normalizeFilePath,
  isFileInPilotArea,
  type ControlsSnapshot,
  type ControlsEnforcerContext,
  type EnforcementDecision,
} from "./controls-enforcer.js";
