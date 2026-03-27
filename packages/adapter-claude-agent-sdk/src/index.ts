/**
 * @atc/adapter-claude-agent-sdk — Public API barrel export.
 *
 * Exports the stub Claude Agent SDK adapter and the system prompt builder
 * used to initialize agent context at launch time.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */

export { ClaudeAgentSdkAdapter } from "./adapter.js";
export { buildSystemPrompt } from "./prompt-builder.js";
