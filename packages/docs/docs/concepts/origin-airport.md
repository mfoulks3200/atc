---
title: Origin Airport
sidebar_position: 9
---

# Origin Airport

The **origin airport** represents the spec/implementation design stage — the place where crafts are planned before they fly, and where they return if they can't land.

## Aviation Analogy

In aviation, if an aircraft can't land at its destination (bad weather, mechanical issues), it may return to its origin airport. The flight data recorder is reviewed to understand what happened. ATC works the same way — when a craft can't be merged, it returns to the design stage with its complete black box for investigation.

## Purpose

The origin airport serves two roles:

### 1. The Starting Point

Every craft originates from a design decision. The origin airport is where someone decides "we need this change" and defines the craft's cargo, category, and flight plan.

### 2. The Emergency Destination

When a captain [declares an emergency](/docs/protocols/emergency-declaration), the craft is sent back to the origin airport. The origin receives:

- The craft's **callsign**
- The **cargo** description
- The **flight plan** (showing which vectors were passed and which weren't)
- The complete **black box** (the full audit trail)

### Re-evaluation

Using the black box to understand what went wrong, the origin airport decides one of three outcomes:

| Outcome | Description |
|---|---|
| **Re-plan** | The change is still needed but the approach was wrong. Create a new craft with a revised flight plan. |
| **Re-scope** | The change was too ambitious. Break it into smaller crafts. |
| **Abandon** | The change is no longer needed or feasible. No new craft is filed. |

## Rules

- **RULE-ORIG-1:** Crafts that cannot be landed after repeated attempts must be sent back to the origin airport for re-evaluation.
- **RULE-ORIG-2:** The origin airport must receive the craft's callsign, cargo description, flight plan, and complete black box upon emergency return.
- **RULE-ORIG-3:** The origin airport uses the black box to diagnose root cause and determine whether the craft should be re-planned, re-scoped, or abandoned.

## Example

```
Emergency Return:

Craft: feat-realtime-sync
Cargo: "Add real-time synchronization using WebSockets"
Vectors passed: 2/5 (Design schema ✅, Implement server ✅)
Vectors failed: 3/5 (Client integration, conflict resolution, load testing)

Black box analysis:
  - WebSocket library incompatible with current proxy setup
  - Three go-around attempts failed to resolve proxy issue
  - Captain declared emergency after third go-around

Origin decision: Re-scope
  → New craft 1: "Add SSE-based real-time updates" (simpler, proxy-compatible)
  → New craft 2: "Evaluate proxy upgrade for WebSocket support" (infrastructure)
```

## Related Concepts

- [Emergency Declaration](/docs/protocols/emergency-declaration) — triggers return to origin
- [Black Box](/docs/concepts/black-box) — the primary investigation artifact
- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) — ReturnToOrigin is a terminal state
