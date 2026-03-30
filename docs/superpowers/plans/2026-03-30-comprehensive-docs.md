# Comprehensive ATC Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create 15 new documentation pages covering every ATC concept, the craft lifecycle, and all protocols, plus update sidebar navigation and introduction page.

**Architecture:** New markdown files organized into `concepts/`, `lifecycle/`, and `protocols/` subdirectories under `packages/docs/docs/`. Each page follows a consistent pattern: definition, aviation analogy, properties, rules, examples, related concepts. Sidebar restructured into 6 categories.

**Tech Stack:** Docusaurus v3, Markdown with YAML frontmatter

---

### Task 1: Update Sidebar Configuration

**Files:**
- Modify: `packages/docs/sidebars.ts`

- [ ] **Step 1: Replace sidebars.ts content**

Replace the entire content of `packages/docs/sidebars.ts` with:

```typescript
import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: "category",
      label: "Getting Started",
      items: ["introduction", "getting-started"],
    },
    {
      type: "category",
      label: "Concepts",
      items: [
        "concepts/crafts",
        "concepts/pilots-and-seats",
        "concepts/craft-categories",
        "concepts/controls",
        "concepts/intercom",
        "concepts/vectors-and-flight-plans",
        "concepts/black-box",
        "concepts/tower",
        "concepts/origin-airport",
      ],
    },
    {
      type: "category",
      label: "Lifecycle",
      items: ["lifecycle/craft-lifecycle"],
    },
    {
      type: "category",
      label: "Protocols",
      items: [
        "protocols/vector-reporting",
        "protocols/landing-checklist",
        "protocols/emergency-declaration",
        "protocols/tower-merge-protocol",
      ],
    },
    {
      type: "category",
      label: "Reference",
      items: ["specification", "design-brief"],
    },
    {
      type: "category",
      label: "Guides",
      items: ["contributing", "agent/operating-manual"],
    },
  ],
};

export default sidebars;
```

- [ ] **Step 2: Commit**

```bash
git add packages/docs/sidebars.ts
git commit -m "feat(docs): restructure sidebar for comprehensive documentation"
```

---

### Task 2: Getting Started Page

**Files:**
- Create: `packages/docs/docs/getting-started.md`

- [ ] **Step 1: Create getting-started.md**

Create `packages/docs/docs/getting-started.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/docs/docs/getting-started.md
git commit -m "feat(docs): add getting started walkthrough"
```

---

### Task 3: Concepts — Crafts, Pilots & Seats, Craft Categories

**Files:**
- Create: `packages/docs/docs/concepts/crafts.md`
- Create: `packages/docs/docs/concepts/pilots-and-seats.md`
- Create: `packages/docs/docs/concepts/craft-categories.md`

- [ ] **Step 1: Create crafts.md**

Create `packages/docs/docs/concepts/crafts.md`:

```markdown
---
title: Crafts
sidebar_position: 1
---

# Crafts

A **craft** is the fundamental unit of work in ATC. Each craft represents a single discrete change to the codebase, tied one-to-one with a git branch.

## Aviation Analogy

In aviation, an aircraft carries cargo from one airport to another along a planned route. In ATC, a craft carries a code change from creation to merge, following a flight plan of ordered milestones.

## Properties

| Property | Type | Description |
|---|---|---|
| Callsign | `string` | Unique, immutable identifier for the craft |
| Branch | `string` | The git branch associated with this craft (1:1) |
| Cargo | `string` | Description of the change and its scope |
| Category | `CraftCategory` | Type of change — determines pilot eligibility |
| Captain | `Pilot` | The pilot-in-command; exactly one per craft |
| First Officers | `Pilot[]` | Zero or more certified co-pilots |
| Jumpseaters | `Pilot[]` | Zero or more observers (no code modification) |
| Flight Plan | `Vector[]` | Ordered sequence of milestones to complete |
| Black Box | `BlackBoxEntry[]` | Append-only event log |
| Controls | `ControlState` | Who can currently modify code |
| Status | `CraftStatus` | Current lifecycle state |

## Rules

- **RULE-CRAFT-1:** Every craft must have a unique callsign that never changes after creation.
- **RULE-CRAFT-2:** Every craft is associated with exactly one git branch. One branch, one craft.
- **RULE-CRAFT-3:** Every craft must have a cargo description assigned at creation — you can't fly without knowing what you're carrying.
- **RULE-CRAFT-4:** Every craft must have a category assigned at creation, which determines which pilots are certified to fly it.
- **RULE-CRAFT-5:** Every craft must have exactly one captain at all times. No craft flies without a pilot-in-command.

## Example

```
Craft:
  Callsign: fix-rate-limiter
  Branch: fix/rate-limiter-bypass
  Cargo: "Fix rate limiter bypass when X-Forwarded-For header contains multiple IPs"
  Category: Backend Engineering
  Captain: agent-bravo
  First Officers: [agent-charlie]
  Jumpseaters: [agent-delta]
  Status: InFlight
```

## Related Concepts

- [Pilots & Seats](/docs/concepts/pilots-and-seats) — who flies the craft
- [Craft Categories](/docs/concepts/craft-categories) — what determines pilot eligibility
- [Vectors & Flight Plans](/docs/concepts/vectors-and-flight-plans) — the route a craft follows
- [Black Box](/docs/concepts/black-box) — the craft's event log
- [Controls](/docs/concepts/controls) — who can modify code at any given time
- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) — states and transitions
```

- [ ] **Step 2: Create pilots-and-seats.md**

Create `packages/docs/docs/concepts/pilots-and-seats.md`:

```markdown
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
```

- [ ] **Step 3: Create craft-categories.md**

Create `packages/docs/docs/concepts/craft-categories.md`:

```markdown
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
```

- [ ] **Step 4: Commit**

```bash
git add packages/docs/docs/concepts/crafts.md packages/docs/docs/concepts/pilots-and-seats.md packages/docs/docs/concepts/craft-categories.md
git commit -m "feat(docs): add concept pages for crafts, pilots, and categories"
```

---

### Task 4: Concepts — Controls, Intercom

**Files:**
- Create: `packages/docs/docs/concepts/controls.md`
- Create: `packages/docs/docs/concepts/intercom.md`

- [ ] **Step 1: Create controls.md**

Create `packages/docs/docs/concepts/controls.md`:

```markdown
---
title: Controls
sidebar_position: 4
---

# Controls

A craft has a single set of **controls** that govern which pilot(s) are actively permitted to make code changes at any given time. Think of controls as a lock on the right to modify code.

## Aviation Analogy

In a real cockpit, only one pilot flies the aircraft at a time. When the captain wants the first officer to take over, they say "your controls." The first officer confirms "my controls." This explicit handoff prevents two pilots from fighting over the flight stick. ATC uses the same protocol.

## Control Modes

| Mode | Description |
|---|---|
| **Exclusive** | A single pilot holds the controls. Everyone else must wait until controls are released. |
| **Shared** | Two or more pilots hold controls simultaneously, each with explicit non-overlapping areas of responsibility. |

### When to Use Each Mode

- **Exclusive controls** are best for changes that risk conflicts if done concurrently — modifying the same files, refactoring shared interfaces, or making sweeping changes.
- **Shared controls** work well when pilots are working on clearly separable concerns — one pilot on the API layer, another on the database layer, for example. Areas must not overlap.

## Handoff Protocol

Control transfers follow a strict verbal protocol to prevent ambiguity:

### Exclusive Handoff

1. The requesting pilot announces **"my controls"** to the crew via intercom.
2. The current holder acknowledges **"your controls"**, completing the handoff.
3. The transfer is recorded in the black box.

### Switching to Shared

1. Pilots declare explicit areas of responsibility (by file, module, or concern).
2. Areas must **not** overlap — if two pilots claim the same file, shared mode cannot be used.
3. The mode change is recorded in the black box.

## Rules

- **RULE-CTRL-1:** At craft creation, the captain holds exclusive controls by default.
- **RULE-CTRL-2:** Only the captain or a first officer may claim controls. Jumpseaters can never hold controls.
- **RULE-CTRL-3:** A pilot must not modify code on the craft's branch unless they currently hold controls (exclusively or within their shared area).
- **RULE-CTRL-4:** Pilots should use exclusive controls for changes that risk conflicts if done concurrently.
- **RULE-CTRL-5:** Pilots may use shared controls when working on clearly separable concerns.
- **RULE-CTRL-6:** If a dispute arises over controls, the captain has final authority.
- **RULE-CTRL-7:** All control transfers and mode changes must be recorded in the black box.

## Example

```
Craft: feat-auth-flow
Status: InFlight

Timeline:
  1. Captain agent-alpha holds exclusive controls (default)
  2. agent-alpha: "agent-bravo, my controls" (handing off)
     agent-bravo: "my controls" (accepting)
     → agent-bravo now holds exclusive controls

  3. Switching to shared mode:
     agent-alpha: "Shared controls — I'll take src/auth/, you take src/db/"
     agent-bravo: "Confirmed — I have src/db/, you have src/auth/"
     → Both pilots can modify code in their declared areas
```

## Related Concepts

- [Pilots & Seats](/docs/concepts/pilots-and-seats) — who can hold controls
- [Intercom](/docs/concepts/intercom) — how handoff communication works
- [Black Box](/docs/concepts/black-box) — where control changes are recorded
```

- [ ] **Step 2: Create intercom.md**

Create `packages/docs/docs/concepts/intercom.md`:

```markdown
---
title: Intercom
sidebar_position: 5
---

# Intercom

The **intercom** is a shared communication channel for all pilots aboard a craft. All intercom traffic is recorded in the [black box](/docs/concepts/black-box).

## Aviation Analogy

In aviation, cockpit communication follows strict radio discipline — pilots identify themselves, state who they're addressing, and keep transmissions short and clear. ATC adopts the same discipline to prevent miscommunication between autonomous agents.

## Radio Discipline

### The 3W Principle

Every transmission must include:

1. **Who you are calling** — the recipient
2. **Who you are** — the sender
3. **Where you are** — your current context in the codebase

```
"agent-bravo, agent-alpha, I'm in src/auth/oauth.ts working on the callback handler."
```

### Readback

Safety-critical exchanges — especially control handoffs — must be explicitly read back by the receiving pilot to confirm understanding:

```
agent-alpha: "agent-bravo, agent-alpha, your controls."
agent-bravo: "agent-alpha, agent-bravo, my controls. Confirmed."
```

### Transmission Etiquette

- **Check the channel is clear** before transmitting — don't talk over another pilot.
- **Signal when you're done** — make it clear your transmission is complete.
- **Keep it concise** — use clear, direct language. No rambling.

## Rules

- **RULE-ICOM-1:** A pilot must check that no other pilot is mid-transmission before sending a message.
- **RULE-ICOM-2:** Every transmission must use the 3W principle: who you are calling, who you are, where you are.
- **RULE-ICOM-3:** Safety-critical exchanges (especially control handoffs) must be explicitly read back by the receiving pilot.
- **RULE-ICOM-4:** A pilot must explicitly signal when their transmission is complete.
- **RULE-ICOM-5:** Transmissions must be concise, using clear and direct language with standard phraseology.

## Example

```
Craft: feat-auth-flow (InFlight, shared controls)

agent-alpha: "agent-bravo, agent-alpha, I'm in src/auth/session.ts.
  I need to add a dependency on your token validation function in src/auth/tokens.ts.
  Can we coordinate? Over."

agent-bravo: "agent-alpha, agent-bravo, I'm wrapping up the token refresh logic
  in src/auth/tokens.ts. Give me five minutes and I'll export the validator.
  I'll call you when it's ready. Over."

agent-alpha: "agent-bravo, agent-alpha, copy. Standing by. Out."
```

## Related Concepts

- [Controls](/docs/concepts/controls) — handoffs require intercom readback
- [Black Box](/docs/concepts/black-box) — all intercom traffic is recorded
- [Pilots & Seats](/docs/concepts/pilots-and-seats) — all seat types can use the intercom
```

- [ ] **Step 3: Commit**

```bash
git add packages/docs/docs/concepts/controls.md packages/docs/docs/concepts/intercom.md
git commit -m "feat(docs): add concept pages for controls and intercom"
```

---

### Task 5: Concepts — Vectors & Flight Plans, Black Box

**Files:**
- Create: `packages/docs/docs/concepts/vectors-and-flight-plans.md`
- Create: `packages/docs/docs/concepts/black-box.md`

- [ ] **Step 1: Create vectors-and-flight-plans.md**

Create `packages/docs/docs/concepts/vectors-and-flight-plans.md`:

```markdown
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
```

- [ ] **Step 2: Create black-box.md**

Create `packages/docs/docs/concepts/black-box.md`:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add packages/docs/docs/concepts/vectors-and-flight-plans.md packages/docs/docs/concepts/black-box.md
git commit -m "feat(docs): add concept pages for vectors, flight plans, and black box"
```

---

### Task 6: Concepts — Tower, Origin Airport

**Files:**
- Create: `packages/docs/docs/concepts/tower.md`
- Create: `packages/docs/docs/concepts/origin-airport.md`

- [ ] **Step 1: Create tower.md**

Create `packages/docs/docs/concepts/tower.md`:

```markdown
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
```

- [ ] **Step 2: Create origin-airport.md**

Create `packages/docs/docs/concepts/origin-airport.md`:

```markdown
---
title: Origin Airport
sidebar_position: 9
---

# Origin Airport

The **origin airport** represents the spec/implementation design stage — the place where crafts are planned before they fly, and where they return if they can't land.

## Aviation Analogy

In aviation, if an aircraft can't land at its destination (bad weather, mechanical issues), it may return to its origin airport. The flight data recorder is reviewed to understand what happened. ATC works the same way — when a craft can't be merged, it returns to the design stage with its complete black box for investigation.

## Purpose

The origin airport serves two roles:

### 1. The Starting Point

Every craft originates from a design decision. The origin airport is where someone decides "we need this change" and defines the craft's cargo, category, and flight plan.

### 2. The Emergency Destination

When a captain [declares an emergency](/docs/protocols/emergency-declaration), the craft is sent back to the origin airport. The origin receives:

- The craft's **callsign**
- The **cargo** description
- The **flight plan** (showing which vectors were passed and which weren't)
- The complete **black box** (the full audit trail)

### Re-evaluation

Using the black box to understand what went wrong, the origin airport decides one of three outcomes:

| Outcome | Description |
|---|---|
| **Re-plan** | The change is still needed but the approach was wrong. Create a new craft with a revised flight plan. |
| **Re-scope** | The change was too ambitious. Break it into smaller crafts. |
| **Abandon** | The change is no longer needed or feasible. No new craft is filed. |

## Rules

- **RULE-ORIG-1:** Crafts that cannot be landed after repeated attempts must be sent back to the origin airport for re-evaluation.
- **RULE-ORIG-2:** The origin airport must receive the craft's callsign, cargo description, flight plan, and complete black box upon emergency return.
- **RULE-ORIG-3:** The origin airport uses the black box to diagnose root cause and determine whether the craft should be re-planned, re-scoped, or abandoned.

## Example

```
Emergency Return:

Craft: feat-realtime-sync
Cargo: "Add real-time synchronization using WebSockets"
Vectors passed: 2/5 (Design schema ✅, Implement server ✅)
Vectors failed: 3/5 (Client integration, conflict resolution, load testing)

Black box analysis:
  - WebSocket library incompatible with current proxy setup
  - Three go-around attempts failed to resolve proxy issue
  - Captain declared emergency after third go-around

Origin decision: Re-scope
  → New craft 1: "Add SSE-based real-time updates" (simpler, proxy-compatible)
  → New craft 2: "Evaluate proxy upgrade for WebSocket support" (infrastructure)
```

## Related Concepts

- [Emergency Declaration](/docs/protocols/emergency-declaration) — triggers return to origin
- [Black Box](/docs/concepts/black-box) — the primary investigation artifact
- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) — ReturnToOrigin is a terminal state
```

- [ ] **Step 3: Commit**

```bash
git add packages/docs/docs/concepts/tower.md packages/docs/docs/concepts/origin-airport.md
git commit -m "feat(docs): add concept pages for tower and origin airport"
```

---

### Task 7: Lifecycle — Craft Lifecycle

**Files:**
- Create: `packages/docs/docs/lifecycle/craft-lifecycle.md`

- [ ] **Step 1: Create craft-lifecycle.md**

Create `packages/docs/docs/lifecycle/craft-lifecycle.md`:

```markdown
---
title: Craft Lifecycle
sidebar_position: 1
---

# Craft Lifecycle

Every craft in ATC follows a defined lifecycle — a sequence of states from creation to completion (or failure). Understanding the lifecycle is key to understanding how ATC orchestrates changes.

## States

| State | Terminal | Description |
|---|---|---|
| **Taxiing** | No | Craft initialized — branch created, pilots assigned, cargo and flight plan defined |
| **InFlight** | No | Pilots actively implementing, navigating vectors in order |
| **LandingChecklist** | No | All vectors passed. Pilot runs validation checks |
| **GoAround** | No | Landing checklist failed. Pilot addresses failures before re-attempt |
| **ClearedToLand** | No | Checklist passed, tower granted clearance. Craft is in merge queue |
| **Landed** | **Yes** | Branch merged into main. Done. |
| **Emergency** | No | Pilot declared an emergency after repeated failures |
| **ReturnToOrigin** | **Yes** | Craft sent back to design stage for re-evaluation. Done. |

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

| # | From | To | Trigger | Preconditions |
|---|---|---|---|---|
| 1 | Taxiing | InFlight | Pilot begins implementation | Captain, cargo, and flight plan assigned |
| 2 | InFlight | InFlight | Pilot passes a vector and reports to ATC | Next vector in flight plan sequence |
| 3 | InFlight | LandingChecklist | Pilot begins validation checks | All vectors passed and reported |
| 4 | LandingChecklist | ClearedToLand | All checks pass; tower grants clearance | All checklist items pass |
| 5 | LandingChecklist | GoAround | One or more checks fail | At least one checklist item failed |
| 6 | GoAround | LandingChecklist | Pilot re-attempts after fixing failures | Pilot has addressed failure(s) |
| 7 | GoAround | Emergency | Repeated failures or pilot escalates | Captain decision |
| 8 | ClearedToLand | Landed | Tower merges branch into main | Branch up to date with main |
| 9 | Emergency | ReturnToOrigin | Craft sent back to design with black box | Emergency declaration recorded |

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

If the landing checklist fails, the craft enters **GoAround**. The pilot fixes the issues and re-enters **LandingChecklist**. This loop can repeat multiple times. If the pilot can't resolve the failures after repeated attempts, the captain may escalate to **Emergency**.

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
```

- [ ] **Step 2: Commit**

```bash
git add packages/docs/docs/lifecycle/craft-lifecycle.md
git commit -m "feat(docs): add craft lifecycle page with state diagram"
```

---

### Task 8: Protocols — Vector Reporting, Landing Checklist

**Files:**
- Create: `packages/docs/docs/protocols/vector-reporting.md`
- Create: `packages/docs/docs/protocols/landing-checklist.md`

- [ ] **Step 1: Create vector-reporting.md**

Create `packages/docs/docs/protocols/vector-reporting.md`:

```markdown
---
title: Vector Reporting
sidebar_position: 1
---

# Vector Reporting Protocol

Each time a craft passes through a [vector](/docs/concepts/vectors-and-flight-plans), the pilot must file a vector report with ATC. This is not optional — unreported vectors are not considered passed, and the craft will be denied landing clearance.

## Aviation Analogy

In aviation, pilots report their position to air traffic control as they pass through waypoints on their route. ATC needs these reports to track the aircraft's progress and maintain separation. In the same way, ATC needs vector reports to verify a craft is progressing through its flight plan.

## Report Schema

| Field | Type | Description |
|---|---|---|
| Craft Callsign | `string` | The craft that passed the vector |
| Vector Name | `string` | The vector that was passed |
| Acceptance Evidence | `string` | Proof that acceptance criteria were met (test output, artifacts, etc.) |
| Timestamp | `Date` | When the vector was passed |

## How It Works

1. The pilot completes work that satisfies a vector's acceptance criteria.
2. The pilot files a vector report with ATC, including evidence that the criteria were met.
3. ATC records the report and updates the craft's flight plan status.
4. The pilot also records a `VectorPassed` entry in the [black box](/docs/concepts/black-box).
5. The pilot proceeds to the next vector in the flight plan.

## Rules

- **RULE-VRPT-1:** A vector report must be filed each time a craft passes through a vector. This is not optional.
- **RULE-VRPT-2:** A vector report must include the craft callsign, vector name, acceptance evidence, and timestamp.
- **RULE-VRPT-3:** ATC must record the report and update the craft's flight plan status.
- **RULE-VRPT-4:** A craft missing any vector report must be denied landing clearance.

## Example

```
Vector Report:
  Craft Callsign: feat-auth-flow
  Vector Name: "Implement OAuth callback"
  Acceptance Evidence: |
    - OAuth callback endpoint implemented at /api/auth/callback
    - Handles Google provider with code exchange
    - Returns session token on success
    - Returns 401 with error details on failure
    - Tests passing: test/auth/callback.test.ts (8/8)
  Timestamp: 2026-03-30T11:30:00Z
```

## Related Concepts

- [Vectors & Flight Plans](/docs/concepts/vectors-and-flight-plans) — what vectors are and how they're organized
- [Black Box](/docs/concepts/black-box) — VectorPassed entries complement the report
- [Landing Checklist](/docs/protocols/landing-checklist) — what happens after all vectors are reported
```

- [ ] **Step 2: Create landing-checklist.md**

Create `packages/docs/docs/protocols/landing-checklist.md`:

```markdown
---
title: Landing Checklist
sidebar_position: 2
---

# Landing Checklist

The **landing checklist** is a configurable set of validation checks that must all pass before a craft can request landing clearance from the [tower](/docs/concepts/tower). It's the final quality gate before merging.

## Aviation Analogy

Before landing, pilots run through a checklist — landing gear down, flaps set, speed correct. Every item must be verified. If something's wrong, they go around and try again. ATC's landing checklist works the same way — every validation must pass, or the craft goes around.

## Default Checks

| Check | Validation |
|---|---|
| **Tests** | All test suites pass |
| **Lint** | No lint errors or warnings |
| **Documentation** | Required docs are present and up to date |
| **Build** | Project builds successfully |

These are the defaults. Projects can add, remove, or modify checks to fit their needs.

## How It Works

1. The craft has passed all vectors in its flight plan and transitions to the **LandingChecklist** state.
2. The pilot (captain or first officer holding controls) executes each checklist item.
3. **If all items pass:** The craft requests landing clearance from the tower. If granted, it transitions to **ClearedToLand**.
4. **If any item fails:** The craft transitions to **GoAround**. The pilot fixes the issues and re-enters the checklist.

## The Go-Around Loop

A go-around is not a failure — it's a normal part of the process. The pilot:

1. Reviews which checklist items failed.
2. Fixes the issues (failing tests, lint errors, missing docs, build errors).
3. Records a `GoAround` entry in the [black box](/docs/concepts/black-box).
4. Re-enters the LandingChecklist state and runs the checks again.

This loop can repeat as many times as needed. However, if the pilot can't resolve the issues after repeated attempts, the captain may [declare an emergency](/docs/protocols/emergency-declaration).

## Rules

- **RULE-LCHK-1:** The landing checklist must be executed by the pilot (captain or first officer) holding controls.
- **RULE-LCHK-2:** All checklist items must pass for the craft to request landing clearance.
- **RULE-LCHK-3:** If any checklist item fails, the craft must perform a go-around.
- **RULE-LCHK-4:** The landing checklist is project-configurable. Projects may add, remove, or modify checks.

## Example

```
Landing Checklist for craft feat-auth-flow:

  ✅ Tests      — 142 passed, 0 failed
  ❌ Lint       — 3 errors in src/auth/callback.ts
  ✅ Docs       — JSDoc present on all exports
  ✅ Build      — tsc --build succeeded

Result: FAIL → Go-around initiated
  Pilot fixing: lint errors in callback.ts (unused imports, missing semicolons)
```

## Related Concepts

- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) — LandingChecklist, GoAround, and ClearedToLand states
- [Tower](/docs/concepts/tower) — grants clearance after checklist passes
- [Tower Merge Protocol](/docs/protocols/tower-merge-protocol) — what happens after clearance
- [Emergency Declaration](/docs/protocols/emergency-declaration) — when go-arounds can't fix the problem
```

- [ ] **Step 3: Commit**

```bash
git add packages/docs/docs/protocols/vector-reporting.md packages/docs/docs/protocols/landing-checklist.md
git commit -m "feat(docs): add protocol pages for vector reporting and landing checklist"
```

---

### Task 9: Protocols — Emergency Declaration, Tower Merge Protocol

**Files:**
- Create: `packages/docs/docs/protocols/emergency-declaration.md`
- Create: `packages/docs/docs/protocols/tower-merge-protocol.md`

- [ ] **Step 1: Create emergency-declaration.md**

Create `packages/docs/docs/protocols/emergency-declaration.md`:

```markdown
---
title: Emergency Declaration
sidebar_position: 3
---

# Emergency Declaration

When a craft cannot be landed after repeated [go-around](/docs/protocols/landing-checklist) failures or an unresolvable [vector](/docs/concepts/vectors-and-flight-plans), the captain declares an emergency. This is the escape hatch — the process for acknowledging that a change can't be completed as planned.

## Aviation Analogy

In aviation, a pilot declares an emergency ("mayday") when the aircraft is in serious trouble and normal procedures can't resolve the situation. The aircraft is then given priority handling and may divert to an alternate airport. In ATC, an emergency declaration diverts the craft back to the [origin airport](/docs/concepts/origin-airport) for re-evaluation.

## Who Can Declare

**Only the captain** can declare an emergency. First officers and jumpseaters cannot — even if they recognize the problem. This ensures there's a single, clear authority making the call.

## The Process

1. The captain decides the craft cannot be landed.
2. The captain records a final `EmergencyDeclaration` entry in the [black box](/docs/concepts/black-box), summarizing:
   - What issues were encountered
   - What remediations were attempted
   - Why the craft cannot be landed
3. The craft transitions from **Emergency** to **ReturnToOrigin** (a terminal state).
4. The origin airport receives the craft's callsign, cargo, flight plan, and complete black box.
5. The origin airport uses the black box to decide: [re-plan, re-scope, or abandon](/docs/concepts/origin-airport).

## When to Declare

An emergency is appropriate when:

- The landing checklist has failed repeatedly and the pilot cannot resolve the issues.
- A vector's acceptance criteria fundamentally cannot be met with the current approach.
- The craft's cargo has become invalid due to external changes (e.g., the target code was refactored by another craft).

An emergency is **not** appropriate for:

- A single go-around failure (try to fix it first).
- A disagreement between pilots (the captain has final authority via RULE-CTRL-6).
- Frustration or impatience (emergencies have real cost — they send work back to design).

## Rules

- **RULE-EMER-1:** Only the captain may declare an emergency.
- **RULE-EMER-2:** The captain must record a final EmergencyDeclaration entry in the black box summarizing issues and attempted remediations.
- **RULE-EMER-3:** Upon emergency declaration, the craft must be returned to the origin airport.
- **RULE-EMER-4:** The origin airport must receive the craft's callsign, cargo, flight plan, and complete black box.

## Example

```
Black Box — Final Entry:

[2026-03-30T17:45:00Z] agent-alpha (EmergencyDeclaration)
  "Declaring emergency on craft feat-realtime-sync.

  Issues:
    - WebSocket connections drop after 30 seconds behind the nginx reverse proxy
    - Proxy does not support HTTP/1.1 Upgrade headers in current configuration

  Attempted remediations:
    - Go-around 1: Added proxy_set_header Upgrade/Connection headers — still drops
    - Go-around 2: Tried long-polling fallback — introduces unacceptable latency
    - Go-around 3: Attempted direct connection bypassing proxy — violates infra policy

  Conclusion:
    Cannot land this craft without infrastructure changes to the proxy layer.
    Recommend re-scoping: split into SSE-based updates (proxy-compatible) and
    a separate infrastructure craft for WebSocket proxy support."
```

## Related Concepts

- [Craft Lifecycle](/docs/lifecycle/craft-lifecycle) — Emergency and ReturnToOrigin states
- [Origin Airport](/docs/concepts/origin-airport) — the destination for emergency returns
- [Black Box](/docs/concepts/black-box) — the primary artifact for investigation
- [Landing Checklist](/docs/protocols/landing-checklist) — repeated failures may trigger an emergency
```

- [ ] **Step 2: Create tower-merge-protocol.md**

Create `packages/docs/docs/protocols/tower-merge-protocol.md`:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add packages/docs/docs/protocols/emergency-declaration.md packages/docs/docs/protocols/tower-merge-protocol.md
git commit -m "feat(docs): add protocol pages for emergency declaration and tower merge"
```

---

### Task 10: Update Introduction and Verify Build

**Files:**
- Modify: `packages/docs/docs/introduction.md`

- [ ] **Step 1: Update introduction.md**

Replace the entire content of `packages/docs/docs/introduction.md` with:

```markdown
---
title: Introduction
sidebar_position: 1
slug: /
---

# ATC — Air Traffic Control

ATC is an agent orchestration system that coordinates multiple autonomous agents working on concurrent code changes in a shared repository. It uses aviation terminology as its domain language — changes are "crafts" flown by "pilots" who navigate "vectors" and request "landing clearance" from a "tower" to merge.

## Quick Reference

| Term | Meaning |
|---|---|
| [Craft](/docs/concepts/crafts) | Unit of work tied to a git branch |
| [Pilot](/docs/concepts/pilots-and-seats) | Autonomous agent with certifications |
| [Captain](/docs/concepts/pilots-and-seats) | Pilot-in-command, final authority |
| [First Officer](/docs/concepts/pilots-and-seats) | Certified co-pilot, can modify code |
| [Jumpseat](/docs/concepts/pilots-and-seats) | Observer/advisor, cannot modify code |
| [Vector](/docs/concepts/vectors-and-flight-plans) | Milestone with acceptance criteria |
| [Flight Plan](/docs/concepts/vectors-and-flight-plans) | Ordered sequence of vectors |
| [Black Box](/docs/concepts/black-box) | Append-only event log on every craft |
| [Tower](/docs/concepts/tower) | Merge coordinator, one per repo |
| [Controls](/docs/concepts/controls) | Exclusive or shared code modification rights |
| [Intercom](/docs/concepts/intercom) | Crew communication channel |
| [Origin Airport](/docs/concepts/origin-airport) | Design stage; emergency return destination |

## Documentation

### Getting Started

- **[Getting Started](/docs/getting-started)** — End-to-end walkthrough of the ATC workflow

### Concepts

- **[Crafts](/docs/concepts/crafts)** — The unit of work, tied to a branch
- **[Pilots & Seats](/docs/concepts/pilots-and-seats)** — Roles, permissions, and certifications
- **[Craft Categories](/docs/concepts/craft-categories)** — How changes are classified
- **[Controls](/docs/concepts/controls)** — Exclusive and shared code modification rights
- **[Intercom](/docs/concepts/intercom)** — Crew communication and radio discipline
- **[Vectors & Flight Plans](/docs/concepts/vectors-and-flight-plans)** — Milestones and routes
- **[Black Box](/docs/concepts/black-box)** — Append-only audit trail
- **[Tower](/docs/concepts/tower)** — Merge coordination
- **[Origin Airport](/docs/concepts/origin-airport)** — Design stage and emergency returns

### Lifecycle

- **[Craft Lifecycle](/docs/lifecycle/craft-lifecycle)** — States, transitions, and the state diagram

### Protocols

- **[Vector Reporting](/docs/protocols/vector-reporting)** — Filing milestone completion reports
- **[Landing Checklist](/docs/protocols/landing-checklist)** — Pre-merge validation
- **[Emergency Declaration](/docs/protocols/emergency-declaration)** — When a craft can't land
- **[Tower Merge Protocol](/docs/protocols/tower-merge-protocol)** — The merge sequence

### Reference

- **[Formal Specification](/docs/specification)** — The authoritative spec with numbered RULE-* identifiers
- **[Design Brief](/docs/design-brief)** — The original informal design notes
- **[Contributing](/docs/contributing)** — Validation checklist for changes
- **[Agent Operating Manual](/docs/agent/operating-manual)** — Behavioral guidance for pilots
```

- [ ] **Step 2: Verify build**

Run:

```bash
pnpm docs:build
```

Expected: Build succeeds with no broken link errors.

If the build fails due to broken links, fix the referenced files. Common issues:
- MDX parsing errors from curly braces in markdown (escape with backslash)
- Relative links that don't resolve in the Docusaurus structure

- [ ] **Step 3: Commit**

```bash
git add packages/docs/docs/introduction.md
git commit -m "feat(docs): update introduction with links to all concept and protocol pages"
```
