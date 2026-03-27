/**
 * Type shape tests for @atc/daemon types.
 *
 * These tests verify that all exported types accept valid values and
 * that TypeScript compiles the shapes correctly. They are intentionally
 * runtime-light — the real value is in compilation.
 */

import { describe, expect, it } from "vitest";
import { BlackBoxEntryType, CraftStatus } from "@atc/types";
import type {
  AdapterConfig,
  AgentRecord,
  AgentStatus,
  AgentUsageReport,
  BlackBoxEntry,
  ChecklistItemConfig,
  ControlState,
  CraftState,
  GlobalConfig,
  IntercomMessage,
  McpServerConfig,
  ProfileConfig,
  ProjectMetadata,
  SkillUsageEntry,
  TokenUsage,
  ToolUsageEntry,
  VectorState,
  WsClientMessage,
  WsEvent,
  WsServerMessage,
} from "./types.js";

// ---------------------------------------------------------------------------
// GlobalConfig
// ---------------------------------------------------------------------------

describe("GlobalConfig", () => {
  it("accepts a valid shape", () => {
    const config: GlobalConfig = { defaultProfile: "local" };
    expect(config.defaultProfile).toBe("local");
  });
});

// ---------------------------------------------------------------------------
// AdapterConfig
// ---------------------------------------------------------------------------

describe("AdapterConfig", () => {
  it("accepts a valid shape", () => {
    const adapter: AdapterConfig = {
      type: "claude-agent-sdk",
      config: { apiKey: "sk-test", model: "claude-opus-4" },
    };
    expect(adapter.type).toBe("claude-agent-sdk");
    expect(adapter.config).toHaveProperty("apiKey");
  });
});

// ---------------------------------------------------------------------------
// ProfileConfig
// ---------------------------------------------------------------------------

describe("ProfileConfig", () => {
  it("accepts a valid shape", () => {
    const profile: ProfileConfig = {
      port: 7070,
      host: "127.0.0.1",
      logLevel: "info",
      autoRecover: true,
      wsHeartbeatInterval: 30_000,
      stateFlushInterval: 5_000,
      adapter: { type: "mock", config: {} },
    };
    expect(profile.port).toBe(7070);
    expect(profile.logLevel).toBe("info");
  });

  it("accepts all valid logLevel values", () => {
    const levels: ProfileConfig["logLevel"][] = ["debug", "info", "warn", "error"];
    levels.forEach((logLevel) => {
      const profile: ProfileConfig = {
        port: 7070,
        host: "localhost",
        logLevel,
        autoRecover: false,
        wsHeartbeatInterval: 10_000,
        stateFlushInterval: 1_000,
        adapter: { type: "mock", config: {} },
      };
      expect(profile.logLevel).toBe(logLevel);
    });
  });
});

// ---------------------------------------------------------------------------
// ChecklistItemConfig
// ---------------------------------------------------------------------------

describe("ChecklistItemConfig", () => {
  it("accepts a shape without optional timeout", () => {
    const item: ChecklistItemConfig = { name: "lint", command: "pnpm run lint" };
    expect(item.timeout).toBeUndefined();
  });

  it("accepts a shape with optional timeout", () => {
    const item: ChecklistItemConfig = {
      name: "tests",
      command: "pnpm run test",
      timeout: 60_000,
    };
    expect(item.timeout).toBe(60_000);
  });
});

// ---------------------------------------------------------------------------
// McpServerConfig
// ---------------------------------------------------------------------------

describe("McpServerConfig", () => {
  it("accepts a shape without optional env", () => {
    const server: McpServerConfig = { command: "node", args: ["mcp-server.js"] };
    expect(server.env).toBeUndefined();
  });

  it("accepts a shape with optional env", () => {
    const server: McpServerConfig = {
      command: "node",
      args: ["server.js"],
      env: { NODE_ENV: "production" },
    };
    expect(server.env?.["NODE_ENV"]).toBe("production");
  });
});

// ---------------------------------------------------------------------------
// ProjectMetadata
// ---------------------------------------------------------------------------

describe("ProjectMetadata", () => {
  it("accepts a valid shape", () => {
    const project: ProjectMetadata = {
      name: "atc",
      remoteUrl: "git@github.com:org/atc.git",
      categories: ["backend", "infra"],
      checklist: [{ name: "build", command: "pnpm run build" }],
      mcpServers: {
        filesystem: { command: "node", args: ["fs-server.js"] },
      },
    };
    expect(project.name).toBe("atc");
    expect(project.categories).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// AgentStatus
// ---------------------------------------------------------------------------

describe("AgentStatus", () => {
  it("accepts all valid values", () => {
    const statuses: AgentStatus[] = ["running", "paused", "suspended", "terminated"];
    statuses.forEach((status) => {
      expect(typeof status).toBe("string");
    });
  });
});

// ---------------------------------------------------------------------------
// AgentRecord
// ---------------------------------------------------------------------------

describe("AgentRecord", () => {
  it("accepts a shape without optional pid", () => {
    const record: AgentRecord = {
      id: "agent-uuid-1",
      adapterType: "claude-agent-sdk",
      projectName: "atc",
      callsign: "ALPHA-1",
      status: "running",
      adapterMeta: { sessionId: "sess-abc" },
    };
    expect(record.pid).toBeUndefined();
  });

  it("accepts a shape with optional pid", () => {
    const record: AgentRecord = {
      id: "agent-uuid-2",
      adapterType: "mock",
      pid: 12345,
      projectName: "atc",
      callsign: "BRAVO-2",
      status: "paused",
      adapterMeta: {},
    };
    expect(record.pid).toBe(12345);
  });
});

// ---------------------------------------------------------------------------
// VectorState
// ---------------------------------------------------------------------------

describe("VectorState", () => {
  it("accepts a Pending vector with no optional fields", () => {
    const vec: VectorState = {
      name: "phase-1",
      acceptanceCriteria: "All tests pass",
      status: "Pending",
    };
    expect(vec.evidence).toBeUndefined();
    expect(vec.reportedAt).toBeUndefined();
  });

  it("accepts a Passed vector with optional fields", () => {
    const vec: VectorState = {
      name: "phase-1",
      acceptanceCriteria: "All tests pass",
      status: "Passed",
      evidence: "CI run #42 green",
      reportedAt: "2026-03-26T00:00:00Z",
    };
    expect(vec.status).toBe("Passed");
    expect(vec.evidence).toBe("CI run #42 green");
  });

  it("accepts all valid status values", () => {
    const statuses: VectorState["status"][] = ["Pending", "Passed", "Failed"];
    statuses.forEach((status) => {
      const vec: VectorState = {
        name: "v",
        acceptanceCriteria: "c",
        status,
      };
      expect(vec.status).toBe(status);
    });
  });
});

// ---------------------------------------------------------------------------
// BlackBoxEntry
// ---------------------------------------------------------------------------

describe("BlackBoxEntry", () => {
  it("accepts a valid shape using BlackBoxEntryType enum", () => {
    const entry: BlackBoxEntry = {
      timestamp: "2026-03-26T00:00:00Z",
      author: "ALPHA-1",
      type: BlackBoxEntryType.Decision,
      content: "Chose vitest over jest",
    };
    expect(entry.type).toBe(BlackBoxEntryType.Decision);
  });
});

// ---------------------------------------------------------------------------
// ControlState
// ---------------------------------------------------------------------------

describe("ControlState", () => {
  it("accepts exclusive mode with a holder", () => {
    const ctrl: ControlState = { mode: "exclusive", holder: "pilot-1" };
    expect(ctrl.holder).toBe("pilot-1");
  });

  it("accepts shared mode with shared areas", () => {
    const ctrl: ControlState = {
      mode: "shared",
      sharedAreas: [
        { pilotId: "pilot-1", area: "src/auth" },
        { pilotId: "pilot-2", area: "src/core" },
      ],
    };
    expect(ctrl.sharedAreas).toHaveLength(2);
  });

  it("accepts both mode values", () => {
    const modes: ControlState["mode"][] = ["exclusive", "shared"];
    modes.forEach((mode) => {
      const ctrl: ControlState = { mode };
      expect(ctrl.mode).toBe(mode);
    });
  });
});

// ---------------------------------------------------------------------------
// IntercomMessage
// ---------------------------------------------------------------------------

describe("IntercomMessage", () => {
  it("accepts a valid shape", () => {
    const msg: IntercomMessage = {
      from: "ALPHA-1",
      seat: "captain",
      content: "Requesting landing clearance",
      timestamp: "2026-03-26T01:00:00Z",
    };
    expect(msg.seat).toBe("captain");
  });
});

// ---------------------------------------------------------------------------
// CraftState
// ---------------------------------------------------------------------------

describe("CraftState", () => {
  it("accepts a valid shape", () => {
    const craft: CraftState = {
      callsign: "ALPHA-1",
      branch: "feature/alpha-1",
      cargo: "Add daemon types",
      category: "backend",
      status: CraftStatus.InFlight,
      captain: "pilot-uuid-1",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [
        {
          name: "phase-1",
          acceptanceCriteria: "types compile",
          status: "Pending",
        },
      ],
      blackBox: [
        {
          timestamp: "2026-03-26T00:00:00Z",
          author: "system",
          type: BlackBoxEntryType.Observation,
          content: "Craft initialized",
        },
      ],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-uuid-1" },
    };
    expect(craft.callsign).toBe("ALPHA-1");
    expect(craft.status).toBe(CraftStatus.InFlight);
    expect(craft.flightPlan).toHaveLength(1);
    expect(craft.blackBox).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// WsEvent
// ---------------------------------------------------------------------------

describe("WsEvent", () => {
  it("accepts a valid shape", () => {
    const evt: WsEvent = {
      type: "event",
      channel: "craft:ALPHA-1",
      event: "craft.status.changed",
      timestamp: "2026-03-26T00:00:00Z",
      data: { from: "Queued", to: "InFlight" },
    };
    expect(evt.type).toBe("event");
    expect(evt.data["from"]).toBe("Queued");
  });
});

// ---------------------------------------------------------------------------
// WsClientMessage
// ---------------------------------------------------------------------------

describe("WsClientMessage", () => {
  it("accepts subscribe variant", () => {
    const msg: WsClientMessage = { type: "subscribe", channel: "craft:ALPHA-1" };
    expect(msg.type).toBe("subscribe");
  });

  it("accepts unsubscribe variant", () => {
    const msg: WsClientMessage = { type: "unsubscribe", channel: "craft:ALPHA-1" };
    expect(msg.type).toBe("unsubscribe");
  });

  it("accepts ping variant", () => {
    const msg: WsClientMessage = { type: "ping" };
    expect(msg.type).toBe("ping");
  });

  it("accepts pong variant", () => {
    const msg: WsClientMessage = { type: "pong" };
    expect(msg.type).toBe("pong");
  });
});

// ---------------------------------------------------------------------------
// WsServerMessage
// ---------------------------------------------------------------------------

describe("WsServerMessage", () => {
  it("accepts connected variant", () => {
    const msg: WsServerMessage = { type: "connected", sessionId: "sess-xyz" };
    expect(msg.type).toBe("connected");
  });

  it("accepts event variant (WsEvent)", () => {
    const msg: WsServerMessage = {
      type: "event",
      channel: "tower",
      event: "landing.cleared",
      timestamp: "2026-03-26T00:00:00Z",
      data: { callsign: "ALPHA-1" },
    };
    expect(msg.type).toBe("event");
  });

  it("accepts ping variant", () => {
    const msg: WsServerMessage = { type: "ping" };
    expect(msg.type).toBe("ping");
  });

  it("accepts pong variant", () => {
    const msg: WsServerMessage = { type: "pong", timestamp: new Date().toISOString() };
    expect(msg.type).toBe("pong");
  });
});

// ---------------------------------------------------------------------------
// TokenUsage
// ---------------------------------------------------------------------------

describe("TokenUsage", () => {
  it("accepts a shape without optional cache fields", () => {
    const usage: TokenUsage = { input: 1000, output: 250 };
    expect(usage.cacheRead).toBeUndefined();
    expect(usage.cacheWrite).toBeUndefined();
  });

  it("accepts a shape with all fields", () => {
    const usage: TokenUsage = {
      input: 2000,
      output: 500,
      cacheRead: 800,
      cacheWrite: 200,
    };
    expect(usage.cacheRead).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// ToolUsageEntry
// ---------------------------------------------------------------------------

describe("ToolUsageEntry", () => {
  it("accepts a valid shape", () => {
    const entry: ToolUsageEntry = { name: "Bash", calls: 42, failures: 1 };
    expect(entry.calls).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// SkillUsageEntry
// ---------------------------------------------------------------------------

describe("SkillUsageEntry", () => {
  it("accepts a valid shape", () => {
    const entry: SkillUsageEntry = { name: "commit", invocations: 3 };
    expect(entry.invocations).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// AgentUsageReport
// ---------------------------------------------------------------------------

describe("AgentUsageReport", () => {
  it("accepts a valid shape", () => {
    const report: AgentUsageReport = {
      agentId: "agent-uuid-1",
      callsign: "ALPHA-1",
      timestamp: "2026-03-26T00:00:00Z",
      tokens: { input: 5000, output: 1200 },
      tools: [{ name: "Bash", calls: 10, failures: 0 }],
      skills: [{ name: "commit", invocations: 2 }],
      duration: 120_000,
    };
    expect(report.tokens.input).toBe(5000);
    expect(report.tools).toHaveLength(1);
    expect(report.skills).toHaveLength(1);
    expect(report.duration).toBe(120_000);
  });
});
