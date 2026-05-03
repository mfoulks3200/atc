import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { createIntercomMcpServer } from "./intercom-tool.js";

describe("createIntercomMcpServer", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: MockInstance<any>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("produces a server config with the expected name", () => {
    const cfg = createIntercomMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "proj",
      callsign: "ALPHA-1",
      pilotId: "pilot-1",
      seat: "captain",
    });
    expect(cfg.type).toBe("sdk");
    expect(cfg.name).toBe("atc-intercom");
    expect(cfg.instance).toBeDefined();
  });

  it("POSTs to the craft intercom endpoint when the tool is invoked", async () => {
    const cfg = createIntercomMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "BRAVO-2",
      pilotId: "captain-x",
      seat: "captain",
    });
    // Access the tool handler via the registered tools on the MCP server
    // instance. We call it directly to verify the fetch shape.
    const tools = (
      cfg.instance as unknown as {
        _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
      }
    )._registeredTools;
    const sendTool = tools.intercom_send;
    expect(sendTool).toBeDefined();

    const result = (await sendTool.handler({ content: "Hello, crew. Over." })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:7700/api/v1/projects/demo/crafts/BRAVO-2/intercom",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "captain-x",
          seat: "captain",
          content: "Hello, crew. Over.",
        }),
      }),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("broadcast successfully");
  });

  it("reports RULE-CRAFT-1 when the daemon returns 404", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Craft not found: GHOST" }), { status: 404 }),
    );
    const cfg = createIntercomMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "GHOST",
      pilotId: "pilot-1",
      seat: "captain",
    });
    const tools = (
      cfg.instance as unknown as {
        _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
      }
    )._registeredTools;
    const result = (await tools.intercom_send.handler({ content: "hi" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^RULE-CRAFT-1: .+\. .+\.$/);
  });

  it("catches thrown fetch errors and reports them as RULE-MCP-1", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network down"));
    const cfg = createIntercomMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "ALPHA",
      pilotId: "pilot-1",
      seat: "captain",
    });
    const tools = (
      cfg.instance as unknown as {
        _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
      }
    )._registeredTools;
    const result = (await tools.intercom_send.handler({ content: "hi" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^RULE-MCP-1: .+\. .+\.$/);
    expect(result.content[0].text).toContain("network down");
  });
});
