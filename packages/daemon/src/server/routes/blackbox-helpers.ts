/**
 * Helpers for appending to a craft's black box from REST routes.
 *
 * Wraps the core {@link createBlackBoxEntry} / {@link appendToBlackBox} helpers
 * so route handlers get a single call that (1) records the entry on the
 * persisted craft state, (2) optionally signs the entry (RULE-BBOX-7),
 * (3) optionally attaches OTel trace context (RULE-BBOX-5), and (4) broadcasts
 * it on the WebSocket channels so subscribers receive a streaming event log.
 *
 * @see RULE-BBOX-1 — black box created at Taxiing, persists for lifecycle.
 * @see RULE-BBOX-2 — entries are append-only.
 * @see RULE-BBOX-3 — all pilots may write to the black box.
 * @see RULE-BBOX-5 — trace context on entries when project has it enabled.
 * @see RULE-BBOX-7 — COSE_Sign1 signing for pilots with registered key pairs.
 */

import type { FastifyInstance } from "fastify";
import {
  createBlackBoxEntry as createCoreEntry,
  appendToBlackBox as appendCoreEntry,
} from "@airtrafficcontrol/core";
import type { BlackBoxEntryType } from "@airtrafficcontrol/types";
import type { BlackBoxEntry, CraftState, WsEvent } from "../../types.js";
import type { ChannelRegistry } from "../websocket/channels.js";
import { signBlackBoxEntry } from "../../signing/sign.js";
import { generateTraceContext } from "../../signing/trace.js";

/**
 * Resolves whether trace context is enabled for a project by consulting
 * the layered project config stores on the Fastify instance.
 */
function isTraceContextEnabled(app: FastifyInstance, project: string): boolean {
  const store = app.projectConfigStores.get(project);
  if (!store) return false;
  const config = store.get();
  return (config as { traceContextEnabled?: boolean }).traceContextEnabled === true;
}

/**
 * Options for {@link appendBlackBoxEntry} beyond the positional parameters.
 */
export interface AppendBlackBoxOptions {
  /**
   * The pilot identity verified by the request's authentication layer.
   * Signing only proceeds when this matches `author`. Omit for system
   * entries or unauthenticated paths — the entry will be unsigned.
   *
   * @see RULE-PILOT-3b
   */
  authenticatedPilotId?: string;
}

/**
 * Append a single black box entry to a craft and broadcast it.
 *
 * This is the only function routes should call to add lifecycle entries. It:
 *
 * 1. Builds the entry via the core `createBlackBoxEntry` helper so the
 *    author/type/content shape is consistent across packages.
 * 2. Optionally signs the entry with a COSE_Sign1 envelope if the author pilot
 *    has a registered Ed25519 key pair AND the request is authenticated as
 *    that pilot (RULE-BBOX-7, RULE-PILOT-3b).
 * 3. Attaches OTel trace context if enabled for the project. (RULE-BBOX-5)
 * 4. Uses the core `appendToBlackBox` helper to honor the append-only
 *    invariant (RULE-BBOX-2). The helper returns a new array which is then
 *    assigned back to `craft.blackBox` after normalising timestamps to ISO
 *    strings (daemon state is JSON-persisted, so `Date` objects from core
 *    must be serialized).
 * 5. Publishes a `craft.blackbox.appended` event on the per-craft and
 *    per-project WebSocket channels so subscribers see the new entry
 *    immediately. The full craft state is NOT pushed here — callers handle
 *    that via `publishCraftEvent` for the surrounding lifecycle event.
 *
 * Callers are responsible for persisting the craft via
 * `app.craftStore.set(project, craft)` after this returns, typically
 * alongside other state updates from the same lifecycle event.
 *
 * @param app - Fastify instance (carries the WS channel registry, pilot store, and keystore).
 * @param project - Project name for the `project:<name>` channel.
 * @param craft - Craft to append to; `blackBox` is replaced in place.
 * @param author - Pilot ID recording the entry (or `"system"` for daemon events).
 * @param type - Entry type from `BlackBoxEntryType`.
 * @param content - Human-readable description of the event.
 * @param options - Optional parameters including `authenticatedPilotId`.
 * @returns The newly created daemon entry.
 *
 * @see RULE-BBOX-1
 * @see RULE-BBOX-2
 * @see RULE-BBOX-3
 * @see RULE-BBOX-5
 * @see RULE-BBOX-7
 * @see RULE-PILOT-3b
 */
export function appendBlackBoxEntry(
  app: FastifyInstance,
  project: string,
  craft: CraftState,
  author: string,
  type: BlackBoxEntryType,
  content: string,
  options?: AppendBlackBoxOptions,
): BlackBoxEntry {
  const coreEntry = createCoreEntry(author, type, content);

  // --- Trace context (RULE-BBOX-5) ---
  let traceContext: BlackBoxEntry["traceContext"] = null;
  if (isTraceContextEnabled(app, project)) {
    const lastEntry = craft.blackBox[craft.blackBox.length - 1];
    const parentSpanId = lastEntry?.traceContext?.spanId ?? null;
    traceContext = generateTraceContext(project, craft.callsign, parentSpanId);
  }

  // --- Signing (RULE-BBOX-7 gated by RULE-PILOT-3b) ---
  // RULE-PILOT-3b: sign ONLY when the authenticated requester matches the author.
  const timestamp = coreEntry.timestamp.toISOString();
  let signature: string | null = null;

  const authenticatedPilotId = options?.authenticatedPilotId;
  if (authenticatedPilotId !== undefined && authenticatedPilotId === author) {
    const keyRecord = app.pilotKeystore.get(project, author);
    if (keyRecord) {
      const pilotRecord = app.pilotStore.get(project, author);
      if (pilotRecord?.publicKey) {
        signature = signBlackBoxEntry(keyRecord.privateKey, keyRecord.publicKey, {
          timestamp,
          author: coreEntry.author,
          type: coreEntry.type,
          content: coreEntry.content,
        });
      }
    }
  }

  const entry: BlackBoxEntry = {
    timestamp,
    author: coreEntry.author,
    type: coreEntry.type,
    content: coreEntry.content,
    signature,
    traceContext,
  };

  // Re-use the core append helper for its invariant, then normalise entries
  // back to the daemon shape (strings for timestamps, plus new fields).
  const coreEntries = craft.blackBox.map((e) => ({
    timestamp: new Date(e.timestamp),
    author: e.author,
    type: e.type,
    content: e.content,
  }));
  const next = appendCoreEntry(coreEntries, coreEntry);
  craft.blackBox = next.map((e, i) => {
    // For all entries except the newly appended one, keep existing metadata.
    if (i < next.length - 1) {
      return craft.blackBox[i]!;
    }
    return entry;
  });

  const eventTimestamp = new Date().toISOString();
  const data = { project, callsign: craft.callsign, entry };

  const craftPayload: WsEvent = {
    type: "event",
    channel: `craft:${craft.callsign}`,
    event: "craft.blackbox.appended",
    timestamp: eventTimestamp,
    data,
  };
  const projectPayload: WsEvent = {
    type: "event",
    channel: `project:${project}`,
    event: "craft.blackbox.appended",
    timestamp: eventTimestamp,
    data,
  };

  app.channelRegistry.publish(craftPayload.channel, craftPayload);
  app.channelRegistry.publish(projectPayload.channel, projectPayload);

  return entry;
}

/**
 * Lower-level variant of {@link appendBlackBoxEntry} that takes the channel
 * registry directly instead of a {@link FastifyInstance}. Used by code paths
 * that run before the Fastify app is constructed (notably the agent output
 * pipe, which is wired into `AgentManager` at daemon startup).
 *
 * This variant does NOT produce signatures or trace context — those require
 * access to the pilot store, keystore, and project config stores that are
 * not available at the agent manager level. Entries added via this path will
 * have `signature: null` and `traceContext: null`.
 *
 * @see RULE-BBOX-1
 * @see RULE-BBOX-2
 * @see RULE-BBOX-3
 */
export function appendBlackBoxEntryWithRegistry(
  channelRegistry: ChannelRegistry,
  project: string,
  craft: CraftState,
  author: string,
  type: BlackBoxEntryType,
  content: string,
): BlackBoxEntry {
  const coreEntry = createCoreEntry(author, type, content);
  const entry: BlackBoxEntry = {
    timestamp: coreEntry.timestamp.toISOString(),
    author: coreEntry.author,
    type: coreEntry.type,
    content: coreEntry.content,
    signature: null,
    traceContext: null,
  };

  const coreEntries = craft.blackBox.map((e) => ({
    timestamp: new Date(e.timestamp),
    author: e.author,
    type: e.type,
    content: e.content,
  }));
  const next = appendCoreEntry(coreEntries, coreEntry);
  craft.blackBox = next.map((e, i) => {
    if (i < next.length - 1) {
      return craft.blackBox[i]!;
    }
    return entry;
  });

  const timestamp = new Date().toISOString();
  const data = { project, callsign: craft.callsign, entry };

  const craftPayload: WsEvent = {
    type: "event",
    channel: `craft:${craft.callsign}`,
    event: "craft.blackbox.appended",
    timestamp,
    data,
  };
  const projectPayload: WsEvent = {
    type: "event",
    channel: `project:${project}`,
    event: "craft.blackbox.appended",
    timestamp,
    data,
  };

  channelRegistry.publish(craftPayload.channel, craftPayload);
  channelRegistry.publish(projectPayload.channel, projectPayload);

  return entry;
}
