# ATC (Air Traffic Control)

An agent orchestration system that coordinates multiple autonomous agents working on concurrent code changes within a shared repository. ATC uses aviation terminology as its domain language — changes are "crafts" flown by "pilots" who navigate "vectors" and request "landing clearance" from a "tower" to merge.

## Core Concepts

| Aviation Term | Software Meaning |
|---|---|
| Craft | A unit of work — one discrete change, tied to a git branch |
| Pilot | An autonomous agent assigned to a craft |
| Captain | The pilot-in-command with final authority |
| First Officer | A certified co-pilot who can modify code |
| Jumpseat | An observer who can advise but not modify code |
| Vector | A milestone with acceptance criteria |
| Flight Plan | An ordered sequence of vectors |
| Tower | The merge coordinator (one per repo) |
| Landing | A successful merge into main |
| Black Box | An append-only log of decisions and events |

For the full domain model, see the [design brief](docs/spec.md) or the [formal specification](docs/specification.md).

## Project Structure

```
packages/
  types/                    @atc/types — Domain model as TypeScript types, enums, and consts
  core/                     @atc/core — Runtime implementation
  errors/                   @atc/errors — Structured error hierarchy
  validation/               @atc/validation — Certification, seat, and permission validators
  checklist/                @atc/checklist — Landing checklist runner
  tower/                    @atc/tower — Merge coordination and landing clearance
  daemon/                   @atc/daemon — Long-running process with REST/WebSocket API
  adapter-claude-agent-sdk/ @atc/adapter-claude-agent-sdk — Claude Agent SDK integration

docs/
  spec.md              Original design brief
  specification.md     Formal specification with RULE-* identifiers
  agent/
    operating-manual.md  Behavioral guidance injected into agent contexts
```

## Getting Started

```bash
pnpm install
pnpm run build
pnpm run test
```

## Packages

### [`@atc/types`](packages/types/)

Pure TypeScript type definitions — no runtime logic, no dependencies. Defines the complete ATC domain model:

- **Enums** — `CraftStatus`, `SeatType`, `ControlMode`, `VectorStatus`, `BlackBoxEntryType`
- **Interfaces** — `Craft`, `Pilot`, `Vector`, `BlackBoxEntry`, `VectorReport`, `ControlState`, and more
- **State Machine** — `TRANSITIONS` (9 valid lifecycle transitions) and `TERMINAL_STATES`
- **Permissions** — `PERMISSIONS` matrix mapping seat types to allowed actions

```typescript
import { CraftStatus, SeatType, PERMISSIONS, TRANSITIONS } from "@atc/types";
```

### [`@atc/core`](packages/core/)

Runtime implementation of the ATC system. Provides craft lifecycle management, pilot coordination, and controls protocol enforcement.

### [`@atc/errors`](packages/errors/)

Structured error hierarchy for the ATC domain. Every error class extends `AtcError` and maps to a specific domain boundary: `CraftError`, `SeatAssignmentError`, `ControlsError`, `BlackBoxError`, `LifecycleError`, `VectorError`, `ChecklistError`, `EmergencyError`, and `TowerError`.

### [`@atc/validation`](packages/validation/)

Pure validation functions for certification checks, seat assignment rules, and permission enforcement. Provides `isPilotCertified`, `isValidSeatAssignment`, `validateCraftCrew`, `canHoldControls`, and `canPerformAction`.

### [`@atc/checklist`](packages/checklist/)

Landing checklist runner. Defines checklist items with pass/fail evaluation and provides `runChecklist` to execute a full pre-landing validation sequence, plus `createDefaultChecklist` for the standard set.

### [`@atc/tower`](packages/tower/)

Merge coordination — the Tower manages landing clearance requests, maintains a queue of crafts awaiting merge, and handles emergency declarations. Provides the `Tower` class, `createTower` factory, and `createEmergencyReport`.

### [`@atc/daemon`](packages/daemon/)

Long-running ATC process that exposes a REST API and WebSocket channels. Manages agent lifecycle, craft state, git worktrees, adapter registration, configuration loading, PID file management, and the landing checklist pipeline.

### [`@atc/adapter-claude-agent-sdk`](packages/adapter-claude-agent-sdk/)

Adapter bridging ATC's agent interface to the Claude Agent SDK. Provides `ClaudeAgentSdkAdapter` and `buildSystemPrompt` for initializing agent context with ATC operating instructions.

## Documentation

- **[Design Brief](docs/spec.md)** — Informal design notes describing the system using aviation metaphors
- **[Formal Specification](docs/specification.md)** — Authoritative reference with typed property tables, state machine definitions, protocol descriptions, and 62 numbered `RULE-*` identifiers
- **[Agent Operating Manual](docs/agent/operating-manual.md)** — Second-person behavioral guidance for agents, covering vector navigation, controls protocol, radio discipline, landing procedures, and emergency declarations

## License

Private
