import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { createTowerMcpServer } from "./tower-tool.js";

describe("createTowerMcpServer", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: MockInstance<any>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ granted: true }), { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function getTools(cfg: ReturnType<typeof createTowerMcpServer>) {
    return (
      cfg.instance as unknown as {
        _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
      }
    )._registeredTools;
  }

  it("registers both clearance and merge tools", () => {
    const cfg = createTowerMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "ALPHA",
    });
    const tools = getTools(cfg);
    expect(tools.tower_request_clearance).toBeDefined();
    expect(tools.tower_execute_merge).toBeDefined();
  });

  it("tower_request_clearance POSTs to /tower/clearance with the callsign", async () => {
    const cfg = createTowerMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "ALPHA",
    });
    const result = (await getTools(cfg).tower_request_clearance.handler({})) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:7700/api/v1/projects/demo/tower/clearance",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ callsign: "ALPHA" }),
      }),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Clearance granted");
  });

  it("tower_execute_merge POSTs to /tower/merge with the callsign", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ outcome: "landed", status: "Landed" }), { status: 200 }),
    );
    const cfg = createTowerMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "ALPHA",
    });
    const result = (await getTools(cfg).tower_execute_merge.handler({})) as {
      content: Array<{ text: string }>;
    };
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:7700/api/v1/projects/demo/tower/merge",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ callsign: "ALPHA" }) }),
    );
    expect(result.content[0].text).toContain("landed");
  });

  it("reports errors when clearance is refused (e.g. vectors not all passed)", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not all vectors have passed" }), { status: 409 }),
    );
    const cfg = createTowerMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "ALPHA",
    });
    const result = (await getTools(cfg).tower_request_clearance.handler({})) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("409");
  });
});
