---
title: Getting Started
sidebar_position: 2
---

# Getting Started with ATC

This guide walks through the complete lifecycle of a change in ATC — from creating a craft to landing it (merging into main). By the end, you'll understand how all the pieces fit together.

## The Big Picture

ATC coordinates code changes the way air traffic control coordinates aircraft. Every change follows the same path:

1. **File a craft** — describe the change, assign a pilot, plan the route
2. **Fly the vectors** — implement the change milestone by milestone
3. **Run the landing checklist** — validate the work meets quality standards
4. **Request landing clearance** — ask the tower to merge
5. **Land** — the tower merges the branch into main

## Step 1: File a Craft

Every change starts as a **craft**. A craft represents a single discrete change to the codebase, tied to a git branch.

To file a craft, you need:

- A **callsign** — a unique identifier (e.g., `feat-auth-flow`)
- A **cargo** description — what the change does and its scope
- A **category** — the type of change (e.g., Backend Engineering, Frontend Engineering)
- A **captain** — the pilot-in-command who has final authority
- A **flight plan** — an ordered list of vectors (milestones) to complete

```
Craft filed:
  Callsign: feat-auth-flow
  Cargo: "Add OAuth2 authentication flow with Google provider"
  Category: Backend Engineering
  Captain: agent-alpha
  Flight Plan:
    1. Design auth schema
    2. Implement OAuth callback
    3. Add session management
    4. Write integration tests
```

The craft begins in the **Taxiing** state.

## Step 2: Take Off and Fly

Once the captain, cargo, and flight plan are assigned, the craft transitions from **Taxiing** to **InFlight**. The captain holds exclusive [controls](/docs/concepts/controls) by default.

The pilot works through each vector in order. Vectors cannot be skipped — they must be completed sequentially. When a vector's acceptance criteria are met, the pilot files a [vector report](/docs/protocols/vector-reporting) with ATC.

```
Vector Report:
  Craft: feat-auth-flow
  Vector: "Design auth schema"
  Evidence: "Schema defined in src/auth/schema.ts, reviewed by FO"
  Timestamp: 2026-03-30T10:15:00Z
```

If multiple pilots are aboard, they can use the [intercom](/docs/concepts/intercom) to coordinate and transfer [controls](/docs/concepts/controls) between each other.

## Step 3: Run the Landing Checklist

After all vectors are passed and reported, the craft enters the **LandingChecklist** phase. The pilot runs a set of validation checks:

- All tests pass
- No lint errors
- Documentation is up to date
- The project builds successfully

If any check fails, the craft performs a **go-around** — returning to fix the issues before trying again.

## Step 4: Request Landing Clearance

When all checklist items pass, the pilot requests landing clearance from the [tower](/docs/concepts/tower). The tower:

1. Verifies all vector reports are filed
2. Adds the craft to the merge queue
3. Checks the branch is up to date with main

## Step 5: Land

The tower executes the merge. The craft transitions to **Landed** — a terminal state. The change is now part of main.

## When Things Go Wrong

If the craft can't be landed after repeated go-arounds, the captain can [declare an emergency](/docs/protocols/emergency-declaration). The craft is returned to the **Origin Airport** (the design stage) along with its complete [black box](/docs/concepts/black-box) for investigation.

## Next Steps

- Learn about each concept in detail: [Crafts](/docs/concepts/crafts), [Pilots](/docs/concepts/pilots-and-seats), [Controls](/docs/concepts/controls)
- Understand the full [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) with all states and transitions
- Read the [Formal Specification](/docs/specification) for the authoritative reference
