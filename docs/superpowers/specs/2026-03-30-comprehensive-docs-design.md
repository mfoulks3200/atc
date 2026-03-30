# Comprehensive ATC Documentation — Design Spec

## Overview

Create a full set of concept, lifecycle, and protocol documentation pages for the ATC Docusaurus site at `packages/docs/`. Target audience is both developers integrating with ATC and agent authors writing pilots. Each concept gets its own focused page written in approachable language with links back to formal spec rules.

## Sidebar Structure

```
Getting Started
  ├── Introduction (existing, updated)
  └── Getting Started (new)

Concepts
  ├── Crafts
  ├── Pilots & Seats
  ├── Craft Categories
  ├── Controls
  ├── Intercom
  ├── Vectors & Flight Plans
  ├── Black Box
  ├── Tower
  └── Origin Airport

Lifecycle
  └── Craft Lifecycle

Protocols
  ├── Vector Reporting
  ├── Landing Checklist
  ├── Emergency Declaration
  └── Tower Merge Protocol

Reference
  ├── Formal Specification (existing)
  └── Design Brief (existing)

Guides
  ├── Contributing (existing)
  └── Agent Operating Manual (existing)
```

## Page Content Pattern

Each concept page follows this structure:

1. **One-sentence definition** — what it is in plain language
2. **Aviation analogy** — the real-world parallel
3. **Properties/structure** — table of fields/attributes (where applicable)
4. **Rules** — relevant `RULE-*` entries explained conversationally
5. **Examples** — concrete scenarios
6. **Related concepts** — links to related pages

## New Pages (15 files)

| File Path | Content Summary |
|---|---|
| `docs/getting-started.md` | End-to-end walkthrough: filing a craft, assigning pilots, flying vectors, landing checklist, merge |
| `docs/concepts/crafts.md` | Properties, callsign, branch, cargo, category. RULE-CRAFT-1 through 5 |
| `docs/concepts/pilots-and-seats.md` | Captain/FO/Jumpseat roles, permissions matrix, certification requirement |
| `docs/concepts/craft-categories.md` | What categories are, examples, how they connect to certifications |
| `docs/concepts/controls.md` | Exclusive vs shared, handoff protocol, RULE-CTRL-* |
| `docs/concepts/intercom.md` | Radio discipline, 3W principle, readback, RULE-ICOM-* |
| `docs/concepts/vectors-and-flight-plans.md` | Vectors, ordering, acceptance criteria, flight plan |
| `docs/concepts/black-box.md` | Entry schema, entry types, append-only, emergency role |
| `docs/concepts/tower.md` | Responsibilities, one-per-repo, merge queue |
| `docs/concepts/origin-airport.md` | Design stage, emergency returns, re-evaluation |
| `docs/lifecycle/craft-lifecycle.md` | 8 states, 9 transitions, state diagram, terminal states |
| `docs/protocols/vector-reporting.md` | Report schema, filing process, RULE-VRPT-* |
| `docs/protocols/landing-checklist.md` | Default checks, configurability, go-around, RULE-LCHK-* |
| `docs/protocols/emergency-declaration.md` | Captain-only, black box handoff, RULE-EMER-* |
| `docs/protocols/tower-merge-protocol.md` | 6-step sequence, conflict handling, RULE-TMRG-* |

## Modified Files

| File Path | Change |
|---|---|
| `docs/introduction.md` | Update links section to point to new concept/lifecycle/protocol pages |
| `sidebars.ts` | Restructure with new categories matching sidebar structure above |

## Content Source

All page content is derived from the formal specification at `docs/specification.md`. Pages rewrite spec content in approachable language rather than duplicating the formal tone. Each page links back to the spec for authoritative rule definitions.

## Out of Scope

- API reference docs (no runtime API exists yet)
- Diagrams/images (text-based state diagrams only, using Mermaid if Docusaurus supports it or plain text tables)
- Search configuration
- Blog posts
