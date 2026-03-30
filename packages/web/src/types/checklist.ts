export type ChecklistItemSeverity = "required" | "advisory";

export interface ShellExecutor {
  type: "shell";
  command: string;
}

export interface McpToolExecutor {
  type: "mcp-tool";
  tool: string;
  params: Record<string, unknown>;
}

export type ChecklistExecutor = ShellExecutor | McpToolExecutor;

export interface ChecklistItemDef {
  name: string;
  description?: string;
  severity: ChecklistItemSeverity;
  executor: ChecklistExecutor;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  description?: string;
  items: ChecklistItemDef[];
}

export interface ChecklistBinding {
  templateId: string;
  event: string;
  craftCategory: string;
}

export interface ChecklistItemResult {
  name: string;
  passed: boolean;
  severity: ChecklistItemSeverity;
  message?: string;
  output?: string;
  durationMs: number;
}

export interface ChecklistRunResult {
  checklistName: string;
  event: string;
  craftCallsign: string;
  attempt: number;
  timestamp: string;
  passed: boolean;
  items: ChecklistItemResult[];
}
