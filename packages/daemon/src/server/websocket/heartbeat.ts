/**
 * HeartbeatTracker — tracks missed pong responses from WebSocket clients.
 *
 * The daemon periodically pings connected clients. This tracker counts how
 * many consecutive pings each client has failed to answer. Clients that
 * exceed the configured threshold are considered stale and should be
 * disconnected.
 */

/**
 * Tracks missed heartbeat pong responses per connected WebSocket client.
 *
 * Usage pattern:
 * 1. Call {@link addClient} when a new connection is established.
 * 2. Call {@link tick} each time a ping is broadcast (increments missed count
 *    for every tracked client).
 * 3. Call {@link receivePong} when a client responds to a ping (resets its
 *    missed count to zero).
 * 4. Call {@link getStaleClients} to find clients that should be disconnected.
 * 5. Call {@link removeClient} when a client disconnects.
 */
export class HeartbeatTracker {
  private missed = new Map<string, number>();
  private maxMissed: number;

  /**
   * @param maxMissed - Number of consecutive missed pongs before a client is
   *                    considered stale. A client is stale when its missed
   *                    count is greater than or equal to this value.
   */
  constructor(maxMissed: number) {
    this.maxMissed = maxMissed;
  }

  /**
   * Register a new client, initialising its missed-pong count to zero.
   *
   * If the client is already tracked (e.g. reconnect scenario), the count is
   * reset to zero.
   *
   * @param clientId - Unique identifier for the WebSocket client.
   */
  addClient(clientId: string): void {
    this.missed.set(clientId, 0);
  }

  /**
   * Remove a client from tracking entirely.
   *
   * No-op if the client is unknown.
   *
   * @param clientId - Unique identifier for the WebSocket client.
   */
  removeClient(clientId: string): void {
    this.missed.delete(clientId);
  }

  /**
   * Increment the missed-pong counter for every currently tracked client.
   *
   * Called once per heartbeat interval, just before (or just after) pings
   * are sent. Clients that respond will have their count reset by
   * {@link receivePong}.
   */
  tick(): void {
    for (const [clientId, count] of this.missed) {
      this.missed.set(clientId, count + 1);
    }
  }

  /**
   * Reset the missed-pong counter for a client to zero.
   *
   * Call this when a pong frame is received from the client. No-op if the
   * client is not currently tracked.
   *
   * @param clientId - Unique identifier for the WebSocket client.
   */
  receivePong(clientId: string): void {
    if (this.missed.has(clientId)) {
      this.missed.set(clientId, 0);
    }
  }

  /**
   * Return the current missed-pong count for a client.
   *
   * @param clientId - Unique identifier for the WebSocket client.
   * @returns The number of consecutive missed pongs, or `0` if the client is
   *          not tracked.
   */
  getMissedPongs(clientId: string): number {
    return this.missed.get(clientId) ?? 0;
  }

  /**
   * Return all client IDs whose missed-pong count has reached or exceeded the
   * configured `maxMissed` threshold.
   *
   * @returns Array of stale client ID strings. Empty if no clients are stale.
   */
  getStaleClients(): string[] {
    const stale: string[] = [];
    for (const [clientId, count] of this.missed) {
      if (count >= this.maxMissed) {
        stale.push(clientId);
      }
    }
    return stale;
  }
}
