# @atc/adapter-claude-agent-sdk

Adapter bridging ATC's agent interface to the Anthropic Claude Agent SDK. Provides `ClaudeAgentSdkAdapter` (a stub implementation of the daemon's `AgentAdapter` interface) and `buildSystemPrompt` for initializing agent context with full craft state.

## Installation

```bash
pnpm add @atc/adapter-claude-agent-sdk
```

This is an internal workspace package (`workspace:*`).

## Status

This package is currently a **scaffold**. All adapter methods are no-ops or return placeholder values. The real Claude Agent SDK integration (spawning SDK sessions, wiring intercom callbacks, streaming usage reports) is future work. The scaffold satisfies the `AgentAdapter` contract so the daemon's adapter registry can load and type-check this package today.

## API Reference

### `ClaudeAgentSdkAdapter`

Stub implementation of the `AgentAdapter` interface from `@atc/daemon`. See `RULE-PILOT-1`.

| Method | Signature | Stub Behavior |
|---|---|---|
| `launch` | `(options: AgentLaunchOptions) => Promise<AgentHandle>` | Returns a placeholder handle |
| `pause` | `(handle: AgentHandle) => Promise<void>` | No-op |
| `resume` | `(handle: AgentHandle, context: AgentResumeContext) => Promise<void>` | No-op |
| `terminate` | `(handle: AgentHandle) => Promise<void>` | No-op |
| `isAlive` | `(handle: AgentHandle) => Promise<boolean>` | Always returns `false` |
| `sendMessage` | `(handle: AgentHandle, message: IntercomMessage) => Promise<void>` | No-op |
| `onMessage` | `(handle: AgentHandle, callback: (message: IntercomMessage) => void) => void` | Registers but never invokes |
| `onStatusChange` | `(handle: AgentHandle, callback: (status: AgentStatus) => void) => void` | Registers but never invokes |
| `onUsageReport` | `(handle: AgentHandle, callback: (report: AgentUsageReport) => void) => void` | Registers but never invokes |

### `buildSystemPrompt(craft: CraftState, pilotId: string, seat: string): string`

Builds a structured system prompt string for a pilot agent. Encodes the craft's full state so the agent starts with complete situational awareness without needing to query the daemon on boot.

The prompt includes:
- Craft identity (callsign, branch, cargo, category, status)
- Pilot identity (ID, seat type)
- Flight plan with vector statuses (`[PASSED]`, `[PENDING]`, `[FAILED]`)
- Controls state (exclusive holder or shared area assignments)
- Summary of key ATC rules

See `RULE-PILOT-1`, `RULE-SEAT-1` through `RULE-SEAT-3`.

## Usage

```typescript
import { ClaudeAgentSdkAdapter, buildSystemPrompt } from "@atc/adapter-claude-agent-sdk";

// Register the adapter with the daemon
const adapter = new ClaudeAgentSdkAdapter();

// Build a system prompt for an agent launch
const prompt = buildSystemPrompt(craftState, "agent-1", "captain");
```

## Dependencies

| Package | Purpose |
|---|---|
| `@atc/types` | Domain types |
| `@atc/errors` | Error classes |
| `@atc/daemon` | `AgentAdapter` interface, `CraftState`, and related types |
| `@anthropic-ai/sdk` | Claude Agent SDK (peer dependency for future integration) |

## Related Packages

- [`@atc/daemon`](../daemon/) — Defines the `AgentAdapter` interface this package implements
- [`@atc/types`](../types/) — Domain model types
