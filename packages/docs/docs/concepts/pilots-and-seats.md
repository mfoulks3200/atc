---
title: Pilots & Seats
sidebar_position: 2
---

# Pilots & Seats

A **pilot** is an autonomous agent assigned to work on a craft. Every pilot on a craft occupies a **seat** that determines their authority and permissions.

## Aviation Analogy

In a real cockpit, the captain sits in the left seat with ultimate authority, the first officer assists from the right seat, and jumpseaters observe from fold-down seats behind them. ATC mirrors this hierarchy exactly.

## Pilot Properties

| Property | Type | Description |
|---|---|---|
| Identifier | `string` | Unique across the system |
| Certifications | `string[]` | List of craft categories the pilot can fly |

## Seat Types

| Seat | Certification Required | Can Modify Code | Can Hold Controls | Cardinality |
|---|---|---|---|---|
| **Captain** | Yes | Yes | Yes | Exactly 1 per craft |
| **First Officer** | Yes | Yes | Yes | 0 or more |
| **Jumpseat** | No | **No** | **No** | 0 or more |

### Captain

The captain is the pilot-in-command. They have final authority on all decisions, hold controls by default, and are the only one who can declare an emergency or communicate with the tower for landing clearance.

### First Officer

A certified co-pilot who assists the captain. First officers can modify code, hold controls, file vector reports, and request landing clearance. They defer to the captain on final decisions.

### Jumpseat

An observer and advisor. Jumpseaters **cannot modify code** and **cannot hold controls**. They can provide input, suggestions, and review. They can (and should) write to the black box when they observe something noteworthy.

## Rules

- **RULE-PILOT-1:** Every pilot must have a unique identifier.
- **RULE-PILOT-2:** A pilot's certifications determine which crafts they can serve as captain or first officer on.
- **RULE-SEAT-1:** Every craft must have exactly one captain.
- **RULE-SEAT-2:** A pilot can only sit in the captain or first officer seat if they hold a certification for the craft's category.
- **RULE-SEAT-3:** A pilot who is not certified for the craft's category can only board in the jumpseat.
- **RULE-SEAT-4:** A pilot can occupy seats on multiple crafts at the same time.

## Example

```
Craft: feat-auth-flow (Category: Backend Engineering)

  Captain: agent-alpha
    Certifications: [Backend Engineering, Infrastructure]

  First Officer: agent-bravo
    Certifications: [Backend Engineering, Frontend Engineering]

  Jumpseat: agent-gamma
    Certifications: [Frontend Engineering]
    (Not certified for Backend Engineering — can only observe)
```

## Related Concepts

- [Craft Categories](/docs/concepts/craft-categories) — what certifications mean
- [Controls](/docs/concepts/controls) — how pilots share code modification rights
- [Intercom](/docs/concepts/intercom) — how pilots communicate aboard a craft
- [Emergency Declaration](/docs/protocols/emergency-declaration) — captain-only protocol
