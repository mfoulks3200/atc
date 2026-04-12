---
title: Craft Lifecycle
sidebar_position: 1
---

# Craft Lifecycle

Every craft in ATC follows a defined eight-state lifecycle — a sequence of states from creation to completion (or failure). Understanding the lifecycle is key to understanding how ATC orchestrates changes.

The state machine and transition table are defined in `@airtrafficcontrol/types` (`enums.ts`, `lifecycle.ts`) and enforced at runtime by `transitionCraft` in `@airtrafficcontrol/core`.

## States

| State                | Terminal | Description                                                                        |
| -------------------- | -------- | ---------------------------------------------------------------------------------- |
| **Taxiing**          | No       | Craft initialized — branch created, pilots assigned, cargo and flight plan defined |
| **InFlight**         | No       | Pilots actively implementing, navigating vectors in order                          |
| **LandingChecklist** | No       | All vectors passed. Pilot runs validation checks                                   |
| **GoAround**         | No       | Landing checklist failed. Pilot addresses failures before re-attempt               |
| **ClearedToLand**    | No       | Checklist passed, tower granted clearance. Craft is in merge queue                 |
| **Landed**           | **Yes**  | Branch merged into main. Done.                                                     |
| **Emergency**        | No       | Pilot declared an emergency after repeated failures                                |
| **ReturnToOrigin**   | **Yes**  | Craft sent back to design stage for re-evaluation. Done.                           |

## State Diagram

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
  ┌──────────┐   ┌──────────┐   ┌─────────────────┐   ┌───────────┐
  │ Taxiing  │──▶│ InFlight │──▶│ LandingChecklist │──▶│ GoAround  │
  └──────────┘   └──────────┘   └─────────────────┘   └───────────┘
                    │  ▲              │                      │
                    │  │              │                      │
                    │  └──────────────┘                      │
                    │  (vector passed)        ┌──────────────┘
                    │                         │
                    │                         ▼
                    │              ┌─────────────────┐   ┌──────────────────┐
                    │              │    Emergency     │──▶│ ReturnToOrigin   │
                    │              └─────────────────┘   │    (terminal)    │
                    │                                    └──────────────────┘
                    │
                    ▼
            ┌───────────────┐   ┌──────────┐
            │ ClearedToLand │──▶│  Landed  │
            └───────────────┘   │(terminal)│
                                └──────────┘
```

## Transitions

| #   | From             | To               | Trigger                                          | Preconditions                                                   |
| --- | ---------------- | ---------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| 1   | Taxiing          | InFlight         | Pilot begins implementation                      | Captain, cargo, and flight plan assigned                        |
| 2   | InFlight         | InFlight         | Pilot passes a vector and reports to ATC         | Next vector in flight plan sequence                             |
| 3   | InFlight         | LandingChecklist | Pilot begins validation checks                   | All vectors passed and reported                                 |
| 4   | LandingChecklist | ClearedToLand    | All required checks pass; tower grants clearance | All required checklist items pass (advisory failures permitted) |
| 5   | LandingChecklist | GoAround         | One or more required checks fail                 | At least one required checklist item failed                     |
| 6   | GoAround         | LandingChecklist | Pilot re-attempts after fixing failures          | Pilot has addressed failure(s)                                  |
| 7   | GoAround         | Emergency        | Repeated failures or pilot escalates             | Captain decision                                                |
| 8   | ClearedToLand    | Landed           | Tower merges branch into main                    | Branch up to date with main                                     |
| 9   | Emergency        | ReturnToOrigin   | Craft sent back to design with black box         | Emergency declaration recorded                                  |

## Terminal States

Two states are terminal — no transitions out are permitted:

- **Landed:** The craft's branch has been merged into main. The change is complete.
- **ReturnToOrigin:** The craft has been sent back to the design stage. The [origin airport](/docs/concepts/origin-airport) will decide whether to re-plan, re-scope, or abandon.

## The Happy Path

The most common lifecycle follows this sequence:

1. **Taxiing** — craft is set up with callsign, cargo, pilots, and flight plan
2. **InFlight** — pilots implement the change, passing vectors one by one
3. **LandingChecklist** — all vectors done, validation checks run
4. **ClearedToLand** — everything passes, tower grants clearance
5. **Landed** — branch merged, craft complete

## The Go-Around Loop

If a required item in the landing checklist fails, the craft enters **GoAround**. The pilot fixes the issues and re-enters **LandingChecklist**. This loop can repeat multiple times. If the pilot can't resolve the failures after repeated attempts, the captain may escalate to **Emergency**. Only the captain may declare an emergency (RULE-EMER-1).

## Implementation Notes

Rule enforcement for the lifecycle is split between layers:

- `transitionCraft` in `@airtrafficcontrol/core` enforces **RULE-LIFE-1, RULE-LIFE-2, RULE-LIFE-4, RULE-LIFE-7, RULE-LIFE-8**. It rejects any unlisted transition, blocks `InFlight → LandingChecklist` unless every vector is `Passed`, blocks `Emergency → ReturnToOrigin` unless an `EmergencyDeclaration` exists in the black box, and refuses to transition out of `Landed` or `ReturnToOrigin`.
- **RULE-LIFE-3, RULE-LIFE-5, RULE-LIFE-6** are not checked by `transitionCraft`. They are (where enforced at all) gated by the daemon's HTTP route handlers. Calling `transitionCraft` directly will skip them.
- The `ClearedToLand → Landed` step has no working implementation: the tower's merge protocol stops at queue admission. RULE-LIFE-6, RULE-TOWER-3, and RULE-TMRG-2/3 are not yet enforced anywhere.

See [Formal Specification — Implementation Status](../specification.md#5-implementation-status) for the full breakdown.

## Rules

- **RULE-LIFE-1:** A craft must begin in the Taxiing state.
- **RULE-LIFE-2:** Only the transitions listed above are valid. Any unlisted transition is illegal.
- **RULE-LIFE-3:** Taxiing to InFlight requires a captain, cargo, and flight plan to be assigned.
- **RULE-LIFE-4:** InFlight to LandingChecklist requires all vectors to be passed and reported.
- **RULE-LIFE-5:** LandingChecklist to ClearedToLand requires all checklist items to pass and the tower to grant clearance.
- **RULE-LIFE-6:** ClearedToLand to Landed requires the tower to verify the branch is up to date with main and execute the merge.
- **RULE-LIFE-7:** Emergency to ReturnToOrigin requires an EmergencyDeclaration entry in the black box.
- **RULE-LIFE-8:** Landed and ReturnToOrigin are terminal states. No transitions out are permitted.

## Related Concepts

- [Crafts](/docs/concepts/crafts) — the entity that moves through this lifecycle
- [Vectors & Flight Plans](/docs/concepts/vectors-and-flight-plans) — drive the InFlight phase
- [Landing Checklist](/docs/protocols/landing-checklist) — the validation gate before clearance
- [Emergency Declaration](/docs/protocols/emergency-declaration) — the escape hatch
- [Tower](/docs/concepts/tower) — manages ClearedToLand → Landed
