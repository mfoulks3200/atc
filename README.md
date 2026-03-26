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
  types/          @atc/types — Domain model as TypeScript types, enums, and consts
  core/           @atc/core  — Runtime implementation (WIP)

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

### `@atc/types`

Pure TypeScript type definitions — no runtime logic, no dependencies. Defines the complete ATC domain model:

- **Enums** — `CraftStatus`, `SeatType`, `ControlMode`, `VectorStatus`, `BlackBoxEntryType`
- **Interfaces** — `Craft`, `Pilot`, `Vector`, `BlackBoxEntry`, `VectorReport`, `ControlState`, and more
- **State Machine** — `TRANSITIONS` (9 valid lifecycle transitions) and `TERMINAL_STATES`
- **Permissions** — `PERMISSIONS` matrix mapping seat types to allowed actions

```typescript
import { CraftStatus, SeatType, PERMISSIONS, TRANSITIONS } from "@atc/types";
```

### `@atc/core`

Runtime implementation of the ATC system. Work in progress.

## Documentation

- **[Design Brief](docs/spec.md)** — Informal design notes describing the system using aviation metaphors
- **[Formal Specification](docs/specification.md)** — Authoritative reference with typed property tables, state machine definitions, protocol descriptions, and 62 numbered `RULE-*` identifiers
- **[Agent Operating Manual](docs/agent/operating-manual.md)** — Second-person behavioral guidance for agents, covering vector navigation, controls protocol, radio discipline, landing procedures, and emergency declarations

## License

Private
