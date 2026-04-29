/**
 * Builds a bound McpServer + StreamableHTTPServerTransport for one ATC session.
 *
 * All tool calls route through the daemon's existing REST API handlers via
 * `app.inject()`, ensuring RULE-LIFE-3, RULE-LCHK-3, RULE-EMER-1, and
 * RULE-CTRL-2 enforcement is never bypassed.
 *
 * The 4 MCP resources read directly from the craft store (read-only, no mutex risk).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { AtcSession } from "./session-store.js";

// ---------------------------------------------------------------------------
// Minimal duck-typed Fastify interface (avoids circular dep on daemon)
// ---------------------------------------------------------------------------

/** Minimal craft shape needed for resource reads. */
interface StoredCraft {
  callsign: string;
  status: string;
  cargo: string;
  branch: string;
  category: string;
  captain: string;
  firstOfficers: string[];
  jumpseaters: string[];
  flightPlan: Array<{ name: string; acceptanceCriteria: string; status: string }>;
  blackBox: Array<{ type: string; timestamp: string; author: string; content: string }>;
  intercom: Array<{ from: string; seat: string; content: string; timestamp: string }>;
  controls: {
    mode: string;
    holder?: string;
    sharedAreas?: Array<{ pilotId: string; area: string }>;
  };
  holdingPattern: boolean;
}

interface MinimalCraftStore {
  get(projectName: string, callsign: string): StoredCraft | undefined;
}

/** Minimal subset of FastifyInstance the MCP server needs. */
export interface AtcAppInstance {
  craftStore: MinimalCraftStore;
  inject(opts: {
    method: string;
    url: string;
    payload?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ statusCode: number; json<T = unknown>(): T }>;
}

// ---------------------------------------------------------------------------
// Error shape returned from ATC rule violations
// ---------------------------------------------------------------------------

interface AtcError {
  code: string;
  message: string;
  fixHint?: string;
}

function formatAtcError(body: unknown): AtcError {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    return {
      code: typeof b["ruleId"] === "string" ? b["ruleId"] : "ATC_ERROR",
      message: typeof b["error"] === "string" ? b["error"] : JSON.stringify(body),
      fixHint: typeof b["hint"] === "string" ? b["hint"] : undefined,
    };
  }
  return { code: "ATC_ERROR", message: String(body) };
}

function errorText(err: AtcError): string {
  const hint = err.fixHint ? ` Fix: ${err.fixHint}` : "";
  return `[${err.code}] ${err.message}${hint}`;
}

// ---------------------------------------------------------------------------
// Seat resolution
// ---------------------------------------------------------------------------

type SeatType = "Captain" | "FirstOfficer" | "Jumpseat" | "Unknown";

function resolveSeat(craft: StoredCraft, pilotId: string): SeatType {
  if (craft.captain === pilotId) return "Captain";
  if (craft.firstOfficers.includes(pilotId)) return "FirstOfficer";
  if (craft.jumpseaters.includes(pilotId)) return "Jumpseat";
  return "Unknown";
}

function requireMinSeat(seat: SeatType, minimum: "Captain" | "CaptainOrFO"): string | null {
  if (minimum === "Captain" && seat !== "Captain") {
    return "This action requires Captain authority.";
  }
  if (minimum === "CaptainOrFO" && seat !== "Captain" && seat !== "FirstOfficer") {
    return "This action requires Captain or First Officer authority.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Creates a fully-wired McpServer bound to the given ATC session.
 *
 * All mutating tool calls use `app.inject()` to pass through the daemon's
 * existing REST route handlers, preserving all spec-mandated enforcement.
 *
 * @param session - The ATC session context (pilotId, callsign, projectName).
 * @param app - The Fastify application instance.
 * @returns A connected mcpServer + transport pair.
 *
 * @see RULE-CTRL-2 — seat gating for controls operations.
 * @see RULE-EMER-1 — emergency declaration requires Captain.
 * @see RULE-TOWER-2 — clearance requires all vectors passed.
 */
export async function buildAtcMcpServer(
  session: AtcSession,
  app: AtcAppInstance,
): Promise<{ mcpServer: McpServer; transport: StreamableHTTPServerTransport }> {
  const { pilotId, callsign, projectName } = session;

  const mcpServer = new McpServer(
    { name: "atc-mcp-server", version: "0.1.0" },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // -------------------------------------------------------------------------
  // Helper: inject a request through the daemon's REST layer
  // -------------------------------------------------------------------------

  async function inject(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ statusCode: number; json: unknown }> {
    const opts: Parameters<AtcAppInstance["inject"]>[0] = {
      method,
      url: path,
      headers: { "content-type": "application/json" },
    };
    if (body !== undefined) {
      opts.payload = body;
    }
    const res = await app.inject(opts);
    return { statusCode: res.statusCode, json: res.json() };
  }

  function craftPath(): string {
    return `/api/v1/projects/${encodeURIComponent(projectName)}/crafts/${encodeURIComponent(callsign)}`;
  }

  // -------------------------------------------------------------------------
  // atc_get_context — All seats
  // -------------------------------------------------------------------------

  mcpServer.registerTool(
    "atc_get_context",
    {
      description: "Get a structured briefing for the current pilot and craft state.",
      inputSchema: z.object({}),
    },
    async () => {
      const craftRes = await inject("GET", craftPath());
      if (craftRes.statusCode !== 200) {
        const err = formatAtcError(craftRes.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      const craft = craftRes.json as StoredCraft;
      const seat = resolveSeat(craft, pilotId);

      const currentVector = craft.flightPlan.find((v) => v.status === "Pending");
      const passedCount = craft.flightPlan.filter((v) => v.status === "Passed").length;

      const lines = [
        `# ATC Pilot Briefing`,
        ``,
        `**Pilot:** ${pilotId}  **Seat:** ${seat}`,
        `**Craft:** ${callsign}  **Status:** ${craft.status}`,
        `**Project:** ${projectName}  **Branch:** ${craft.branch}`,
        `**Cargo:** ${craft.cargo}`,
        ``,
        `## Flight Plan`,
        `${passedCount}/${craft.flightPlan.length} vectors passed`,
        ...(currentVector
          ? [`**Current vector:** ${currentVector.name}`, `> ${currentVector.acceptanceCriteria}`]
          : [`**All vectors passed.**`]),
        ``,
        `## Controls`,
        `Mode: ${craft.controls.mode}${
          craft.controls.holder ? `  Holder: ${craft.controls.holder}` : ""
        }`,
        ...(craft.controls.sharedAreas?.length
          ? craft.controls.sharedAreas.map((a) => `  - ${a.area} → ${a.pilotId}`)
          : []),
        ``,
        `## Crew`,
        `Captain: ${craft.captain}`,
        ...(craft.firstOfficers.length
          ? [`First Officers: ${craft.firstOfficers.join(", ")}`]
          : []),
        ...(craft.jumpseaters.length ? [`Jumpseaters: ${craft.jumpseaters.join(", ")}`] : []),
        ...(craft.holdingPattern ? [``, `⚠ Craft is in a holding pattern (TFR active).`] : []),
      ];

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );

  // -------------------------------------------------------------------------
  // atc_intercom_send — All seats
  // -------------------------------------------------------------------------

  mcpServer.registerTool(
    "atc_intercom_send",
    {
      description: "Send a message to the craft intercom. Visible to all crew.",
      inputSchema: z.object({
        content: z.string().describe("The message text to broadcast on the intercom."),
      }),
    },
    async ({ content }) => {
      const craftRes = await inject("GET", craftPath());
      if (craftRes.statusCode !== 200) {
        const err = formatAtcError(craftRes.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      const craft = craftRes.json as StoredCraft;
      const seat = resolveSeat(craft, pilotId);

      const res = await inject("POST", `${craftPath()}/intercom`, {
        from: pilotId,
        seat,
        content,
      });
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        const err = formatAtcError(res.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      return { content: [{ type: "text" as const, text: "Intercom message sent." }] };
    },
  );

  // -------------------------------------------------------------------------
  // atc_controls_read — All seats
  // -------------------------------------------------------------------------

  mcpServer.registerTool(
    "atc_controls_read",
    {
      description: "Read the current controls state (who holds modification rights).",
      inputSchema: z.object({}),
    },
    async () => {
      const res = await inject("GET", `${craftPath()}/controls`);
      if (res.statusCode !== 200) {
        const err = formatAtcError(res.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(res.json, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  // atc_controls_transfer — Captain / FO
  // -------------------------------------------------------------------------

  mcpServer.registerTool(
    "atc_controls_transfer",
    {
      description: "Transfer exclusive controls to a pilot. Requires Captain or First Officer.",
      inputSchema: z.object({
        targetPilotId: z.string().describe("Pilot identifier to transfer controls to."),
      }),
    },
    async ({ targetPilotId }) => {
      const craftRes = await inject("GET", craftPath());
      if (craftRes.statusCode !== 200) {
        const err = formatAtcError(craftRes.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      const seat = resolveSeat(craftRes.json as StoredCraft, pilotId);
      const seatErr = requireMinSeat(seat, "CaptainOrFO");
      if (seatErr) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `[RULE-CTRL-2] ${seatErr}` }],
        };
      }

      const res = await inject("POST", `${craftPath()}/controls/claim`, {
        pilotId: targetPilotId,
      });
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        const err = formatAtcError(res.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Controls transferred to ${targetPilotId}.`,
          },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // atc_controls_share — Captain / FO
  // -------------------------------------------------------------------------

  mcpServer.registerTool(
    "atc_controls_share",
    {
      description:
        "Switch to shared controls mode with non-overlapping area assignments. Requires Captain or First Officer.",
      inputSchema: z.object({
        areas: z
          .array(
            z.object({
              pilotId: z.string().describe("Pilot identifier."),
              area: z.string().describe("Path prefix this pilot may modify (e.g. src/api)."),
            }),
          )
          .describe("Non-overlapping area assignments."),
      }),
    },
    async ({ areas }) => {
      const craftRes = await inject("GET", craftPath());
      if (craftRes.statusCode !== 200) {
        const err = formatAtcError(craftRes.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      const seat = resolveSeat(craftRes.json as StoredCraft, pilotId);
      const seatErr = requireMinSeat(seat, "CaptainOrFO");
      if (seatErr) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `[RULE-CTRL-2] ${seatErr}` }],
        };
      }

      const res = await inject("POST", `${craftPath()}/controls/share`, { areas });
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        const err = formatAtcError(res.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Controls switched to shared mode with ${areas.length} area(s).`,
          },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // atc_craft_report_vector — Captain / FO
  // -------------------------------------------------------------------------

  mcpServer.registerTool(
    "atc_craft_report_vector",
    {
      description:
        "Report a vector (milestone) as passed with evidence. Requires Captain or First Officer.",
      inputSchema: z.object({
        vectorName: z.string().describe("Name of the vector to report."),
        evidence: z.string().describe("Evidence that the acceptance criteria have been met."),
      }),
    },
    async ({ vectorName, evidence }) => {
      const craftRes = await inject("GET", craftPath());
      if (craftRes.statusCode !== 200) {
        const err = formatAtcError(craftRes.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      const seat = resolveSeat(craftRes.json as StoredCraft, pilotId);
      const seatErr = requireMinSeat(seat, "CaptainOrFO");
      if (seatErr) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `[RULE-CTRL-2] ${seatErr}` }],
        };
      }

      const encodedVector = encodeURIComponent(vectorName);
      const res = await inject("POST", `${craftPath()}/vectors/${encodedVector}/report`, {
        evidence,
      });
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        const err = formatAtcError(res.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      return {
        content: [{ type: "text" as const, text: `Vector "${vectorName}" reported as passed.` }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // atc_craft_run_checklist — Captain / FO
  // -------------------------------------------------------------------------

  mcpServer.registerTool(
    "atc_craft_run_checklist",
    {
      description: "Run the landing checklist for this craft. Requires Captain or First Officer.",
      inputSchema: z.object({}),
    },
    async () => {
      const craftRes = await inject("GET", craftPath());
      if (craftRes.statusCode !== 200) {
        const err = formatAtcError(craftRes.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      const seat = resolveSeat(craftRes.json as StoredCraft, pilotId);
      const seatErr = requireMinSeat(seat, "CaptainOrFO");
      if (seatErr) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `[RULE-LCHK-1] ${seatErr}` }],
        };
      }

      const res = await inject("POST", `${craftPath()}/checklist`, { pilotId });
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        const err = formatAtcError(res.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(res.json, null, 2) }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // atc_tower_request_clearance — Captain only
  // -------------------------------------------------------------------------

  mcpServer.registerTool(
    "atc_tower_request_clearance",
    {
      description: "Request landing clearance from the tower. Requires Captain authority.",
      inputSchema: z.object({}),
    },
    async () => {
      const craftRes = await inject("GET", craftPath());
      if (craftRes.statusCode !== 200) {
        const err = formatAtcError(craftRes.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      const seat = resolveSeat(craftRes.json as StoredCraft, pilotId);
      const seatErr = requireMinSeat(seat, "Captain");
      if (seatErr) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `[RULE-TOWER-2] ${seatErr}` }],
        };
      }

      const res = await inject(
        "POST",
        `/api/v1/projects/${encodeURIComponent(projectName)}/tower/clearance`,
        {
          callsign,
        },
      );
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        const err = formatAtcError(res.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Landing clearance granted. Craft ${callsign} is queued for merge.`,
          },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // atc_tower_execute_merge — Captain only
  // -------------------------------------------------------------------------

  mcpServer.registerTool(
    "atc_tower_execute_merge",
    {
      description:
        "Execute the merge for this craft when it is at the head of the tower queue. Requires Captain authority.",
      inputSchema: z.object({}),
    },
    async () => {
      const craftRes = await inject("GET", craftPath());
      if (craftRes.statusCode !== 200) {
        const err = formatAtcError(craftRes.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      const seat = resolveSeat(craftRes.json as StoredCraft, pilotId);
      const seatErr = requireMinSeat(seat, "Captain");
      if (seatErr) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `[RULE-TMRG-1] ${seatErr}` }],
        };
      }

      const res = await inject(
        "POST",
        `/api/v1/projects/${encodeURIComponent(projectName)}/tower/merge`,
        {
          callsign,
        },
      );
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        const err = formatAtcError(res.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      return {
        content: [{ type: "text" as const, text: `Merge executed for ${callsign}.` }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // atc_declare_emergency — Captain only
  // -------------------------------------------------------------------------

  mcpServer.registerTool(
    "atc_declare_emergency",
    {
      description:
        "Declare an emergency on this craft. Captain authority required. Use only for genuine blockers.",
      inputSchema: z.object({
        reason: z.string().describe("Clear explanation of the emergency condition."),
      }),
    },
    async ({ reason }) => {
      const craftRes = await inject("GET", craftPath());
      if (craftRes.statusCode !== 200) {
        const err = formatAtcError(craftRes.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      const seat = resolveSeat(craftRes.json as StoredCraft, pilotId);
      const seatErr = requireMinSeat(seat, "Captain");
      if (seatErr) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `[RULE-EMER-1] ${seatErr}` }],
        };
      }

      const res = await inject("POST", `${craftPath()}/emergency`, { pilotId, reason });
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        const err = formatAtcError(res.json);
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
      return {
        content: [{ type: "text" as const, text: `Emergency declared on ${callsign}: ${reason}` }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // MCP Resources (read-only, read directly from craftStore)
  // -------------------------------------------------------------------------

  // atc://crafts/{callsign} — craft state
  mcpServer.resource("craft-state", `atc://crafts/${encodeURIComponent(callsign)}`, async () => {
    const craft = app.craftStore.get(projectName, callsign);
    if (!craft) {
      return {
        contents: [
          {
            uri: `atc://crafts/${encodeURIComponent(callsign)}`,
            text: `Craft not found: ${callsign}`,
          },
        ],
      };
    }
    const { blackBox: _bb, intercom: _ic, flightPlan: _fp, ...summary } = craft;
    return {
      contents: [
        {
          uri: `atc://crafts/${encodeURIComponent(callsign)}`,
          mimeType: "application/json",
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  });

  // atc://crafts/{callsign}/vectors — flight plan
  mcpServer.resource(
    "craft-vectors",
    `atc://crafts/${encodeURIComponent(callsign)}/vectors`,
    async () => {
      const craft = app.craftStore.get(projectName, callsign);
      if (!craft) {
        return {
          contents: [
            {
              uri: `atc://crafts/${encodeURIComponent(callsign)}/vectors`,
              text: `Craft not found: ${callsign}`,
            },
          ],
        };
      }
      return {
        contents: [
          {
            uri: `atc://crafts/${encodeURIComponent(callsign)}/vectors`,
            mimeType: "application/json",
            text: JSON.stringify(craft.flightPlan, null, 2),
          },
        ],
      };
    },
  );

  // atc://crafts/{callsign}/intercom — intercom history
  mcpServer.resource(
    "craft-intercom",
    `atc://crafts/${encodeURIComponent(callsign)}/intercom`,
    async () => {
      const craft = app.craftStore.get(projectName, callsign);
      return {
        contents: [
          {
            uri: `atc://crafts/${encodeURIComponent(callsign)}/intercom`,
            mimeType: "application/json",
            text: JSON.stringify(craft?.intercom ?? [], null, 2),
          },
        ],
      };
    },
  );

  // atc://crafts/{callsign}/blackbox — black box entries
  mcpServer.resource(
    "craft-blackbox",
    `atc://crafts/${encodeURIComponent(callsign)}/blackbox`,
    async () => {
      const craft = app.craftStore.get(projectName, callsign);
      return {
        contents: [
          {
            uri: `atc://crafts/${encodeURIComponent(callsign)}/blackbox`,
            mimeType: "application/json",
            text: JSON.stringify(craft?.blackBox ?? [], null, 2),
          },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Wire up transport
  // -------------------------------------------------------------------------

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  await mcpServer.connect(transport);

  return { mcpServer, transport };
}
