import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ClaudeAgentSdkAdapter, DEFAULT_MODEL, type QueryFn } from "./adapter.js";
import { CraftStatus } from "@airtrafficcontrol/types";
import type {
  AgentHandle,
  AgentLaunchOptions,
  AgentUsageReport,
  IntercomMessage,
} from "@airtrafficcontrol/daemon";
import type { Options, Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

interface FakeSession {
  options: Options | undefined;
  prompts: SDKUserMessage[];
  interrupted: number;
  closed: boolean;
  emit: (msg: SDKMessage) => void;
  endStream: () => void;
  query: Query;
}

function createFakeSdk(): { query: QueryFn; lastSession: () => FakeSession } {
  let latest: FakeSession | undefined;

  const queryFn: QueryFn = ({ prompt, options }) => {
    const session: Partial<FakeSession> = {
      options,
      prompts: [],
      interrupted: 0,
      closed: false,
    };

    const outbox: SDKMessage[] = [];
    const outWaiters: Array<(r: IteratorResult<SDKMessage, void>) => void> = [];
    let outClosed = false;

    const emit = (msg: SDKMessage): void => {
      if (outClosed) return;
      const w = outWaiters.shift();
      if (w !== undefined) w({ value: msg, done: false });
      else outbox.push(msg);
    };
    const endStream = (): void => {
      if (outClosed) return;
      outClosed = true;
      while (outWaiters.length > 0) {
        outWaiters.shift()?.({ value: undefined, done: true });
      }
    };

    if (typeof prompt !== "string") {
      (async () => {
        for await (const msg of prompt) {
          session.prompts!.push(msg);
        }
      })().catch(() => {
        /* ignore */
      });
    }

    const q = {
      [Symbol.asyncIterator](): AsyncIterator<SDKMessage, void> {
        return this as unknown as AsyncIterator<SDKMessage, void>;
      },
      next(): Promise<IteratorResult<SDKMessage, void>> {
        const buffered = outbox.shift();
        if (buffered !== undefined) {
          return Promise.resolve({ value: buffered, done: false });
        }
        if (outClosed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          outWaiters.push(resolve);
        });
      },
      return(): Promise<IteratorResult<SDKMessage, void>> {
        endStream();
        return Promise.resolve({ value: undefined, done: true });
      },
      throw(err?: unknown): Promise<IteratorResult<SDKMessage, void>> {
        endStream();
        return Promise.reject(err);
      },
      interrupt: async (): Promise<void> => {
        session.interrupted = (session.interrupted ?? 0) + 1;
      },
      setPermissionMode: async (): Promise<void> => {},
      setModel: async (): Promise<void> => {},
      supportedCommands: async (): Promise<string[]> => [],
      supportedModels: async (): Promise<unknown[]> => [],
      mcpServerStatus: async (): Promise<unknown[]> => [],
      close: (): void => {
        session.closed = true;
        endStream();
      },
    };

    session.emit = emit;
    session.endStream = endStream;
    session.query = q as unknown as Query;
    latest = session as FakeSession;
    return q as unknown as Query;
  };

  return {
    query: queryFn,
    lastSession: () => {
      if (latest === undefined) throw new Error("no session created yet");
      return latest;
    },
  };
}

function baseLaunchOptions(overrides: Partial<AgentLaunchOptions> = {}): AgentLaunchOptions {
  return {
    agentId: "agent-1",
    worktreePath: "/tmp/worktree",
    craft: {
      callsign: "ALPHA-1",
      createdAt: "2026-04-14T00:00:00.000Z",
      branch: "feature/alpha",
      cargo: "Implement widget",
      category: "backend",
      status: CraftStatus.InFlight,
      holdingPattern: false,
      captain: "pilot-001",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "pilot-001" },
    },
    projectName: "demo-project",
    pilotId: "pilot-001",
    systemPrompt: "You are a pilot.",
    intercomHistory: [],
    adapterConfig: {},
    mcpServers: {},
    ...overrides,
  };
}

const TEST_DAEMON_URL = "http://test-daemon";
const FAKE_ATC_TOKEN = "test-atc-session-token";

describe("ClaudeAgentSdkAdapter", () => {
  let sdk: ReturnType<typeof createFakeSdk>;
  let adapter: ClaudeAgentSdkAdapter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    sdk = createFakeSdk();
    adapter = new ClaudeAgentSdkAdapter({ query: sdk.query, daemonUrl: TEST_DAEMON_URL });
    // Mock fetch for ATC MCP session creation (POST → 201 + token) and
    // deletion (DELETE → 204). Both routes target the same URL.
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if ((init as RequestInit | undefined)?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ token: FAKE_ATC_TOKEN }), { status: 201 }),
      );
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const launchTestAgent = async (
    overrides: Partial<AgentLaunchOptions> = {},
  ): Promise<AgentHandle> => adapter.launch(baseLaunchOptions(overrides));

  it("launch wires the SDK with the worktree cwd, default model, and auto-built pilot briefing", async () => {
    await launchTestAgent();
    const session = sdk.lastSession();
    expect(session.options?.cwd).toBe("/tmp/worktree");
    expect(session.options?.model).toBe(DEFAULT_MODEL);
    // The auto-built briefing is prepended; the caller-supplied prompt is
    // appended as project-specific notes.
    expect(session.options?.systemPrompt).toContain("ATC Pilot Briefing");
    expect(session.options?.systemPrompt).toContain("ALPHA-1");
    expect(session.options?.systemPrompt).toContain("Project-specific notes");
    expect(session.options?.systemPrompt).toContain("You are a pilot.");
    expect(session.options?.permissionMode).toBe("acceptEdits");
    // RULE-CTRL-3 is enforced via canUseTool — `acceptEdits` disables
    // interactive prompts, but canUseTool is still consulted.
    expect(session.options?.canUseTool).toBeTypeOf("function");
  });

  it("launch uses only the auto-built briefing when caller systemPrompt is empty", async () => {
    await launchTestAgent({ systemPrompt: "" });
    const session = sdk.lastSession();
    expect(session.options?.systemPrompt).toContain("ATC Pilot Briefing");
    expect(session.options?.systemPrompt).not.toContain("Project-specific notes");
  });

  it("launch honors an adapterConfig.model override", async () => {
    await launchTestAgent({ adapterConfig: { model: "claude-sonnet-4-6" } });
    expect(sdk.lastSession().options?.model).toBe("claude-sonnet-4-6");
  });

  it("launch pushes a kickoff user message derived from the craft cargo", async () => {
    await launchTestAgent();
    await new Promise((r) => setTimeout(r, 0));
    const prompts = sdk.lastSession().prompts;
    expect(prompts.length).toBeGreaterThanOrEqual(1);
    const first = prompts[0]!.message;
    const block = Array.isArray(first.content) ? first.content[0] : undefined;
    expect(block).toMatchObject({
      type: "text",
      text: expect.stringContaining("Implement widget"),
    });
  });

  it("launch replays intercom history into the input stream", async () => {
    const history: IntercomMessage[] = [
      {
        from: "ALPHA-1",
        seat: "firstOfficer",
        content: "prior note",
        timestamp: "2026-04-13T00:00:00.000Z",
      },
    ];
    await launchTestAgent({ intercomHistory: history });
    await new Promise((r) => setTimeout(r, 0));
    const prompts = sdk.lastSession().prompts;
    expect(prompts.length).toBe(2);
    const content = prompts[1]!.message.content;
    const block = Array.isArray(content) ? content[0] : undefined;
    expect(block).toMatchObject({
      type: "text",
      text: expect.stringContaining("prior note"),
    });
  });

  it("launch creates an ATC MCP session and adds the HTTP server to mcpServers", async () => {
    await launchTestAgent();
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_DAEMON_URL}/api/v1/mcp/session`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          pilotId: "pilot-001",
          callsign: "ALPHA-1",
          projectName: "demo-project",
        }),
      }),
    );
    const mcp = sdk.lastSession().options?.mcpServers as
      | Record<string, { type: string; url?: string; headers?: Record<string, string> }>
      | undefined;
    expect(mcp?.atc).toEqual({
      type: "http",
      url: `${TEST_DAEMON_URL}/api/v1/mcp`,
      headers: { Authorization: `Bearer ${FAKE_ATC_TOKEN}` },
    });
  });

  it("launch forwards mcpServers, mapping them to stdio shape alongside the atc server", async () => {
    await launchTestAgent({
      mcpServers: {
        files: { command: "node", args: ["server.js"], env: { FOO: "bar" } },
      },
    });
    const mcp = sdk.lastSession().options?.mcpServers as
      | Record<
          string,
          { type?: string; command?: string; args?: string[]; env?: Record<string, string> }
        >
      | undefined;
    expect(mcp?.files).toEqual({
      type: "stdio",
      command: "node",
      args: ["server.js"],
      env: { FOO: "bar" },
    });
    // The standalone ATC server is always added alongside any project servers.
    expect(mcp?.atc).toMatchObject({ type: "http", url: `${TEST_DAEMON_URL}/api/v1/mcp` });
  });

  it("onMessage receives assistant text blocks wrapped as intercom messages", async () => {
    const handle = await launchTestAgent();
    const received: IntercomMessage[] = [];
    adapter.onMessage(handle, (m) => received.push(m));

    sdk.lastSession().emit({
      type: "assistant",
      parent_tool_use_id: null,
      uuid: "00000000-0000-0000-0000-000000000001" as never,
      session_id: "sess-1",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: DEFAULT_MODEL,
        stop_reason: null,
        stop_sequence: null,
        content: [{ type: "text", text: "hello world" }],
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
        },
      } as never,
    } as SDKMessage);

    await new Promise((r) => setTimeout(r, 0));
    expect(received).toHaveLength(1);
    // `from` is the pilotId (not the callsign) so agent-to-agent forwarding
    // can exclude the sender correctly.
    expect(received[0]).toMatchObject({
      from: "pilot-001",
      seat: "captain",
      content: "hello world",
    });
  });

  it("onUsageReport fires on SDK result messages with token totals", async () => {
    const handle = await launchTestAgent();
    const reports: AgentUsageReport[] = [];
    adapter.onUsageReport(handle, (r) => reports.push(r));

    sdk.lastSession().emit({
      type: "result",
      subtype: "success",
      duration_ms: 1234,
      duration_api_ms: 1000,
      is_error: false,
      num_turns: 1,
      result: "done",
      stop_reason: "end_turn",
      total_cost_usd: 0.01,
      modelUsage: {},
      permission_denials: [],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
      uuid: "00000000-0000-0000-0000-000000000002" as never,
      session_id: "sess-1",
    } as unknown as SDKMessage);

    await new Promise((r) => setTimeout(r, 0));
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      agentId: "agent-1",
      callsign: "ALPHA-1",
      duration: 1234,
      tokens: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5 },
    });
  });

  it("sendMessage pushes intercom messages into the SDK prompt stream", async () => {
    const handle = await launchTestAgent();
    await new Promise((r) => setTimeout(r, 0));
    const before = sdk.lastSession().prompts.length;

    await adapter.sendMessage(handle, {
      from: "ALPHA-1",
      seat: "captain",
      content: "ack",
      timestamp: "2026-04-14T00:00:01.000Z",
    });
    await new Promise((r) => setTimeout(r, 0));

    const after = sdk.lastSession().prompts;
    expect(after.length).toBe(before + 1);
    const block = Array.isArray(after[after.length - 1]!.message.content)
      ? (after[after.length - 1]!.message.content as Array<{ type: string; text?: string }>)[0]
      : undefined;
    expect(block?.text).toContain("ack");
  });

  it("pause interrupts the query and flips status to paused", async () => {
    const handle = await launchTestAgent();
    const statuses: string[] = [];
    adapter.onStatusChange(handle, (s) => statuses.push(s));

    await adapter.pause(handle);
    expect(sdk.lastSession().interrupted).toBe(1);
    expect(statuses).toContain("paused");
  });

  it("resume replays intercom history and restores running status", async () => {
    const handle = await launchTestAgent();
    await adapter.pause(handle);
    await new Promise((r) => setTimeout(r, 0));
    const before = sdk.lastSession().prompts.length;
    const statuses: string[] = [];
    adapter.onStatusChange(handle, (s) => statuses.push(s));

    await adapter.resume(handle, {
      craft: baseLaunchOptions().craft,
      intercomHistory: [
        {
          from: "ALPHA-1",
          seat: "captain",
          content: "resumed",
          timestamp: "2026-04-14T00:00:02.000Z",
        },
      ],
      lastKnownState: "",
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(sdk.lastSession().prompts.length).toBe(before + 1);
    expect(statuses).toContain("running");
  });

  it("terminate closes the SDK query, deletes the ATC session, and reports terminated via isAlive", async () => {
    const handle = await launchTestAgent();
    expect(await adapter.isAlive(handle)).toBe(true);

    await adapter.terminate(handle);
    expect(sdk.lastSession().closed).toBe(true);
    expect(await adapter.isAlive(handle)).toBe(false);
    // The ATC MCP session should be deleted to release server-side resources.
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_DAEMON_URL}/api/v1/mcp/session`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ Authorization: `Bearer ${FAKE_ATC_TOKEN}` }),
      }),
    );
  });

  it("callbacks registered against an unknown handle are dropped", async () => {
    const unknown: AgentHandle = { agentId: "ghost", adapterMeta: {} };
    expect(() => adapter.onMessage(unknown, () => {})).not.toThrow();
    expect(() => adapter.onStatusChange(unknown, () => {})).not.toThrow();
    expect(() => adapter.onUsageReport(unknown, () => {})).not.toThrow();
    expect(await adapter.isAlive(unknown)).toBe(false);
    await adapter.sendMessage(unknown, {
      from: "x",
      seat: "captain",
      content: "y",
      timestamp: "2026-04-14T00:00:00.000Z",
    });
    await adapter.pause(unknown);
    await adapter.resume(unknown, {
      craft: baseLaunchOptions().craft,
      intercomHistory: [],
      lastKnownState: "",
    });
    await adapter.terminate(unknown);
  });

  it("background consumer marks the session terminated once the stream ends", async () => {
    const handle = await launchTestAgent();
    const statuses: string[] = [];
    adapter.onStatusChange(handle, (s) => statuses.push(s));

    sdk.lastSession().endStream();
    await new Promise((r) => setTimeout(r, 0));
    expect(statuses).toContain("terminated");
    expect(await adapter.isAlive(handle)).toBe(false);
  });
});
