import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../app.js";
import { CraftStore } from "../../state/craft-store.js";
import { AgentStore } from "../../state/agent-store.js";
import { TowerStore } from "../../state/tower-store.js";
import { PilotStore } from "../../state/pilot-store.js";
import { PilotKeystore, generateEd25519KeyPair } from "../../state/pilot-keystore.js";
import { signBlackBoxEntry } from "../../signing/sign.js";
import { CraftStatus, BlackBoxEntryType } from "@airtrafficcontrol/types";
import type { CraftState, PilotRecord } from "../../types.js";

const PROJECT = "test-project";

function makeEntry(
  content: string,
  overrides?: Partial<CraftState["blackBox"][number]>,
): CraftState["blackBox"][number] {
  return {
    timestamp: new Date().toISOString(),
    author: "pilot-1",
    type: BlackBoxEntryType.Decision,
    content,
    signature: null,
    traceContext: null,
    ...overrides,
  };
}

function makeCraft(blackBox: CraftState["blackBox"] = []): CraftState {
  return {
    callsign: "echo-1",
    createdAt: "2026-04-11T00:00:00.000Z",
    branch: "feat/echo",
    cargo: "Build echo",
    category: "backend",
    status: CraftStatus.InFlight,
    captain: "pilot-1",
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [],
    blackBox,
    intercom: [],
    controls: { mode: "exclusive", holder: "pilot-1" },
    holdingPattern: false,
  };
}

describe("blackbox routes", () => {
  let app: FastifyInstance;
  let craftStore: CraftStore;
  let pilotStore: PilotStore;
  let pilotKeystore: PilotKeystore;

  beforeEach(() => {
    craftStore = new CraftStore("/tmp/atc-bb-test");
    pilotStore = new PilotStore("/tmp/atc-bb-test");
    pilotKeystore = new PilotKeystore("/tmp/atc-bb-test");
    app = createApp({
      craftStore,
      agentStore: new AgentStore("/tmp/atc-bb-test"),
      towerStore: new TowerStore("/tmp/atc-bb-test"),
      pilotStore,
      pilotKeystore,
    });
    craftStore.set(PROJECT, makeCraft([makeEntry("Chose approach A over B")]));
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /blackbox
  // -------------------------------------------------------------------------

  describe("GET /api/v1/projects/:name/crafts/:callsign/blackbox", () => {
    it("returns the black box entries", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox`,
      });
      expect(res.statusCode).toBe(200);
      const entries = res.json<Array<{ type: string; content: string }>>();
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("Decision");
      expect(entries[0].content).toBe("Chose approach A over B");
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/blackbox`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // GET /blackbox/export (RULE-BBOX-6)
  // -------------------------------------------------------------------------

  describe("GET /api/v1/projects/:name/crafts/:callsign/blackbox/export", () => {
    it("returns NDJSON with Content-Type application/x-ndjson", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox/export`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/x-ndjson/);
      const lines = res.body.split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0]);
      expect(entry.content).toBe("Chose approach A over B");
    });

    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/blackbox/export`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("supports ?limit and ?offset pagination", async () => {
      craftStore.set(
        PROJECT,
        makeCraft([
          makeEntry("entry-0"),
          makeEntry("entry-1"),
          makeEntry("entry-2"),
          makeEntry("entry-3"),
        ]),
      );

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox/export?limit=2&offset=1`,
      });
      expect(res.statusCode).toBe(200);
      const lines = res.body.split("\n").filter(Boolean);
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).content).toBe("entry-1");
      expect(JSON.parse(lines[1]).content).toBe("entry-2");
    });

    it("returns all entries when no limit specified", async () => {
      craftStore.set(PROJECT, makeCraft([makeEntry("a"), makeEntry("b"), makeEntry("c")]));
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox/export`,
      });
      const lines = res.body.split("\n").filter(Boolean);
      expect(lines).toHaveLength(3);
    });

    it("each line is a self-contained JSON object", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox/export`,
      });
      const lines = res.body.split("\n").filter(Boolean);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
        const obj = JSON.parse(line);
        expect(obj).toHaveProperty("timestamp");
        expect(obj).toHaveProperty("author");
        expect(obj).toHaveProperty("type");
        expect(obj).toHaveProperty("content");
      }
    });
  });

  // -------------------------------------------------------------------------
  // GET /blackbox/verify (RULE-BBOX-8)
  // -------------------------------------------------------------------------

  describe("GET /api/v1/projects/:name/crafts/:callsign/blackbox/verify", () => {
    it("returns 404 for unknown craft", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/ghost/blackbox/verify`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("classifies unsigned entries as 'unsigned'", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox/verify`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        total: number;
        verified: number;
        unsigned: number;
        tampered: number;
        unresolvable: number;
      }>();
      expect(body.total).toBe(1);
      expect(body.unsigned).toBe(1);
      expect(body.verified).toBe(0);
      expect(body.tampered).toBe(0);
      expect(body.unresolvable).toBe(0);
    });

    it("classifies 'author-not-found' when author pilot is missing", async () => {
      const timestamp = "2026-04-30T00:00:00.000Z";
      const { privateKey, publicKey } = generateEd25519KeyPair();
      const entry = makeEntry("signed content", {
        author: "ghost-pilot",
        timestamp,
        signature: signBlackBoxEntry(privateKey, publicKey, {
          timestamp,
          author: "ghost-pilot",
          type: BlackBoxEntryType.Decision,
          content: "signed content",
        }),
      });
      craftStore.set(PROJECT, makeCraft([entry]));

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox/verify`,
      });
      const body = res.json<{ unresolvable: number; entries: Array<{ state: string }> }>();
      expect(body.unresolvable).toBe(1);
      expect(body.entries[0].state).toBe("author-not-found");
    });

    it("classifies 'signed-valid' for a correct signature", async () => {
      const { privateKey, publicKey } = generateEd25519KeyPair();
      const timestamp = "2026-04-30T00:00:00.000Z";
      const entry = makeEntry("signed content", {
        timestamp,
        signature: signBlackBoxEntry(privateKey, publicKey, {
          timestamp,
          author: "pilot-1",
          type: BlackBoxEntryType.Decision,
          content: "signed content",
        }),
      });
      craftStore.set(PROJECT, makeCraft([entry]));

      const pilot: PilotRecord = {
        identifier: "pilot-1",
        certifications: [],
        mcpServers: {},
        publicKey,
        keyHistory: [{ publicKey, validFrom: "2026-01-01T00:00:00Z", validUntil: null }],
      };
      pilotStore.set(PROJECT, pilot);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox/verify`,
      });
      const body = res.json<{ verified: number; entries: Array<{ state: string }> }>();
      expect(body.verified).toBe(1);
      expect(body.entries[0].state).toBe("signed-valid");
    });

    it("classifies 'signed-invalid' for a tampered entry", async () => {
      const { privateKey, publicKey } = generateEd25519KeyPair();
      const timestamp = "2026-04-30T00:00:00.000Z";
      const originalContent = "original content";
      const sig = signBlackBoxEntry(privateKey, publicKey, {
        timestamp,
        author: "pilot-1",
        type: BlackBoxEntryType.Decision,
        content: originalContent,
      });
      const entry = makeEntry("tampered content", { timestamp, signature: sig });
      craftStore.set(PROJECT, makeCraft([entry]));

      const pilot: PilotRecord = {
        identifier: "pilot-1",
        certifications: [],
        mcpServers: {},
        publicKey,
        keyHistory: [{ publicKey, validFrom: "2026-01-01T00:00:00Z", validUntil: null }],
      };
      pilotStore.set(PROJECT, pilot);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox/verify`,
      });
      const body = res.json<{ tampered: number; entries: Array<{ state: string }> }>();
      expect(body.tampered).toBe(1);
      expect(body.entries[0].state).toBe("signed-invalid");
    });

    it("returns correct aggregates for mixed entries", async () => {
      const { privateKey, publicKey } = generateEd25519KeyPair();
      const timestamp = "2026-04-30T00:00:00.000Z";

      const signedEntry = makeEntry("signed", {
        timestamp,
        signature: signBlackBoxEntry(privateKey, publicKey, {
          timestamp,
          author: "pilot-1",
          type: BlackBoxEntryType.Decision,
          content: "signed",
        }),
      });
      const unsignedEntry = makeEntry("unsigned");
      craftStore.set(PROJECT, makeCraft([signedEntry, unsignedEntry]));

      const pilot: PilotRecord = {
        identifier: "pilot-1",
        certifications: [],
        mcpServers: {},
        publicKey,
        keyHistory: [{ publicKey, validFrom: "2026-01-01T00:00:00Z", validUntil: null }],
      };
      pilotStore.set(PROJECT, pilot);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${PROJECT}/crafts/echo-1/blackbox/verify`,
      });
      const body = res.json<{
        total: number;
        verified: number;
        unsigned: number;
        tampered: number;
        unresolvable: number;
      }>();
      expect(body.total).toBe(2);
      expect(body.verified).toBe(1);
      expect(body.unsigned).toBe(1);
      expect(body.tampered).toBe(0);
      expect(body.unresolvable).toBe(0);
    });
  });
});
