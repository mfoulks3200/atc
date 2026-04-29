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
  blackBox: [],
  intercom: [],
  controls: { mode: "exclusive", holder: "cap-id" },
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
        return { statusCode: 200, json: <T>() => (craftData ?? {}) as unknown as T };
      }
      return {
        statusCode: mutationResponse.statusCode,
        json: <T>() => mutationResponse.body as unknown as T,
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
    const app = makeApp(
      { statusCode: 403, body: { error: "not authorized", ruleId: "RULE-SEAT-1" } },
      CRAFT,
    );
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
