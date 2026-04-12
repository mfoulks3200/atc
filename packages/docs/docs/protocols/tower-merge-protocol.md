---
title: Tower Merge Protocol
sidebar_position: 4
---

# Tower Merge Protocol

When a craft passes its [landing checklist](/docs/protocols/landing-checklist), the pilot requests landing clearance from the [tower](/docs/concepts/tower). The tower then follows a defined sequence to safely merge the craft's branch into main.

## Aviation Analogy

At a busy airport, the tower sequences aircraft for landing -- checking spacing, verifying approach clearance, and ensuring the runway is clear before each landing. ATC's tower sequences merges the same way, ensuring each craft's branch is clean and compatible before merging.

## Implementation

The tower is implemented in `@airtrafficcontrol/tower` as the `Tower` class. Use `createTower()` to instantiate (RULE-TOWER-1: exactly one tower per repository).

## Merge Sequence

The tower follows these steps in order:

### 1. Verify Vector Reports (Implemented)

`Tower.requestClearance(craft)` checks that every vector in the craft's flight plan has `Passed` status. If any vector is not passed, clearance is denied with a message listing the unpassed vectors. Returns a `ClearanceResult`:

```typescript
interface ClearanceResult {
  granted: boolean;
  reason?: string; // present when denied
}
```

This enforces RULE-TOWER-2 and RULE-TMRG-1.

### 2. Add to Merge Queue (Implemented)

If clearance is granted, `requestClearance()` automatically enqueues the craft. The queue is FCFS ordered by `requestedAt` timestamp (RULE-TMRG-4).

`Tower.enqueue(craft)` throws a `TowerError` if the craft is already in the queue.

Queue inspection methods:

- `Tower.peek()` -- returns the next `QueueEntry` without removing it.
- `Tower.queueSize` -- number of crafts in the queue.
- `Tower.dequeue(callsign)` -- removes and returns a craft by callsign.

### 3. Sequence Merges

The tower processes the queue in order. Only one merge happens at a time to avoid conflicts.

:::caution Not implemented
Steps 4 through 6 below are defined in the spec but **not implemented** in any package. RULE-TOWER-3, RULE-TMRG-2, and RULE-TMRG-3 are not enforced. The tower currently has no branch verification, merge execution, or post-merge status transition logic.
:::

### 4. Verify Branch is Up to Date (Not Implemented)

Before executing the merge, the tower should check that the craft's branch is up to date with main. If main has advanced since the craft was cleared, the branch must be rebased or updated first (RULE-TOWER-3, RULE-TMRG-2).

### 5. Execute the Merge (Not Implemented)

The tower should merge the craft's branch into main.

### 6. Mark as Landed (Not Implemented)

The craft should transition to **Landed** -- a terminal state. The change is complete.

## Handling Merge Conflicts

If a merge conflict arises, the tower may send the craft on a go-around to rebase and resolve conflicts before re-entering the queue (RULE-TMRG-3). This is a normal part of the process when multiple crafts are landing concurrently.

:::note
Since merge execution is not yet implemented, merge conflict detection and the go-around re-entry flow are also unimplemented.
:::

## Rules

- **RULE-TOWER-1:** There must be exactly one tower per repository. Enforced by convention; `createTower()` factory provided.
- **RULE-TOWER-2:** The tower must verify all vectors before granting clearance. **Implemented** in `Tower.requestClearance()`.
- **RULE-TOWER-3:** The tower must verify the branch is up to date before merge. **Not implemented.**
- **RULE-TMRG-1:** The tower must verify all vector reports before granting landing clearance. **Implemented** in `Tower.requestClearance()`.
- **RULE-TMRG-2:** The tower must verify the branch is up to date with main before executing a merge. **Not implemented.**
- **RULE-TMRG-3:** If a merge conflict arises, the tower may send the craft on a go-around. **Not implemented.**
- **RULE-TMRG-4:** Merges must be sequenced to avoid conflicts. Default ordering is FCFS. **Implemented** in the queue.

## Example

```
Tower Merge Log:

[10:00] feat-auth-flow requests landing clearance
  → Vectors: 4/4 passed ✅
  → Clearance granted, added to queue at position 1

[10:01] fix-rate-limiter requests landing clearance
  → Vectors: 3/3 passed ✅
  → Clearance granted, added to queue at position 2

[10:02] Processing feat-auth-flow
  → (Branch verification not yet implemented)
  → (Merge execution not yet implemented)

[10:03] Processing fix-rate-limiter
  → (Waiting for merge infrastructure)
```

## Related Concepts

- [Tower](/docs/concepts/tower) -- the coordinator that executes this protocol
- [Landing Checklist](/docs/protocols/landing-checklist) -- must pass before requesting clearance
- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) -- ClearedToLand to Landed transition
- [Vectors & Flight Plans](/docs/concepts/vectors-and-flight-plans) -- verified by the tower before clearance
