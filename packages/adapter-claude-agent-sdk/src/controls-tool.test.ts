import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { createControlsMcpServer } from "./controls-tool.js";

describe("createControlsMcpServer", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: MockInstance<any>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ mode: "exclusive", holder: "fo-1" }), { status: 200 }),
      );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function getTools(cfg: ReturnType<typeof createControlsMcpServer>) {
    return (
      cfg.instance as unknown as {
        _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
      }
    )._registeredTools;
  }

  it("registers both controls_transfer and controls_read tools", () => {
    const cfg = createControlsMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "proj",
      callsign: "ALPHA",
      pilotId: "captain-1",
    });
    const tools = getTools(cfg);
    expect(tools.controls_transfer).toBeDefined();
    expect(tools.controls_read).toBeDefined();
  });

  it("controls_transfer POSTs to /controls/claim with the target pilotId", async () => {
    const cfg = createControlsMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "BRAVO",
      pilotId: "captain-1",
    });
    const result = (await getTools(cfg).controls_transfer.handler({
      targetPilotId: "fo-bravo",
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:7700/api/v1/projects/demo/crafts/BRAVO/controls/claim",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pilotId: "fo-bravo" }),
      }),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("transferred to fo-bravo");
  });

  it("controls_transfer returns isError when the daemon returns non-ok", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("jumpseat not allowed", { status: 403 }));
    const cfg = createControlsMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "BRAVO",
      pilotId: "captain-1",
    });
    const result = (await getTools(cfg).controls_transfer.handler({
      targetPilotId: "jump-1",
    })) as { content: Array<{ text: string }>; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("403");
  });

  it("controls_read GETs the controls endpoint and returns the state", async () => {
    const cfg = createControlsMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "BRAVO",
      pilotId: "captain-1",
    });
    const result = (await getTools(cfg).controls_read.handler({})) as {
      content: Array<{ text: string }>;
    };
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:7700/api/v1/projects/demo/crafts/BRAVO/controls",
    );
    expect(result.content[0].text).toContain("fo-1");
    expect(result.content[0].text).toContain("exclusive");
  });
});
