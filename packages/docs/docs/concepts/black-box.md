---
title: Black Box
sidebar_position: 7
---

# Black Box

The **black box** is an append-only log of decisions and events maintained on every craft throughout its lifecycle. It is the craft's complete record of what happened and why.

## Aviation Analogy

In aviation, the flight data recorder (black box) captures everything that happens during a flight. If something goes wrong, investigators use it to understand the sequence of events. ATC's black box serves the same purpose — it's the audit trail that helps diagnose issues when a craft can't land.

## Entry Schema

Each black box entry contains:

| Field | Type | Description |
|---|---|---|
| Timestamp | `Date` | When the entry was recorded |
| Author | `string` | The pilot who recorded the entry |
| Type | `BlackBoxEntryType` | The kind of event (see below) |
| Content | `string` | Description of the decision, event, or observation |

## Entry Types

| Type | When to Record |
|---|---|
| `Decision` | An implementation decision — algorithm choice, library selection, approach taken |
| `VectorPassed` | A vector's acceptance criteria were met (alongside the vector report) |
| `GoAround` | The landing checklist failed and a go-around was initiated |
| `Conflict` | A disagreement between pilots and how it was resolved |
| `Observation` | Any other noteworthy event, risk, or context worth preserving |
| `EmergencyDeclaration` | The captain has declared an emergency (final entry before origin handoff) |

## Key Properties

### Append-Only

No entry may be modified or deleted once recorded. This ensures the black box is a trustworthy record. If a previous decision turns out to be wrong, you add a new entry explaining the correction — you don't edit the old one.

### Universal Write Access

All pilots — captain, first officers, and jumpseaters — can write to the black box. Jumpseaters can't modify code, but they can (and should) record observations.

### Emergency Artifact

When an emergency is declared, the complete black box is handed to the origin airport as the primary artifact for investigation. This is how the design stage understands what went wrong and decides whether to re-plan, re-scope, or abandon the craft.

## Rules

- **RULE-BBOX-1:** The black box must be created when the craft enters Taxiing and must persist for the craft's entire lifecycle.
- **RULE-BBOX-2:** Black box entries are append-only. No entry may be modified or deleted once recorded.
- **RULE-BBOX-3:** All pilots (captain, first officers, and jumpseaters) may write to the black box.
- **RULE-BBOX-4:** In the event of an emergency, the complete black box must be provided to the origin airport as the primary artifact for investigation.

## Example

```
Black Box for craft feat-auth-flow:

[2026-03-30T09:00:00Z] agent-alpha (Decision)
  "Using passport.js for OAuth2 — mature library, good Google provider support."

[2026-03-30T10:15:00Z] agent-alpha (VectorPassed)
  "Vector 'Design auth schema' passed. Types exported from src/auth/types.ts."

[2026-03-30T11:30:00Z] agent-gamma (Observation)
  "The session token format doesn't include the provider name. May cause issues
   if we add more OAuth providers later. Consider adding a 'provider' field."

[2026-03-30T14:00:00Z] agent-alpha (Decision)
  "Added 'provider' field to session token per agent-gamma's observation."

[2026-03-30T16:00:00Z] agent-alpha (GoAround)
  "Landing checklist failed — lint errors in src/auth/callback.ts. Fixing."
```

## Related Concepts

- [Crafts](/docs/concepts/crafts) — every craft has a black box
- [Emergency Declaration](/docs/protocols/emergency-declaration) — the black box is the key emergency artifact
- [Origin Airport](/docs/concepts/origin-airport) — receives the black box on emergency return
- [Controls](/docs/concepts/controls) — control transfers are recorded in the black box
