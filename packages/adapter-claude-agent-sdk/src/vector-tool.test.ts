import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { createVectorMcpServer } from "./vector-tool.js";

describe("createVectorMcpServer", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: MockInstance<any>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify([{ name: "v1", status: "Passed" }]), { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function getTools(cfg: ReturnType<typeof createVectorMcpServer>) {
    return (
      cfg.instance as unknown as {
        _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
      }
    )._registeredTools;
  }

  it("produces a server config with the expected name and a vector_report tool", () => {
    const cfg = createVectorMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "ALPHA-1",
      pilotId: "pilot-001",
    });
    expect(cfg.type).toBe("sdk");
    expect(cfg.name).toBe("atc-vectors");
    expect(getTools(cfg).vector_report).toBeDefined();
  });

  it("vector_report POSTs to the correct vector report endpoint with vectorName and evidence", async () => {
    const cfg = createVectorMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "BRAVO-2",
      pilotId: "pilot-001",
    });
    const result = (await getTools(cfg).vector_report.handler({
      vectorName: "Implement widget",
      evidence: "All tests pass, lint clean.",
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:7700/api/v1/projects/demo/crafts/BRAVO-2/vectors/Implement%20widget/report",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pilotId: "pilot-001", evidence: "All tests pass, lint clean." }),
      }),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("passed");
  });

  it("returns error when daemon refuses (e.g. vector not next pending)", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Vector is not the next pending vector" }), { status: 409 }),
    );
    const cfg = createVectorMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "ALPHA",
      pilotId: "pilot-001",
    });
    const result = (await getTools(cfg).vector_report.handler({
      vectorName: "v2",
      evidence: "done",
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("409");
  });

  it("catches thrown fetch errors and reports them", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("connection refused"));
    const cfg = createVectorMcpServer({
      daemonUrl: "http://localhost:7700",
      projectName: "demo",
      callsign: "ALPHA",
      pilotId: "pilot-001",
    });
    const result = (await getTools(cfg).vector_report.handler({
      vectorName: "v1",
      evidence: "done",
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("connection refused");
  });
});
