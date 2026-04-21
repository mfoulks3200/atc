/**
 * Helper for broadcasting craft mutations over the WebSocket channel registry.
 *
 * REST mutation routes call these helpers after persisting state so that
 * subscribed WebSocket clients receive structured events on both the
 * per-craft channel (`craft:<callsign>`) and the per-project list channel
 * (`project:<name>`). The payload shape matches the `WsEvent` interface.
 *
 * @see RULE-CRAFT-1
 */

import type { FastifyInstance } from "fastify";
import type { CraftState, WsEvent } from "../../types.js";

/**
 * Payload shared by every broadcast — includes the project, callsign, and
 * the full craft entity so subscribers can hydrate caches without a refetch.
 */
interface CraftEventData extends Record<string, unknown> {
  project: string;
  callsign: string;
  craft: CraftState;
}

/**
 * Publish a craft mutation event to both the per-craft and per-project
 * WebSocket channels.
 *
 * Called from every REST route that mutates craft state (create, delete,
 * lifecycle transitions, vector reports, intercom, blackbox). The web UI
 * subscribes to `craft:<callsign>` on detail pages and `project:<name>`
 * on list pages, so a single call covers both consumers.
 *
 * @param app - Fastify instance owning the channel registry.
 * @param project - Project name (used for `project:<name>` channel).
 * @param craft - Full craft state after mutation (used as payload).
 * @param event - Domain event name (e.g. `"craft.launched"`).
 * @param extra - Optional extra fields merged into `data`.
 *
 * @see RULE-CRAFT-1
 */
export function publishCraftEvent(
  app: FastifyInstance,
  project: string,
  craft: CraftState,
  event: string,
  extra: Record<string, unknown> = {},
): void {
  const timestamp = new Date().toISOString();
  const data: CraftEventData = {
    project,
    callsign: craft.callsign,
    craft,
    ...extra,
  };

  const craftPayload: WsEvent = {
    type: "event",
    channel: `craft:${craft.callsign}`,
    event,
    timestamp,
    data,
  };
  const projectPayload: WsEvent = {
    type: "event",
    channel: `project:${project}`,
    event,
    timestamp,
    data,
  };

  app.channelRegistry.publish(craftPayload.channel, craftPayload);
  app.channelRegistry.publish(projectPayload.channel, projectPayload);
}

/**
 * Publish a craft deletion event. Because the craft is gone after this
 * call, only the identifying fields are included in the payload.
 *
 * @param app - Fastify instance owning the channel registry.
 * @param project - Project name.
 * @param callsign - Callsign of the removed craft.
 *
 * @see RULE-CRAFT-1
 */
export function publishCraftRemoved(app: FastifyInstance, project: string, callsign: string): void {
  const timestamp = new Date().toISOString();
  const data = { project, callsign };

  const craftPayload: WsEvent = {
    type: "event",
    channel: `craft:${callsign}`,
    event: "craft.removed",
    timestamp,
    data,
  };
  const projectPayload: WsEvent = {
    type: "event",
    channel: `project:${project}`,
    event: "craft.removed",
    timestamp,
    data,
  };

  app.channelRegistry.publish(craftPayload.channel, craftPayload);
  app.channelRegistry.publish(projectPayload.channel, projectPayload);
}
