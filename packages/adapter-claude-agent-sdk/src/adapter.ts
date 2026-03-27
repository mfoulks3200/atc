/**
 * Stub implementation of {@link AgentAdapter} targeting the Anthropic Claude Agent SDK.
 *
 * All methods are no-ops or return minimal placeholder values. The real Agent SDK
 * integration — spawning SDK sessions, wiring intercom callbacks, streaming usage
 * reports — is future work. This scaffold satisfies the {@link AgentAdapter} contract
 * so the daemon's adapter registry can load and type-check this package today.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */

import type {
  AgentAdapter,
  AgentHandle,
  AgentLaunchOptions,
  AgentResumeContext,
  IntercomMessage,
  AgentStatus,
  AgentUsageReport,
} from "@atc/daemon";

/**
 * Stub Claude Agent SDK adapter.
 *
 * Implements every method on {@link AgentAdapter} as a no-op so the interface
 * contract is satisfied at compile time. Replace these stubs with real SDK calls
 * when integrating `@anthropic-ai/sdk`.
 *
 * @see RULE-PILOT-1 for pilot lifecycle rules.
 */
export class ClaudeAgentSdkAdapter implements AgentAdapter {
  /**
   * Stub launch: returns a placeholder handle with no live process.
   *
   * @param options - Launch configuration (unused in stub).
   * @returns A resolved promise containing a minimal {@link AgentHandle}.
   *
   * @see RULE-PILOT-1 for pilot launch rules.
   */
  async launch(options: AgentLaunchOptions): Promise<AgentHandle> {
    return {
      agentId: options.agentId,
      adapterMeta: {},
    };
  }

  /**
   * Stub pause: no-op.
   *
   * @param _handle - Unused.
   *
   * @see RULE-PILOT-1 for pilot pause rules.
   */
  async pause(_handle: AgentHandle): Promise<void> {
    // no-op stub
  }

  /**
   * Stub resume: no-op.
   *
   * @param _handle  - Unused.
   * @param _context - Unused.
   *
   * @see RULE-PILOT-1 for pilot resume rules.
   */
  async resume(_handle: AgentHandle, _context: AgentResumeContext): Promise<void> {
    // no-op stub
  }

  /**
   * Stub terminate: no-op.
   *
   * @param _handle - Unused.
   *
   * @see RULE-PILOT-1 for pilot termination rules.
   */
  async terminate(_handle: AgentHandle): Promise<void> {
    // no-op stub
  }

  /**
   * Stub liveness check: always returns false (no live process backing this stub).
   *
   * @param _handle - Unused.
   * @returns Always resolves to `false`.
   *
   * @see RULE-PILOT-1 for pilot lifecycle rules.
   */
  async isAlive(_handle: AgentHandle): Promise<boolean> {
    return false;
  }

  /**
   * Stub sendMessage: no-op.
   *
   * @param _handle  - Unused.
   * @param _message - Unused.
   *
   * @see RULE-CRAFT-5 for intercom usage constraints.
   */
  async sendMessage(_handle: AgentHandle, _message: IntercomMessage): Promise<void> {
    // no-op stub
  }

  /**
   * Stub onMessage: registers but never invokes the callback.
   *
   * @param _handle   - Unused.
   * @param _callback - Unused.
   *
   * @see RULE-CRAFT-5 for intercom usage constraints.
   */
  onMessage(_handle: AgentHandle, _callback: (message: IntercomMessage) => void): void {
    // no-op stub
  }

  /**
   * Stub onStatusChange: registers but never invokes the callback.
   *
   * @param _handle   - Unused.
   * @param _callback - Unused.
   *
   * @see RULE-PILOT-1 for pilot lifecycle rules.
   */
  onStatusChange(_handle: AgentHandle, _callback: (status: AgentStatus) => void): void {
    // no-op stub
  }

  /**
   * Stub onUsageReport: registers but never invokes the callback.
   *
   * @param _handle   - Unused.
   * @param _callback - Unused.
   */
  onUsageReport(_handle: AgentHandle, _callback: (report: AgentUsageReport) => void): void {
    // no-op stub
  }
}
