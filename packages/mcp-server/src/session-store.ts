/**
 * In-memory session store for ATC MCP sessions.
 *
 * Each session maps an opaque token to a pilot's identity and craft context.
 * Sessions are created via `POST /api/v1/mcp/session` and expire only on
 * explicit deletion or server restart.
 */

import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/**
 * Identity context bound to an ATC MCP session.
 */
export interface AtcSession {
  /** Pilot identifier for the connected agent. */
  pilotId: string;
  /** Aviation callsign of the craft the pilot is operating on. */
  callsign: string;
  /** Name of the project the craft belongs to. */
  projectName: string;
}

/**
 * Internal session entry: session identity + live MCP server/transport pair.
 */
export interface SessionEntry {
  session: AtcSession;
  mcpServer: McpServer;
  transport: StreamableHTTPServerTransport;
}

/**
 * Thread-safe (single-process, single-threaded Node.js) session store.
 * Keyed by opaque session token (UUID).
 */
export class SessionStore {
  private readonly _sessions = new Map<string, SessionEntry>();

  /**
   * Creates a new session token and stores the entry.
   *
   * @param entry - The session entry to store.
   * @returns The generated session token.
   */
  create(entry: SessionEntry): string {
    const token = randomUUID();
    this._sessions.set(token, entry);
    return token;
  }

  /**
   * Retrieves a session entry by token, or `undefined` if not found.
   */
  get(token: string): SessionEntry | undefined {
    return this._sessions.get(token);
  }

  /**
   * Deletes a session and closes its transport.
   */
  async delete(token: string): Promise<void> {
    const entry = this._sessions.get(token);
    if (entry) {
      this._sessions.delete(token);
      await entry.transport.close();
    }
  }
}
