/**
 * Unit tests for the McpServer builder — focuses on seat gating and context rendering.
 *
 * Uses a minimal AtcAppInstance mock: inject() is a stub that returns a
 * configurable response, and craftStore.get() returns a pre-seeded craft.
 */

import { describe, it, expect } from "vitest";
import { buildAtcMcpServer, type AtcAppInstance } from "./build-server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import Fastify from "fastify";

// ---------------------------------------------------------------------------
// Shared craft fixture
// ---------------------------------------------------------------------------

const CRAFT = {
  callsign: "ALPHA01",
  status: "InFlight",
  cargo: "test feature",
  branch: "feature/test",
  category: "feature",
  captain: "cap-id",
  firstOfficers: ["fo-id"],
  jumpseaters: ["js-id"],
  flightPlan: [
    { name: "Tests", acceptanceCriteria: "All tests pass", status: "Pending" },
    { name: "Lint", acceptanceCriteria: "No lint errors", status: "Pending" },
  ],
  blackBox: [] as Array<{ type: string; timestamp: string; author: string; content: string }>,
  intercom: [] as Array<{ from: string; seat: string; content: string; timestamp: string }>,
  controls: { mode: "exclusive", holder: "cap-id" } as {
    mode: string;
    holder?: string;
    sharedAreas?: Array<{ pilotId: string; area: string }>;
  },
  holdingPattern: false,
};

// ---------------------------------------------------------------------------
// Mock AtcAppInstance builder
// ---------------------------------------------------------------------------

function makeApp(
  mutationResponse: { statusCode: number; body: unknown } = { statusCode: 200, body: { ok: true } },
  craftData: typeof CRAFT | null = CRAFT,
): AtcAppInstance {
  return {
    craftStore: {
      get: () => craftData ?? undefined,
    },
    inject: async (opts) => {
      // GET craft path returns the craft; all mutations return mutationResponse.
      if (opts.method === "GET") {
        const data = craftData ?? {};
        return { statusCode: 200, json: <T = unknown>() => data as T };
      }
      const body = mutationResponse.body;
      return {
        statusCode: mutationResponse.statusCode,
        json: <T = unknown>() => body as T,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: build and connect a test client to the server in-process
// ---------------------------------------------------------------------------

async function buildAndConnect(
  pilotId: string,
  app: AtcAppInstance = makeApp(),
): Promise<{
  mcpServer: McpServer;
  transport: StreamableHTTPServerTransport;
  fastifyApp: ReturnType<typeof Fastify>;
}> {
  const session = { pilotId, callsign: "ALPHA01", projectName: "proj" };
  const { mcpServer, transport } = await buildAtcMcpServer(session, app);

  const fastifyApp = Fastify({ logger: false });
  fastifyApp.post("/mcp", async (req, reply) => {
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  fastifyApp.get("/mcp", async (req, reply) => {
    await transport.handleRequest(req.raw, reply.raw);
  });
  fastifyApp.delete("/mcp", async (req, reply) => {
    await transport.handleRequest(req.raw, reply.raw);
  });

  await fastifyApp.listen({ port: 0 });

  return { mcpServer, transport, fastifyApp };
}

// ---------------------------------------------------------------------------
// Tests: session-level server construction
// ---------------------------------------------------------------------------

describe("buildAtcMcpServer", () => {
  it("returns an McpServer and transport", async () => {
    const app = makeApp();
    const { mcpServer, transport } = await buildAtcMcpServer(
      { pilotId: "cap-id", callsign: "ALPHA01", projectName: "proj" },
      app,
    );
    expect(mcpServer).toBeDefined();
    expect(transport).toBeDefined();
    await transport.close();
  });
});

// ---------------------------------------------------------------------------
// Tests: atc_get_context
// ---------------------------------------------------------------------------

describe("atc_get_context", () => {
  it("returns a formatted pilot briefing with craft state", async () => {
    const { fastifyApp, transport } = await buildAndConnect("cap-id");

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.callTool({ name: "atc_get_context", arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;

      expect(text).toContain("ATC Pilot Briefing");
      expect(text).toContain("cap-id");
      expect(text).toContain("Captain");
      expect(text).toContain("ALPHA01");
      expect(text).toContain("InFlight");
      expect(text).toContain("Tests");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });

  it("shows FirstOfficer seat for FO pilot", async () => {
    const { fastifyApp, transport } = await buildAndConnect("fo-id");

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.callTool({ name: "atc_get_context", arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("FirstOfficer");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: seat gating — Captain-only tools
// ---------------------------------------------------------------------------

describe("seat gating: Captain-only tools", () => {
  const captainOnlyTools = [
    "atc_tower_request_clearance",
    "atc_tower_execute_merge",
    "atc_declare_emergency",
  ];

  for (const toolName of captainOnlyTools) {
    it(`${toolName} rejects FO with RULE-TOWER-2 or RULE-EMER-1`, async () => {
      const { fastifyApp, transport } = await buildAndConnect("fo-id");

      try {
        const port = (fastifyApp.server.address() as { port: number }).port;
        const client = new Client({ name: "test-client", version: "1.0.0" });
        const clientTransport = new StreamableHTTPClientTransport(
          new URL(`http://localhost:${port}/mcp`),
        );
        await client.connect(clientTransport);

        const args: Record<string, string> = {};
        if (toolName === "atc_declare_emergency") args.reason = "test emergency";

        const result = await client.callTool({ name: toolName, arguments: args });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text: string }>)[0].text;
        expect(text).toContain("Captain authority");

        await client.close();
      } finally {
        await transport.close();
        await fastifyApp.close();
      }
    });

    it(`${toolName} rejects Jumpseat pilot`, async () => {
      const { fastifyApp, transport } = await buildAndConnect("js-id");

      try {
        const port = (fastifyApp.server.address() as { port: number }).port;
        const client = new Client({ name: "test-client", version: "1.0.0" });
        const clientTransport = new StreamableHTTPClientTransport(
          new URL(`http://localhost:${port}/mcp`),
        );
        await client.connect(clientTransport);

        const args: Record<string, string> = {};
        if (toolName === "atc_declare_emergency") args.reason = "test";

        const result = await client.callTool({ name: toolName, arguments: args });
        expect(result.isError).toBe(true);

        await client.close();
      } finally {
        await transport.close();
        await fastifyApp.close();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: seat gating — Captain-or-FO tools
// ---------------------------------------------------------------------------

describe("seat gating: Captain-or-FO tools", () => {
  const foOrCaptainTools = [
    { name: "atc_controls_transfer", args: { targetPilotId: "fo-id" } },
    { name: "atc_controls_share", args: { areas: [{ pilotId: "cap-id", area: "src" }] } },
    { name: "atc_craft_report_vector", args: { vectorName: "Tests", evidence: "All green." } },
    { name: "atc_craft_run_checklist", args: {} },
  ];

  for (const { name, args } of foOrCaptainTools) {
    it(`${name} rejects Jumpseat pilot`, async () => {
      const { fastifyApp, transport } = await buildAndConnect("js-id");

      try {
        const port = (fastifyApp.server.address() as { port: number }).port;
        const client = new Client({ name: "test-client", version: "1.0.0" });
        const clientTransport = new StreamableHTTPClientTransport(
          new URL(`http://localhost:${port}/mcp`),
        );
        await client.connect(clientTransport);

        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text: string }>)[0].text;
        expect(text).toContain("First Officer");

        await client.close();
      } finally {
        await transport.close();
        await fastifyApp.close();
      }
    });

    it(`${name} allows FO`, async () => {
      const app = makeApp({ statusCode: 200, body: { ok: true } });
      const { fastifyApp, transport } = await buildAndConnect("fo-id", app);

      try {
        const port = (fastifyApp.server.address() as { port: number }).port;
        const client = new Client({ name: "test-client", version: "1.0.0" });
        const clientTransport = new StreamableHTTPClientTransport(
          new URL(`http://localhost:${port}/mcp`),
        );
        await client.connect(clientTransport);

        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).toBeFalsy();

        await client.close();
      } finally {
        await transport.close();
        await fastifyApp.close();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: inject failure propagation
// ---------------------------------------------------------------------------

describe("REST API error forwarding", () => {
  it("atc_intercom_send surfaces non-200 as isError with message", async () => {
    const app = makeApp({ statusCode: 403, body: { error: "not authorized", ruleId: "RULE-SEAT-1" } }, CRAFT);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "atc_intercom_send",
        arguments: { content: "hello" },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("RULE-SEAT-1");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: MCP Resources (read-only, from craftStore)
// ---------------------------------------------------------------------------

describe("MCP Resources", () => {
  it("craft-intercom returns intercom history", async () => {
    const craftWithIntercom = {
      ...CRAFT,
      intercom: [
        { from: "cap-id", seat: "Captain", content: "hello crew", timestamp: "2025-01-01T00:00:00Z" },
      ],
    };
    const app = makeApp({ statusCode: 200, body: { ok: true } }, craftWithIntercom);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.readResource({ uri: "atc://crafts/ALPHA01/intercom" });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe("application/json");
      const data = JSON.parse((result.contents[0] as { uri: string; text: string; mimeType?: string }).text);
      expect(data).toHaveLength(1);
      expect(data[0].content).toBe("hello crew");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });

  it("craft-intercom returns empty array when craft has no intercom", async () => {
    const app = makeApp({ statusCode: 200, body: { ok: true } }, CRAFT);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.readResource({ uri: "atc://crafts/ALPHA01/intercom" });
      const data = JSON.parse((result.contents[0] as { uri: string; text: string; mimeType?: string }).text);
      expect(data).toEqual([]);

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });

  it("craft-blackbox returns black box entries", async () => {
    const craftWithBlackbox = {
      ...CRAFT,
      blackBox: [
        { type: "StateChange", timestamp: "2025-01-01T00:00:00Z", author: "system", content: "Created" },
      ],
    };
    const app = makeApp({ statusCode: 200, body: { ok: true } }, craftWithBlackbox);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.readResource({ uri: "atc://crafts/ALPHA01/blackbox" });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe("application/json");
      const data = JSON.parse((result.contents[0] as { uri: string; text: string; mimeType?: string }).text);
      expect(data).toHaveLength(1);
      expect(data[0].type).toBe("StateChange");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });

  it("craft-blackbox returns empty array when craft not found", async () => {
    const app = makeApp({ statusCode: 200, body: { ok: true } }, null);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.readResource({ uri: "atc://crafts/ALPHA01/blackbox" });
      const data = JSON.parse((result.contents[0] as { uri: string; text: string; mimeType?: string }).text);
      expect(data).toEqual([]);

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: GET craft failure propagation across all tools
// ---------------------------------------------------------------------------

function makeAppWithGetFailure(
  response: { statusCode: number; body: unknown } = { statusCode: 404, body: { error: "Craft not found" } },
): AtcAppInstance {
  return {
    craftStore: {
      get: () => undefined,
    },
    inject: async () => ({
      statusCode: response.statusCode,
      json: <T = unknown>() => response.body as T,
    }),
  };
}

describe("GET craft failure propagation", () => {
  const allTools = [
    { name: "atc_get_context", args: {} },
    { name: "atc_controls_read", args: {} },
    { name: "atc_controls_transfer", args: { targetPilotId: "fo-id" } },
    { name: "atc_controls_share", args: { areas: [{ pilotId: "cap-id", area: "src" }] } },
    { name: "atc_craft_report_vector", args: { vectorName: "Tests", evidence: "All green." } },
    { name: "atc_craft_run_checklist", args: {} },
    { name: "atc_tower_request_clearance", args: {} },
    { name: "atc_tower_execute_merge", args: {} },
    { name: "atc_declare_emergency", args: { reason: "test" } },
  ];

  for (const { name, args } of allTools) {
    it(`${name} returns isError when GET craft fails`, async () => {
      const app = makeAppWithGetFailure({ statusCode: 404, body: { error: "Craft not found" } });
      const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

      try {
        const port = (fastifyApp.server.address() as { port: number }).port;
        const client = new Client({ name: "test-client", version: "1.0.0" });
        const clientTransport = new StreamableHTTPClientTransport(
          new URL(`http://localhost:${port}/mcp`),
        );
        await client.connect(clientTransport);

        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text: string }>)[0].text;
        expect(text).toContain("Craft not found");

        await client.close();
      } finally {
        await transport.close();
        await fastifyApp.close();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Captain-only tool success paths
// ---------------------------------------------------------------------------

describe("Captain-only tool success paths", () => {
  const captainSuccessTools = [
    { name: "atc_tower_request_clearance", args: {}, expected: "Landing clearance granted" },
    { name: "atc_tower_execute_merge", args: {}, expected: "Merge executed" },
    { name: "atc_declare_emergency", args: { reason: "critical blocker" }, expected: "Emergency declared" },
  ];

  for (const { name, args, expected } of captainSuccessTools) {
    it(`${name} succeeds for Captain`, async () => {
      const app = makeApp({ statusCode: 200, body: { ok: true } });
      const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

      try {
        const port = (fastifyApp.server.address() as { port: number }).port;
        const client = new Client({ name: "test-client", version: "1.0.0" });
        const clientTransport = new StreamableHTTPClientTransport(
          new URL(`http://localhost:${port}/mcp`),
        );
        await client.connect(clientTransport);

        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).toBeFalsy();
        const text = (result.content as Array<{ type: string; text: string }>)[0].text;
        expect(text).toContain(expected);

        await client.close();
      } finally {
        await transport.close();
        await fastifyApp.close();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: controls_read and intercom_send success paths
// ---------------------------------------------------------------------------

describe("tool success paths: read and send", () => {
  it("atc_controls_read returns controls state as JSON", async () => {
    const app = makeApp();
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.callTool({ name: "atc_controls_read", arguments: {} });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("exclusive");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });

  it("atc_intercom_send succeeds for Captain", async () => {
    const app = makeApp({ statusCode: 201, body: { ok: true } });
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "atc_intercom_send",
        arguments: { content: "hello crew" },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Intercom message sent");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: mutation failure on CaptainOrFO tools
// ---------------------------------------------------------------------------

describe("mutation failure forwarding", () => {
  const mutationFailureTools = [
    { name: "atc_controls_transfer", args: { targetPilotId: "cap-id" }, pilot: "fo-id" },
    { name: "atc_controls_share", args: { areas: [{ pilotId: "cap-id", area: "src" }] }, pilot: "fo-id" },
    { name: "atc_craft_report_vector", args: { vectorName: "Tests", evidence: "All green." }, pilot: "fo-id" },
    { name: "atc_craft_run_checklist", args: {}, pilot: "fo-id" },
    { name: "atc_tower_request_clearance", args: {}, pilot: "cap-id" },
    { name: "atc_tower_execute_merge", args: {}, pilot: "cap-id" },
    { name: "atc_declare_emergency", args: { reason: "test" }, pilot: "cap-id" },
    { name: "atc_intercom_send", args: { content: "hello" }, pilot: "cap-id" },
  ];

  for (const { name, args, pilot } of mutationFailureTools) {
    it(`${name} surfaces mutation error`, async () => {
      const app = makeApp({ statusCode: 409, body: { error: "Conflict", ruleId: "RULE-TEST" } });
      const { fastifyApp, transport } = await buildAndConnect(pilot, app);

      try {
        const port = (fastifyApp.server.address() as { port: number }).port;
        const client = new Client({ name: "test-client", version: "1.0.0" });
        const clientTransport = new StreamableHTTPClientTransport(
          new URL(`http://localhost:${port}/mcp`),
        );
        await client.connect(clientTransport);

        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text: string }>)[0].text;
        expect(text).toContain("RULE-TEST");

        await client.close();
      } finally {
        await transport.close();
        await fastifyApp.close();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: atc_get_context briefing variations
// ---------------------------------------------------------------------------

describe("atc_get_context briefing variations", () => {
  it("shows 'All vectors passed' when flight plan is complete", async () => {
    const craftAllPassed = {
      ...CRAFT,
      flightPlan: [
        { name: "Tests", acceptanceCriteria: "All tests pass", status: "Passed" },
        { name: "Lint", acceptanceCriteria: "No lint errors", status: "Passed" },
      ],
    };
    const app = makeApp({ statusCode: 200, body: { ok: true } }, craftAllPassed);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.callTool({ name: "atc_get_context", arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("All vectors passed");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });

  it("shows shared areas and holding pattern when present", async () => {
    const craftShared = {
      ...CRAFT,
      controls: {
        mode: "shared",
        sharedAreas: [
          { pilotId: "cap-id", area: "src/api" },
          { pilotId: "fo-id", area: "src/web" },
        ],
      },
      holdingPattern: true,
    };
    const app = makeApp({ statusCode: 200, body: { ok: true } }, craftShared);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.callTool({ name: "atc_get_context", arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("src/api");
      expect(text).toContain("src/web");
      expect(text).toContain("holding pattern");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });

  it("shows jumpseaters in crew section", async () => {
    const craftNoFOs = {
      ...CRAFT,
      firstOfficers: [] as string[],
      jumpseaters: ["js-id", "js2-id"],
    };
    const app = makeApp({ statusCode: 200, body: { ok: true } }, craftNoFOs);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.callTool({ name: "atc_get_context", arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("js-id");
      expect(text).toContain("js2-id");
      expect(text).not.toContain("First Officers");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: craft-state and craft-vectors resources
// ---------------------------------------------------------------------------

describe("MCP Resources: craft-state and craft-vectors", () => {
  it("craft-state returns craft summary (excluding blackBox/intercom/flightPlan)", async () => {
    const app = makeApp({ statusCode: 200, body: { ok: true } }, CRAFT);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.readResource({ uri: "atc://crafts/ALPHA01" });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe("application/json");
      const data = JSON.parse(
        (result.contents[0] as { uri: string; text: string; mimeType?: string }).text,
      );
      expect(data.callsign).toBe("ALPHA01");
      expect(data.status).toBe("InFlight");
      expect(data.blackBox).toBeUndefined();
      expect(data.intercom).toBeUndefined();
      expect(data.flightPlan).toBeUndefined();

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });

  it("craft-state returns text message when craft not found", async () => {
    const app = makeApp({ statusCode: 200, body: { ok: true } }, null);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.readResource({ uri: "atc://crafts/ALPHA01" });
      expect(result.contents).toHaveLength(1);
      const text = (result.contents[0] as { uri: string; text: string }).text;
      expect(text).toContain("Craft not found");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });

  it("craft-vectors returns flight plan as JSON", async () => {
    const app = makeApp({ statusCode: 200, body: { ok: true } }, CRAFT);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.readResource({ uri: "atc://crafts/ALPHA01/vectors" });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe("application/json");
      const data = JSON.parse(
        (result.contents[0] as { uri: string; text: string; mimeType?: string }).text,
      );
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe("Tests");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });

  it("craft-vectors returns empty array when craft not found", async () => {
    const app = makeApp({ statusCode: 200, body: { ok: true } }, null);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.readResource({ uri: "atc://crafts/ALPHA01/vectors" });
      const data = JSON.parse(
        (result.contents[0] as { uri: string; text: string; mimeType?: string }).text,
      );
      expect(data).toEqual([]);

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: formatAtcError edge cases (non-object body)
// ---------------------------------------------------------------------------

describe("intercom_send GET craft failure", () => {
  it("returns isError when GET craft fails for intercom_send", async () => {
    const app = makeAppWithGetFailure({ statusCode: 404, body: { error: "Craft not found" } });
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "atc_intercom_send",
        arguments: { content: "hello" },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Craft not found");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: resolveSeat "Unknown" edge case
// ---------------------------------------------------------------------------

describe("resolveSeat Unknown pilot", () => {
  it("atc_get_context shows Unknown seat for unrecognized pilot", async () => {
    const craftNoPilot = {
      ...CRAFT,
      captain: "other-cap",
      firstOfficers: ["other-fo"],
      jumpseaters: ["other-js"],
    };
    const app = makeApp({ statusCode: 200, body: { ok: true } }, craftNoPilot);
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.callTool({ name: "atc_get_context", arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Unknown");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: formatAtcError edge cases (non-object body)
// ---------------------------------------------------------------------------

describe("formatAtcError edge cases", () => {
  it("surfaces non-object error body as string", async () => {
    const app = makeAppWithGetFailure({ statusCode: 500, body: "plain string error" });
    const { fastifyApp, transport } = await buildAndConnect("cap-id", app);

    try {
      const port = (fastifyApp.server.address() as { port: number }).port;
      const client = new Client({ name: "test-client", version: "1.0.0" });
      const clientTransport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await client.connect(clientTransport);

      const result = await client.callTool({ name: "atc_get_context", arguments: {} });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("ATC_ERROR");
      expect(text).toContain("plain string error");

      await client.close();
    } finally {
      await transport.close();
      await fastifyApp.close();
    }
  });
});
