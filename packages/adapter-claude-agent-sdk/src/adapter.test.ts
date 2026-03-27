import { describe, it, expect } from "vitest";
import { ClaudeAgentSdkAdapter } from "./adapter.js";
import { CraftStatus } from "@atc/types";
import type { AgentHandle } from "@atc/daemon";

const stubHandle: AgentHandle = {
  agentId: "agent-abc",
  adapterMeta: {},
};

describe("ClaudeAgentSdkAdapter", () => {
  it("can be instantiated", () => {
    const adapter = new ClaudeAgentSdkAdapter();
    expect(adapter).toBeInstanceOf(ClaudeAgentSdkAdapter);
  });

  it("has a launch method", () => {
    const adapter = new ClaudeAgentSdkAdapter();
    expect(typeof adapter.launch).toBe("function");
  });

  it("has a pause method", () => {
    const adapter = new ClaudeAgentSdkAdapter();
    expect(typeof adapter.pause).toBe("function");
  });

  it("has a resume method", () => {
    const adapter = new ClaudeAgentSdkAdapter();
    expect(typeof adapter.resume).toBe("function");
  });

  it("has a terminate method", () => {
    const adapter = new ClaudeAgentSdkAdapter();
    expect(typeof adapter.terminate).toBe("function");
  });

  it("has an isAlive method", () => {
    const adapter = new ClaudeAgentSdkAdapter();
    expect(typeof adapter.isAlive).toBe("function");
  });

  it("has a sendMessage method", () => {
    const adapter = new ClaudeAgentSdkAdapter();
    expect(typeof adapter.sendMessage).toBe("function");
  });

  it("has an onMessage method", () => {
    const adapter = new ClaudeAgentSdkAdapter();
    expect(typeof adapter.onMessage).toBe("function");
  });

  it("has an onStatusChange method", () => {
    const adapter = new ClaudeAgentSdkAdapter();
    expect(typeof adapter.onStatusChange).toBe("function");
  });

  it("has an onUsageReport method", () => {
    const adapter = new ClaudeAgentSdkAdapter();
    expect(typeof adapter.onUsageReport).toBe("function");
  });

  it("launch returns a handle with the provided agentId", async () => {
    const adapter = new ClaudeAgentSdkAdapter();
    const handle = await adapter.launch({
      agentId: "test-agent-id",
      worktreePath: "/tmp/worktree",
      craft: {
        callsign: "BETA-1",
        branch: "feature/beta-1",
        cargo: "Do stuff",
        category: "backend",
        status: CraftStatus.InFlight,
        captain: "pilot-001",
        firstOfficers: [],
        jumpseaters: [],
        flightPlan: [],
        blackBox: [],
        intercom: [],
        controls: { mode: "exclusive", holder: "pilot-001" },
      },
      systemPrompt: "You are a pilot.",
      intercomHistory: [],
      adapterConfig: {},
      mcpServers: {},
    });
    expect(handle.agentId).toBe("test-agent-id");
  });

  it("isAlive returns false (stub always reports dead)", async () => {
    const adapter = new ClaudeAgentSdkAdapter();
    const alive = await adapter.isAlive(stubHandle);
    expect(alive).toBe(false);
  });

  it("pause resolves without throwing", async () => {
    const adapter = new ClaudeAgentSdkAdapter();
    await expect(adapter.pause(stubHandle)).resolves.toBeUndefined();
  });

  it("terminate resolves without throwing", async () => {
    const adapter = new ClaudeAgentSdkAdapter();
    await expect(adapter.terminate(stubHandle)).resolves.toBeUndefined();
  });
});
