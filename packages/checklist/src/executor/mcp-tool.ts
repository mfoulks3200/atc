const MAX_OUTPUT_LINES = 500;

/**
 * Result of executing an MCP tool.
 */
export interface McpToolExecResult {
  readonly passed: boolean;
  readonly output: string;
  readonly durationMs: number;
}

/**
 * Handler function that invokes an MCP tool.
 * Injected by the caller to decouple from MCP transport.
 */
export type McpToolHandler = (
  tool: string,
  params: Readonly<Record<string, unknown>>,
) => Promise<{ passed: boolean; output: string }>;

/**
 * Executes an MCP tool via the provided handler and returns pass/fail.
 *
 * @param tool - MCP tool name.
 * @param params - Parameters to pass to the tool.
 * @param handler - Function that performs the actual MCP call.
 * @returns Execution result with pass/fail, output, and duration.
 * @see RULE-CHKL-1
 */
export async function executeMcpTool(
  tool: string,
  params: Readonly<Record<string, unknown>>,
  handler: McpToolHandler,
): Promise<McpToolExecResult> {
  const start = performance.now();

  try {
    const result = await handler(tool, params);
    const durationMs = Math.round(performance.now() - start);
    const lines = result.output.split("\n");
    const output = lines.slice(-MAX_OUTPUT_LINES).join("\n");

    return { passed: result.passed, output, durationMs };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    const message = error instanceof Error ? error.message : String(error);

    return { passed: false, output: message, durationMs };
  }
}
