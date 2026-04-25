/**
 * Integration tests for the MCP server Fastify plugin.
 *
 * Tests the session handshake and basic routing behavior.
 * Full tool/resource behavior tested in build-server.test.ts.
 */

import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { mcpPlugin } from "./plugin.js";

// ---------------------------------------------------------------------------
// Minimal test fixture
// ---------------------------------------------------------------------------

function makeCraftStore(craft: Record<string, unknown> | null) {
  return {
    get: (_project: string, _callsign: string) => craft,
  };
}

function makeMockApp(craft: Record<string, unknown> | null = null): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate("craftStore", makeCraftStore(craft));
  // Provide a minimal inject-compatible interface for the internal helpers
  void app.register(mcpPlugin);

  return app;
}

// ---------------------------------------------------------------------------
// POST /api/v1/mcp/session
// ---------------------------------------------------------------------------

describe("POST /api/v1/mcp/session", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("returns 400 when required fields are missing", async () => {
    app = makeMockApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mcp/session",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/required/);
  });

  it("returns 404 when craft does not exist", async () => {
    app = makeMockApp(null);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mcp/session",
      payload: { pilotId: "p1", callsign: "ALPHA01", projectName: "proj" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 403 when pilot is not on the craft", async () => {
    app = makeMockApp({
      callsign: "ALPHA01",
      captain: "captain-id",
      firstOfficers: [],
      jumpseaters: [],
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mcp/session",
      payload: { pilotId: "unknown-pilot", callsign: "ALPHA01", projectName: "proj" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ ruleId: string }>().ruleId).toBe("RULE-SEAT-1");
  });

  it("returns 201 with token when pilot is the captain", async () => {
    app = makeMockApp({
      callsign: "ALPHA01",
      status: "InFlight",
      cargo: "test cargo",
      branch: "feature/test",
      category: "feature",
      captain: "cap-id",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "cap-id" },
      holdingPattern: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mcp/session",
      payload: { pilotId: "cap-id", callsign: "ALPHA01", projectName: "proj" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ token: string }>();
    expect(typeof body.token).toBe("string");
    expect(body.token).toHaveLength(36); // UUID
  });

  it("accepts a first officer", async () => {
    app = makeMockApp({
      callsign: "ALPHA01",
      status: "InFlight",
      cargo: "test",
      branch: "feature/test",
      category: "feature",
      captain: "cap-id",
      firstOfficers: ["fo-id"],
      jumpseaters: [],
      flightPlan: [],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "cap-id" },
      holdingPattern: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mcp/session",
      payload: { pilotId: "fo-id", callsign: "ALPHA01", projectName: "proj" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("accepts a jumpseater", async () => {
    app = makeMockApp({
      callsign: "ALPHA01",
      status: "InFlight",
      cargo: "test",
      branch: "feature/test",
      category: "feature",
      captain: "cap-id",
      firstOfficers: [],
      jumpseaters: ["js-id"],
      flightPlan: [],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "cap-id" },
      holdingPattern: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mcp/session",
      payload: { pilotId: "js-id", callsign: "ALPHA01", projectName: "proj" },
    });
    expect(res.statusCode).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/mcp/session
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/mcp/session", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("returns 401 without a token", async () => {
    app = makeMockApp();
    const res = await app.inject({ method: "DELETE", url: "/api/v1/mcp/session" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 204 when deleting a valid session", async () => {
    app = makeMockApp({
      callsign: "ALPHA01",
      status: "InFlight",
      cargo: "test",
      branch: "feature/test",
      category: "feature",
      captain: "cap-id",
      firstOfficers: [],
      jumpseaters: [],
      flightPlan: [],
      blackBox: [],
      intercom: [],
      controls: { mode: "exclusive", holder: "cap-id" },
      holdingPattern: false,
    });
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/mcp/session",
      payload: { pilotId: "cap-id", callsign: "ALPHA01", projectName: "proj" },
    });
    expect(createRes.statusCode).toBe(201);
    const { token } = createRes.json<{ token: string }>();

    const deleteRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/mcp/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteRes.statusCode).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// POST/GET /api/v1/mcp (MCP endpoint auth gate)
// ---------------------------------------------------------------------------

const FULL_CRAFT = {
  callsign: "ALPHA01",
  status: "InFlight",
  cargo: "test",
  branch: "feature/test",
  category: "feature",
  captain: "cap-id",
  firstOfficers: [],
  jumpseaters: [],
  flightPlan: [],
  blackBox: [],
  intercom: [],
  controls: { mode: "exclusive", holder: "cap-id" },
  holdingPattern: false,
};

async function createSession(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/mcp/session",
    payload: { pilotId: "cap-id", callsign: "ALPHA01", projectName: "proj" },
  });
  return res.json<{ token: string }>().token;
}

describe("MCP endpoint authentication", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("POST /api/v1/mcp returns 401 without token", async () => {
    app = makeMockApp();
    const res = await app.inject({ method: "POST", url: "/api/v1/mcp", payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/mcp returns 401 without token", async () => {
    app = makeMockApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/mcp" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/mcp returns 401 with invalid token", async () => {
    app = makeMockApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mcp",
      payload: {},
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/mcp — session-bound transport forwarding
// ---------------------------------------------------------------------------

describe("GET /api/v1/mcp with valid session", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("forwards to transport when session is valid", async () => {
    app = makeMockApp(FULL_CRAFT);
    const token = await createSession(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/mcp",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(404);
  });

  it("returns 401 with expired/invalid token", async () => {
    app = makeMockApp(FULL_CRAFT);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/mcp",
      headers: { authorization: "Bearer expired-token" },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/mcp — close MCP SSE session
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/mcp", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("returns 401 without a token", async () => {
    app = makeMockApp();
    const res = await app.inject({ method: "DELETE", url: "/api/v1/mcp" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 with an invalid token", async () => {
    app = makeMockApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/mcp",
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("forwards to transport with a valid session token", async () => {
    app = makeMockApp(FULL_CRAFT);
    const token = await createSession(app);

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/mcp",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(404);
  });
});
