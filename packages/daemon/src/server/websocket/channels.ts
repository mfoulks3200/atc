/**
 * ChannelRegistry — pub/sub routing for WebSocket clients.
 *
 * Clients subscribe to channel patterns and receive published messages when
 * those patterns match. Supports exact matches, prefix globs (`"foo:*"`), and
 * the firehose wildcard (`"*"`).
 */

/**
 * A send function that delivers a serialized payload to a specific WebSocket client.
 */
export type SendFn = (data: unknown) => void;

/**
 * Determines whether a subscriber's channel pattern matches a published channel name.
 *
 * Matching rules:
 * - `"*"` matches everything.
 * - `"foo:*"` matches any channel that starts with `"foo:"`.
 * - All other patterns require an exact string match.
 *
 * @param pattern - The subscriber's channel pattern.
 * @param channel - The channel name being published to.
 * @returns `true` if the pattern matches the channel.
 */
export function matchesChannel(pattern: string, channel: string): boolean {
  if (pattern === "*") {
    return true;
  }
  if (pattern.endsWith(":*")) {
    const prefix = pattern.slice(0, -1); // keep the trailing colon
    return channel.startsWith(prefix);
  }
  return pattern === channel;
}

/**
 * Registry that routes published messages to subscribed WebSocket clients.
 *
 * Each client can hold multiple subscriptions identified by channel patterns.
 * When a message is published to a channel, all clients whose patterns match
 * receive the message via their registered send function.
 *
 * Channel pattern matching supports:
 * - `"*"` — firehose, matches every channel.
 * - `"foo:*"` — prefix glob, matches any channel starting with `"foo:"`.
 * - Exact string — matches only that channel name.
 */
export class ChannelRegistry {
  /** clientId → (channelPattern → sendFn) */
  private subs = new Map<string, Map<string, SendFn>>();

  /**
   * Subscribe a client to a channel pattern.
   *
   * If the client already has a subscription for this pattern, it is silently
   * replaced with the new send function.
   *
   * @param clientId - Unique identifier for the WebSocket client.
   * @param channel  - Channel pattern to subscribe to.
   * @param send     - Function to call with published data.
   */
  subscribe(clientId: string, channel: string, send: SendFn): void {
    let patterns = this.subs.get(clientId);
    if (!patterns) {
      patterns = new Map();
      this.subs.set(clientId, patterns);
    }
    patterns.set(channel, send);
  }

  /**
   * Unsubscribe a client from a specific channel pattern.
   *
   * No-op if the client or pattern does not exist.
   *
   * @param clientId - Unique identifier for the WebSocket client.
   * @param channel  - Channel pattern to remove.
   */
  unsubscribe(clientId: string, channel: string): void {
    this.subs.get(clientId)?.delete(channel);
  }

  /**
   * Remove all subscriptions for a client.
   *
   * Called when a client disconnects. No-op if the client is unknown.
   *
   * @param clientId - Unique identifier for the WebSocket client.
   */
  removeClient(clientId: string): void {
    this.subs.delete(clientId);
  }

  /**
   * Return all channel patterns a client is currently subscribed to.
   *
   * @param clientId - Unique identifier for the WebSocket client.
   * @returns Array of channel pattern strings, empty if the client has no subscriptions.
   */
  getSubscriptions(clientId: string): string[] {
    const patterns = this.subs.get(clientId);
    return patterns ? Array.from(patterns.keys()) : [];
  }

  /**
   * Publish data to all clients whose subscribed patterns match `channel`.
   *
   * Each matching client's send function is called once with `data`. Matching
   * uses {@link matchesChannel} semantics.
   *
   * @param channel - The channel name to publish to.
   * @param data    - The payload to deliver to matching subscribers.
   */
  publish(channel: string, data: unknown): void {
    for (const patterns of this.subs.values()) {
      for (const [pattern, send] of patterns) {
        if (matchesChannel(pattern, channel)) {
          send(data);
          break; // one delivery per client even if multiple patterns match
        }
      }
    }
  }
}
