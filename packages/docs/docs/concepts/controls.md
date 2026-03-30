---
title: Controls
sidebar_position: 4
---

# Controls

A craft has a single set of **controls** that govern which pilot(s) are actively permitted to make code changes at any given time. Think of controls as a lock on the right to modify code.

## Aviation Analogy

In a real cockpit, only one pilot flies the aircraft at a time. When the captain wants the first officer to take over, they say "your controls." The first officer confirms "my controls." This explicit handoff prevents two pilots from fighting over the flight stick. ATC uses the same protocol.

## Control Modes

| Mode | Description |
|---|---|
| **Exclusive** | A single pilot holds the controls. Everyone else must wait until controls are released. |
| **Shared** | Two or more pilots hold controls simultaneously, each with explicit non-overlapping areas of responsibility. |

### When to Use Each Mode

- **Exclusive controls** are best for changes that risk conflicts if done concurrently — modifying the same files, refactoring shared interfaces, or making sweeping changes.
- **Shared controls** work well when pilots are working on clearly separable concerns — one pilot on the API layer, another on the database layer, for example. Areas must not overlap.

## Handoff Protocol

Control transfers follow a strict verbal protocol to prevent ambiguity:

### Exclusive Handoff

1. The requesting pilot announces **"my controls"** to the crew via intercom.
2. The current holder acknowledges **"your controls"**, completing the handoff.
3. The transfer is recorded in the black box.

### Switching to Shared

1. Pilots declare explicit areas of responsibility (by file, module, or concern).
2. Areas must **not** overlap — if two pilots claim the same file, shared mode cannot be used.
3. The mode change is recorded in the black box.

## Rules

- **RULE-CTRL-1:** At craft creation, the captain holds exclusive controls by default.
- **RULE-CTRL-2:** Only the captain or a first officer may claim controls. Jumpseaters can never hold controls.
- **RULE-CTRL-3:** A pilot must not modify code on the craft's branch unless they currently hold controls (exclusively or within their shared area).
- **RULE-CTRL-4:** Pilots should use exclusive controls for changes that risk conflicts if done concurrently.
- **RULE-CTRL-5:** Pilots may use shared controls when working on clearly separable concerns.
- **RULE-CTRL-6:** If a dispute arises over controls, the captain has final authority.
- **RULE-CTRL-7:** All control transfers and mode changes must be recorded in the black box.

## Example

```
Craft: feat-auth-flow
Status: InFlight

Timeline:
  1. Captain agent-alpha holds exclusive controls (default)
  2. agent-alpha: "agent-bravo, my controls" (handing off)
     agent-bravo: "my controls" (accepting)
     → agent-bravo now holds exclusive controls

  3. Switching to shared mode:
     agent-alpha: "Shared controls — I'll take src/auth/, you take src/db/"
     agent-bravo: "Confirmed — I have src/db/, you have src/auth/"
     → Both pilots can modify code in their declared areas
```

## Related Concepts

- [Pilots & Seats](/docs/concepts/pilots-and-seats) — who can hold controls
- [Intercom](/docs/concepts/intercom) — how handoff communication works
- [Black Box](/docs/concepts/black-box) — where control changes are recorded
