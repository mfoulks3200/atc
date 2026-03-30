---
title: Tower Merge Protocol
sidebar_position: 4
---

# Tower Merge Protocol

When a craft passes its [landing checklist](/docs/protocols/landing-checklist), the pilot requests landing clearance from the [tower](/docs/concepts/tower). The tower then follows a defined sequence to safely merge the craft's branch into main.

## Aviation Analogy

At a busy airport, the tower sequences aircraft for landing — checking spacing, verifying approach clearance, and ensuring the runway is clear before each landing. ATC's tower sequences merges the same way, ensuring each craft's branch is clean and compatible before merging.

## Merge Sequence

The tower follows these steps in order:

### 1. Verify Vector Reports

The tower checks that all vectors in the craft's flight plan have been reported as passed. If any vector report is missing, the craft is denied clearance.

### 2. Add to Merge Queue

The craft is added to the merge queue. By default, the queue is ordered first-come, first-served.

### 3. Sequence Merges

The tower processes the queue in order. Only one merge happens at a time to avoid conflicts.

### 4. Verify Branch is Up to Date

Before executing the merge, the tower checks that the craft's branch is up to date with main. If main has advanced since the craft was cleared, the branch must be rebased or updated first.

### 5. Execute the Merge

The tower merges the craft's branch into main.

### 6. Mark as Landed

The craft transitions to **Landed** — a terminal state. The change is complete.

## Handling Merge Conflicts

If a merge conflict arises, the tower may send the craft on a go-around to rebase and resolve conflicts before re-entering the queue. This is a normal part of the process when multiple crafts are landing concurrently.

## Rules

- **RULE-TMRG-1:** The tower must verify all vector reports before granting landing clearance.
- **RULE-TMRG-2:** The tower must verify the branch is up to date with main before executing a merge.
- **RULE-TMRG-3:** If a merge conflict arises, the tower may send the craft on a go-around to rebase/resolve before re-entering the queue.
- **RULE-TMRG-4:** Merges must be sequenced to avoid conflicts. Default ordering is first-come, first-served.

## Example

```
Tower Merge Log:

[10:00] feat-auth-flow requests landing clearance
  → Vectors: 4/4 reported ✅
  → Added to queue at position 1

[10:01] fix-rate-limiter requests landing clearance
  → Vectors: 3/3 reported ✅
  → Added to queue at position 2

[10:02] Processing feat-auth-flow
  → Branch up to date with main ✅
  → Merging... ✅
  → Craft feat-auth-flow marked as Landed

[10:03] Processing fix-rate-limiter
  → Branch up to date with main ❌ (main advanced after feat-auth-flow merged)
  → Sent on go-around to rebase

[10:08] fix-rate-limiter re-enters queue at position 1
  → Branch up to date with main ✅
  → Merging... ✅
  → Craft fix-rate-limiter marked as Landed
```

## Related Concepts

- [Tower](/docs/concepts/tower) — the agent that executes this protocol
- [Landing Checklist](/docs/protocols/landing-checklist) — must pass before requesting clearance
- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) — ClearedToLand → Landed transition
- [Vectors & Flight Plans](/docs/concepts/vectors-and-flight-plans) — verified by the tower before clearance
