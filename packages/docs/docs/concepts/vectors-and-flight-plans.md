---
title: Vectors & Flight Plans
sidebar_position: 6
---

# Vectors & Flight Plans

A **vector** is a milestone with acceptance criteria that a craft must pass through. A **flight plan** is an ordered sequence of vectors assigned to a craft at creation — the route from takeoff to landing.

## Aviation Analogy

In aviation, a flight plan defines the route an aircraft will follow, with waypoints (vectors) along the way. Each waypoint must be reached in order. ATC's vectors work the same way — they're checkpoints that ensure the craft is on course and making progress.

## Vector Properties

| Property | Type | Description |
|---|---|---|
| Name | `string` | Short, descriptive identifier for the milestone |
| Acceptance Criteria | `string` | Specific, verifiable conditions that must be met |
| Status | `VectorStatus` | One of: `Pending`, `Passed`, `Failed` |

## Flight Plan

A flight plan is the ordered list of vectors that defines the complete work required for a craft. It is assigned at creation (during the Taxiing phase) and cannot be reordered after assignment.

### Key Constraints

- **Ordered:** Vectors must be passed in sequence. A pilot cannot skip ahead to a later vector.
- **Complete:** All vectors must be passed and reported before the craft can enter the Landing Checklist phase.
- **Reported:** Passing a vector isn't enough — the pilot must file a [vector report](/docs/protocols/vector-reporting) with ATC.

## Rules

- **RULE-VEC-1:** A craft's flight plan must be assigned at creation (during Taxiing) and defines all vectors it must pass through.
- **RULE-VEC-2:** Vectors must be passed in order. A pilot must not skip ahead to a later vector.
- **RULE-VEC-3:** When a craft passes through a vector, the pilot must report it to ATC.
- **RULE-VEC-4:** A craft must not enter the Landing Checklist phase until all vectors in its flight plan have been passed and reported.
- **RULE-VEC-5:** If a vector's acceptance criteria cannot be met, the pilot may declare an emergency.

## Example

```
Craft: feat-auth-flow
Flight Plan:
  1. [Passed]  "Design auth schema"
     Criteria: "Schema types defined and exported from src/auth/types.ts"

  2. [Passed]  "Implement OAuth callback"
     Criteria: "OAuth callback endpoint handles Google provider, returns session token"

  3. [Active]  "Add session management"
     Criteria: "Sessions stored in database, expire after 24h, refresh token support"

  4. [Pending] "Write integration tests"
     Criteria: "95% coverage on auth module, all OAuth flows tested with mock provider"
```

## Related Concepts

- [Crafts](/docs/concepts/crafts) — every craft has a flight plan
- [Vector Reporting](/docs/protocols/vector-reporting) — how to report a passed vector
- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) — vectors drive the InFlight → LandingChecklist transition
- [Emergency Declaration](/docs/protocols/emergency-declaration) — what to do when a vector can't be met
