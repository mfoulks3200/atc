---
title: Tower
sidebar_position: 8
---

# Tower

The **tower** is a centralized coordinator responsible for merge sequencing. There is exactly one tower per repository. It is implemented as the `Tower` class in `@airtrafficcontrol/tower`.

## Aviation Analogy

At an airport, the control tower manages all takeoffs and landings — sequencing aircraft, granting clearance, and ensuring planes don't collide on the runway. ATC's tower does the same for code merges — it controls the merge queue, verifies readiness, and sequences merges to avoid conflicts.

## Responsibilities

The tower has four core jobs:

### 1. Granting or Denying Clearance

When a craft calls `requestClearance()`, the tower verifies that every vector in the flight plan has `Passed` status. If any vectors are not passed, clearance is denied with a message listing the unpassed vectors. If all vectors pass, the craft is automatically enqueued for merge.

### 2. Maintaining the Merge Queue

The tower maintains a first-come, first-served (FCFS) merge queue. Key operations:

- **`enqueue(craft)`** — adds a craft to the queue (throws if already present)
- **`dequeue(callsign)`** — removes and returns a craft by callsign
- **`peek()`** — returns the next craft without removing it
- **`queueSize`** — the number of crafts currently queued

### 3. Executing the Merge

Once cleared, the tower should merge the craft's branch into main and mark the craft as **Landed**.

:::note
Merge execution (branch verification, actual merge, mark landed) is **not yet implemented**. RULE-TOWER-3, RULE-TMRG-2, and RULE-TMRG-3 are not enforced in code.
:::

### 4. Handling Emergency Declarations

The tower's `declareEmergency()` method:

- Validates that only the captain can declare an emergency (RULE-EMER-1)
- Appends an `EmergencyDeclaration` entry to the craft's black box (RULE-EMER-2)
- Removes the craft from the merge queue if present
- Returns an `EmergencyReport` for the origin airport containing the callsign, cargo, flight plan, and complete black box (RULE-EMER-4, RULE-ORIG-2)

## Rules

- **RULE-TOWER-1:** There must be exactly one tower per repository.
- **RULE-TOWER-2:** The tower must verify all vectors in a craft's flight plan have been reported as passed before granting landing clearance.
- **RULE-TOWER-3:** The tower must verify the craft's branch is up to date with main before executing a merge (not yet enforced).
- **RULE-TMRG-1:** Landing clearance is granted only when all vectors have Passed status.
- **RULE-TMRG-4:** The merge queue is FCFS; duplicate entries are rejected.

## Example

```
Tower merge queue:

  Position 1: feat-auth-flow
    Vectors: 4/4 passed ✅
    Branch up to date: ✅
    Status: Merging...

  Position 2: fix-rate-limiter
    Vectors: 3/3 passed ✅
    Branch up to date: ❌ (needs rebase)
    Status: Sent on go-around to rebase

  Position 3: refactor-logging
    Vectors: 5/5 passed ✅
    Branch up to date: ✅
    Status: Waiting for position 1 to clear
```

## Related Concepts

- [Tower Merge Protocol](/docs/protocols/tower-merge-protocol) — the full merge sequence
- [Landing Checklist](/docs/protocols/landing-checklist) — must pass before requesting clearance
- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) — ClearedToLand and Landed states
