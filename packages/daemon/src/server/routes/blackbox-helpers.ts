/**
 * Helpers for appending to a craft's black box from REST routes.
 *
 * Wraps the core {@link createBlackBoxEntry} / {@link appendToBlackBox} helpers
 * so route handlers get a single call that (1) records the entry on the
 * persisted craft state and (2) broadcasts it on the same WebSocket channels
 * set up by task #1's `publishCraftEvent`. REST routes call these helpers for
 * every lifecycle event listed in task #2 so subscribers receive a streaming
 * event log without polling.
 *
 * @see RULE-BBOX-1 — black box created at Taxiing, persists for lifecycle.
 * @see RULE-BBOX-2 — entries are append-only.
 * @see RULE-BBOX-3 — all pilots may write to the black box.
 */

import type { FastifyInstance } from "fastify";
import {
  createBlackBoxEntry as createCoreEntry,
  appendToBlackBox as appendCoreEntry,
} from "@airtrafficcontrol/core";
import type { BlackBoxEntryType } from "@airtrafficcontrol/types";
import type { BlackBoxEntry, CraftState, WsEvent } from "../../types.js";
import type { ChannelRegistry } from "../websocket/channels.js";

/**
 * Append a single black box entry to a craft and broadcast it.
 *
 * This is the only function routes should call to add lifecycle entries. It:
 *
 * 1. Builds the entry via the core `createBlackBoxEntry` helper so the
 *    author/type/content shape is consistent across packages.
 * 2. Uses the core `appendToBlackBox` helper to honor the append-only
 *    invariant (RULE-BBOX-2). The helper returns a new array which is then
 *    assigned back to `craft.blackBox` after normalising timestamps to ISO
 *    strings (daemon state is JSON-persisted, so `Date` objects from core
 *    must be serialized).
 * 3. Publishes a `craft.blackbox.appended` event on the per-craft and
 *    per-project WebSocket channels so subscribers see the new entry
 *    immediately. The full craft state is NOT pushed here — callers handle
 *    that via `publishCraftEvent` for the surrounding lifecycle event.
 *
 * Callers are responsible for persisting the craft via
 * `app.craftStore.set(project, craft)` after this returns, typically
 * alongside other state updates from the same lifecycle event.
 *
 * @param app - Fastify instance (carries the WS channel registry).
 * @param project - Project name for the `project:<name>` channel.
 * @param craft - Craft to append to; `blackBox` is replaced in place.
 * @param author - Pilot ID recording the entry (or `"system"` for daemon events).
 * @param type - Entry type from `BlackBoxEntryType`.
 * @param content - Human-readable description of the event.
 * @returns The newly created daemon entry.
 *
 * @see RULE-BBOX-1
 * @see RULE-BBOX-2
 * @see RULE-BBOX-3
 */
export function appendBlackBoxEntry(
  app: FastifyInstance,
  project: string,
  craft: CraftState,
  author: string,
  type: BlackBoxEntryType,
  content: string,
): BlackBoxEntry {
  return appendBlackBoxEntryWithRegistry(app.channelRegistry, project, craft, author, type, content);
}

/**
 * Lower-level variant of {@link appendBlackBoxEntry} that takes the channel
 * registry directly instead of a {@link FastifyInstance}. Used by code paths
 * that run before the Fastify app is constructed (notably the agent output
 * pipe, which is wired into `AgentManager` at daemon startup).
 *
 * Behaviour is otherwise identical: the entry is appended in place, the
 * timestamps are normalised to ISO-8601 strings, and `craft.blackbox.appended`
 * is published on the per-craft and per-project channels.
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
  };

  // Re-use the core append helper for its invariant, then normalise timestamps
  // back to strings for the persisted daemon shape.
  const next = appendCoreEntry(
    craft.blackBox.map((e) => ({
      timestamp: new Date(e.timestamp),
      author: e.author,
      type: e.type,
      content: e.content,
    })),
    coreEntry,
  );
  craft.blackBox = next.map((e) => ({
    timestamp: e.timestamp.toISOString(),
    author: e.author,
    type: e.type,
    content: e.content,
  }));

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
