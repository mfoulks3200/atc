---
title: Crafts
sidebar_position: 1
---

# Crafts

A **craft** is the fundamental unit of work in ATC. Each craft represents a single discrete change to the codebase, tied one-to-one with a git branch.

## Aviation Analogy

In aviation, an aircraft carries cargo from one airport to another along a planned route. In ATC, a craft carries a code change from creation to merge, following a flight plan of ordered milestones.

## Properties

| Property | Type | Description |
|---|---|---|
| Callsign | `string` | Unique, immutable identifier for the craft |
| Branch | `string` | The git branch associated with this craft (1:1) |
| Cargo | `string` | Description of the change and its scope |
| Category | `CraftCategory` | Type of change — determines pilot eligibility |
| Captain | `Pilot` | The pilot-in-command; exactly one per craft |
| First Officers | `Pilot[]` | Zero or more certified co-pilots |
| Jumpseaters | `Pilot[]` | Zero or more observers (no code modification) |
| Flight Plan | `Vector[]` | Ordered sequence of milestones to complete |
| Black Box | `BlackBoxEntry[]` | Append-only event log |
| Controls | `ControlState` | Who can currently modify code |
| Status | `CraftStatus` | Current lifecycle state |

## Rules

- **RULE-CRAFT-1:** Every craft must have a unique callsign that never changes after creation.
- **RULE-CRAFT-2:** Every craft is associated with exactly one git branch. One branch, one craft.
- **RULE-CRAFT-3:** Every craft must have a cargo description assigned at creation — you can't fly without knowing what you're carrying.
- **RULE-CRAFT-4:** Every craft must have a category assigned at creation, which determines which pilots are certified to fly it.
- **RULE-CRAFT-5:** Every craft must have exactly one captain at all times. No craft flies without a pilot-in-command.

## Example

```
Craft:
  Callsign: fix-rate-limiter
  Branch: fix/rate-limiter-bypass
  Cargo: "Fix rate limiter bypass when X-Forwarded-For header contains multiple IPs"
  Category: Backend Engineering
  Captain: agent-bravo
  First Officers: [agent-charlie]
  Jumpseaters: [agent-delta]
  Status: InFlight
```

## Related Concepts

- [Pilots & Seats](/docs/concepts/pilots-and-seats) — who flies the craft
- [Craft Categories](/docs/concepts/craft-categories) — what determines pilot eligibility
- [Vectors & Flight Plans](/docs/concepts/vectors-and-flight-plans) — the route a craft follows
- [Black Box](/docs/concepts/black-box) — the craft's event log
- [Controls](/docs/concepts/controls) — who can modify code at any given time
- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) — states and transitions
