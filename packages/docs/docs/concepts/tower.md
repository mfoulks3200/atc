---
title: Tower
sidebar_position: 8
---

# Tower

The **tower** is a centralized agent responsible for merge coordination. There is exactly one tower per repository.

## Aviation Analogy

At an airport, the control tower manages all takeoffs and landings — sequencing aircraft, granting clearance, and ensuring planes don't collide on the runway. ATC's tower does the same for code merges — it controls the merge queue, verifies readiness, and sequences merges to avoid conflicts.

## Responsibilities

The tower has three core jobs:

### 1. Maintaining the Merge Queue

When a craft passes its landing checklist and requests clearance, the tower adds it to the merge queue. By default, merges are sequenced first-come, first-served.

### 2. Granting or Denying Clearance

Before granting landing clearance, the tower verifies:

- All vectors in the craft's flight plan have been reported as passed
- The craft's branch is up to date with main

If either check fails, the craft is denied clearance.

### 3. Executing the Merge

Once cleared, the tower merges the craft's branch into main and marks the craft as **Landed**.

## Rules

- **RULE-TOWER-1:** There must be exactly one tower per repository.
- **RULE-TOWER-2:** The tower must verify all vectors in a craft's flight plan have been reported as passed before granting landing clearance.
- **RULE-TOWER-3:** The tower must verify the craft's branch is up to date with main before executing a merge.

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
