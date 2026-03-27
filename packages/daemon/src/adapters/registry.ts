/**
 * AdapterRegistry — a name-keyed store for {@link AgentAdapter} implementations.
 *
 * The daemon resolves the correct adapter for a given profile by looking up
 * the adapter type string (e.g. "claude-agent-sdk") in the registry. Adapters
 * are registered at daemon startup and must be unique by name.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */

import type { AgentAdapter } from "./adapter.js";

/**
 * Registry that maps adapter names to their {@link AgentAdapter} implementations.
 *
 * Adapters must be registered before they can be retrieved. Registering the
 * same name twice throws to prevent silent overwrites.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */
export class AdapterRegistry {
  private adapters = new Map<string, AgentAdapter>();

  /**
   * Register a named adapter implementation.
   *
   * @param name    - Unique string identifier for the adapter (e.g. "claude-agent-sdk").
   * @param adapter - The {@link AgentAdapter} implementation to register.
   * @throws {Error} If an adapter with the same name has already been registered.
   */
  register(name: string, adapter: AgentAdapter): void {
    if (this.adapters.has(name)) {
      throw new Error(`Adapter "${name}" is already registered.`);
    }
    this.adapters.set(name, adapter);
  }

  /**
   * Retrieve a registered adapter by name.
   *
   * @param name - The adapter name to look up.
   * @returns The {@link AgentAdapter} if found, or `undefined` if not registered.
   */
  get(name: string): AgentAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * List all registered adapter names.
   *
   * @returns An array of registered adapter name strings.
   */
  list(): string[] {
    return Array.from(this.adapters.keys());
  }
}
