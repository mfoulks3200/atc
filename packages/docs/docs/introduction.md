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
