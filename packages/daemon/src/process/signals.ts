/**
 * OS signal handling utilities for @atc/daemon.
 *
 * Provides a once-only shutdown callback wrapper and a helper to bind it to
 * the standard termination signals SIGTERM and SIGINT.
 */

/**
 * Wraps an async shutdown callback so it is guaranteed to execute at most once,
 * regardless of how many times the returned function is called.
 *
 * @param onShutdown - Async callback to invoke on the first shutdown trigger.
 * @returns A function that, when called, invokes `onShutdown` exactly once.
 */
export function createShutdownHandler(onShutdown: () => Promise<void>): () => Promise<void> {
  let called = false;
  return async (): Promise<void> => {
    if (called) {
      return;
    }
    called = true;
    await onShutdown();
  };
}

/**
 * Attaches the provided handler to `SIGTERM` and `SIGINT`.
 *
 * Calling this function registers the handler as a listener on both signals so
 * the daemon shuts down gracefully whether killed explicitly (`SIGTERM`) or
 * interrupted from a terminal (`SIGINT` / Ctrl-C).
 *
 * @param handler - The shutdown callback to register. Should be the value
 *   returned by {@link createShutdownHandler} to ensure single execution.
 */
export function registerSignalHandlers(handler: () => Promise<void>): void {
  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);
}
