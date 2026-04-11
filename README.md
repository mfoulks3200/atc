<p align="center">
  <img src="docs/assets/airplane.png" alt="Paperclip — runs your business" width="150px" />
  <h1 align="center">Air Traffic Control</h1>
</p>

<p align="center">
  <a href="#quickstart"><strong>Quickstart</strong></a> &middot;
  <a href="https://mfoulks3200.github.io/atc/"><strong>Docs</strong></a> &middot;
  <a href="https://github.com/mfoulks3200/atc"><strong>GitHub</strong></a>
</p>

<p align="center">
  <a href="https://github.com/mfoulks3200/atc/stargazers"><img src="https://img.shields.io/github/stars/mfoulks3200/atc?style=flat" alt="Stars" /></a>
</p>

<br/>

## What is Air Traffic Control?

Two things:

- A philosophy on managing many autonomous agents as they write software.
  - This philosophy describes guardrails, quality gates, and lifecycle steps which ensure efficient token usage, codebase health, and extensible design.
- A reference implementation of this philosophy.
  - This repo contains a full end-to-end implementation with an approachable web interface, and composable publishing strategy.

**Manage changes and specs, not supervising agents and PR toil.**

## What problems does ATC solve?

- **Toil**
  - ATC priorities respecting human attention.
    - Agents will only ask for input when it's actually needed.
    - PRs are only put up for review when they match the acceptance criteria with passing builds.
    - Calls for known-safe tools performing non-destructive actions are approved automatically.
- **Determinism**
  - Agents are messy. Prompts can be misinterprated, processes can be forgotten, and agents can get tunnel vision when solving harder problems.
  - ATC fixes this issue by instituting and enforcing a very strict, statically defined process _around_ the agent. So the agent can focus on completing the task, and the platform will catch them when they fall.
- **Reliability**
  - ATC is built around quality and consistency. When you don't have to manually supervise agents, you can shift towards managing many changes at once.
  - Processes are also statically defined. Business requirements, or contribution guidelines can be easily configured to ensure that changes meet quality gates.
- **Efficiency**
  - Because agents are supervised at the harness level, tokens are only spent where they actually deliver value. No more daemon agents consuming tokens just to keep your AI engineers on track.

# What's with the avaiation metaphor?

A growing problem in the AI Software Development LifeCycle (SDLC) community is finding the right language to describe the technology. Simple terms like "agent" or "tool" are overloaded, and can mean many different things in different contexts.

ATC uses aviation terminology as its domain language, because aviation terminology are broadly known and understood. These terms also have a strong intuitive relationship with one another, that make describing complex systems and interactions easier— Changes are "crafts" flown by "pilots" who navigate "vectors" and request "landing clearance" from a "tower" to merge.

Aviation as a domain language has another benefit too— Aviation procedures are strict, explicit, and very well defined. There are built-in checkpoints throughout the process that ensure safe operations, and excellent visibility for everyone in the system:

- A tower that controls traffic
- Vectors that plot a known/expected course
- Clearance to take certain actions
- Checklists to run when something unexpected happens
- Radio communication protocols that govern communication between entities
- Extremely well-defined process for who has control at any given moment, and backup plans for overriding them if needed

The visibility this framing creates can be used by the harness to provide numerous points to check in on agent progress, and a known process for recovering from error states.

## Core Concepts

| Aviation Term | Software Meaning                                                 |
| ------------- | ---------------------------------------------------------------- |
| Craft         | A unit of work — one discrete change, tied to a git branch       |
| Pilot         | An autonomous agent assigned to a craft                          |
| Captain       | The pilot-in-command with final authority                        |
| First Officer | A certified co-pilot who can modify code                         |
| Jumpseat      | An observer who can advise but not modify code                   |
| Vector        | A milestone with acceptance criteria                             |
| Flight Plan   | An ordered sequence of vectors                                   |
| Go Around     | A situation where the craft did not meet acceptance criteria     |
| Emergency     | A situation where the craft repeatedly fails acceptance criteria |
| Tower         | The merge coordinator (one per repo)                             |
| Landing       | A successful merge into main                                     |
| Black Box     | An append-only log of decisions and events                       |

For the full domain model, see the [design brief](docs/spec.md) or the [formal specification](docs/specification.md).

## Project Structure

```
packages/
  types/                    @airtrafficcontrol/types — Domain model as TypeScript types, enums, and consts
  core/                     @airtrafficcontrol/core — Runtime implementation
  errors/                   @airtrafficcontrol/errors — Structured error hierarchy
  validation/               @airtrafficcontrol/validation — Certification, seat, and permission validators
  checklist/                @airtrafficcontrol/checklist — Landing checklist runner
  tower/                    @airtrafficcontrol/tower — Merge coordination and landing clearance
  daemon/                   @airtrafficcontrol/daemon — Long-running process with REST/WebSocket API
  adapter-claude-agent-sdk/ @airtrafficcontrol/adapter-claude-agent-sdk — Claude Agent SDK integration

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

### [`@airtrafficcontrol/types`](packages/types/)

Pure TypeScript type definitions — no runtime logic, no dependencies. Defines the complete ATC domain model:

- **Enums** — `CraftStatus`, `SeatType`, `ControlMode`, `VectorStatus`, `BlackBoxEntryType`
- **Interfaces** — `Craft`, `Pilot`, `Vector`, `BlackBoxEntry`, `VectorReport`, `ControlState`, and more
- **State Machine** — `TRANSITIONS` (9 valid lifecycle transitions) and `TERMINAL_STATES`
- **Permissions** — `PERMISSIONS` matrix mapping seat types to allowed actions

```typescript
import { CraftStatus, SeatType, PERMISSIONS, TRANSITIONS } from "@airtrafficcontrol/types";
```

### [`@airtrafficcontrol/core`](packages/core/)

Runtime implementation of the ATC system. Provides craft lifecycle management, pilot coordination, and controls protocol enforcement.

### [`@airtrafficcontrol/errors`](packages/errors/)

Structured error hierarchy for the ATC domain. Every error class extends `AtcError` and maps to a specific domain boundary: `CraftError`, `SeatAssignmentError`, `ControlsError`, `BlackBoxError`, `LifecycleError`, `VectorError`, `ChecklistError`, `EmergencyError`, and `TowerError`.

### [`@airtrafficcontrol/validation`](packages/validation/)

Pure validation functions for certification checks, seat assignment rules, and permission enforcement. Provides `isPilotCertified`, `isValidSeatAssignment`, `validateCraftCrew`, `canHoldControls`, and `canPerformAction`.

### [`@airtrafficcontrol/checklist`](packages/checklist/)

Landing checklist runner. Defines checklist items with pass/fail evaluation and provides `runChecklist` to execute a full pre-landing validation sequence, plus `createDefaultChecklist` for the standard set.

### [`@airtrafficcontrol/tower`](packages/tower/)

Merge coordination — the Tower manages landing clearance requests, maintains a queue of crafts awaiting merge, and handles emergency declarations. Provides the `Tower` class, `createTower` factory, and `createEmergencyReport`.

### [`@airtrafficcontrol/daemon`](packages/daemon/)

Long-running ATC process that exposes a REST API and WebSocket channels. Manages agent lifecycle, craft state, git worktrees, adapter registration, configuration loading, PID file management, and the landing checklist pipeline.

### [`@airtrafficcontrol/adapter-claude-agent-sdk`](packages/adapter-claude-agent-sdk/)

Adapter bridging ATC's agent interface to the Claude Agent SDK. Provides `ClaudeAgentSdkAdapter` and `buildSystemPrompt` for initializing agent context with ATC operating instructions.

## Documentation

- **[Design Brief](docs/spec.md)** — Informal design notes describing the system using aviation metaphors
- **[Formal Specification](docs/specification.md)** — Authoritative reference with typed property tables, state machine definitions, protocol descriptions, and 62 numbered `RULE-*` identifiers
- **[Agent Operating Manual](docs/agent/operating-manual.md)** — Second-person behavioral guidance for agents, covering vector navigation, controls protocol, radio discipline, landing procedures, and emergency declarations

## License

Private
