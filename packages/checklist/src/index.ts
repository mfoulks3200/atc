// Types (re-exported from @atc/types via local types.ts)
export type {
  ChecklistItemDef,
  ChecklistTemplate,
  ChecklistBinding,
  CraftChecklistOverride,
  ChecklistItemResult,
  ChecklistRunResult,
  ChecklistExecutor,
  ShellExecutor,
  McpToolExecutor,
} from "./types.js";
export { ChecklistItemSeverity } from "./types.js";

// Runner
export { runChecklist } from "./runner.js";
export type { RunChecklistInput } from "./runner.js";

// Defaults
export { DEFAULT_LANDING_TEMPLATE } from "./defaults.js";

// Template registry
export { createTemplateRegistry } from "./templates.js";
export type { CreateTemplateInput, UpdateTemplateInput } from "./templates.js";

// Binding registry
export { createBindingRegistry } from "./bindings.js";

// Override store
export { createOverrideStore } from "./overrides.js";

// Resolution
export { resolveChecklist } from "./resolve.js";
export type { ResolvedChecklist, ResolveInput } from "./resolve.js";

// Executors
export { executeShell } from "./executor/shell.js";
export type { ShellExecResult } from "./executor/shell.js";
export { executeMcpTool } from "./executor/mcp-tool.js";
export type { McpToolExecResult, McpToolHandler } from "./executor/mcp-tool.js";
