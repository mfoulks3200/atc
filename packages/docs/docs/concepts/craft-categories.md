---
title: Craft Categories
sidebar_position: 3
---

# Craft Categories

A **craft category** classifies the type of change a craft carries. Categories connect crafts to the pilots who are qualified to fly them.

## Aviation Analogy

In aviation, pilots are rated for specific aircraft types — a Boeing 737 rating doesn't let you fly an Airbus A320. In ATC, pilot certifications are tied to craft categories the same way.

## How Categories Work

Every craft is assigned a category at creation. This category determines which pilots can serve as captain or first officer. A pilot must hold a certification matching the craft's category to occupy either of those seats. Uncertified pilots can still board as jumpseaters (observers).

## Example Categories

Categories are project-configurable. Here are typical examples:

| Category | Description |
|---|---|
| Backend Engineering | REST APIs, server-side logic, database changes |
| Frontend Engineering | UI components, client-side logic, styling |
| Infrastructure | CI/CD, deployment, cloud configuration |
| Documentation | Non-code documentation changes |

## Certification Matching

```
Pilot: agent-alpha
  Certifications: [Backend Engineering, Infrastructure]

Can captain/FO:
  ✅ Craft with category "Backend Engineering"
  ✅ Craft with category "Infrastructure"
  ❌ Craft with category "Frontend Engineering" (jumpseat only)
  ❌ Craft with category "Documentation" (jumpseat only)
```

## Rules

- **RULE-CRAFT-4:** Every craft must have a category assigned at creation.
- **RULE-PILOT-2:** A pilot's certifications determine which crafts they may serve as captain or first officer on.
- **RULE-SEAT-2:** Captain and first officer seats require certification for the craft's category.
- **RULE-SEAT-3:** Uncertified pilots may only board in the jumpseat.

## Related Concepts

- [Crafts](/docs/concepts/crafts) — the unit of work that carries a category
- [Pilots & Seats](/docs/concepts/pilots-and-seats) — how certifications affect seat assignment
