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
| Craft | Unit of work tied to a git branch |
| Pilot | Autonomous agent with certifications |
| Captain | Pilot-in-command, final authority |
| First Officer | Certified co-pilot, can modify code |
| Jumpseat | Observer/advisor, cannot modify code |
| Vector | Milestone with acceptance criteria |
| Flight Plan | Ordered sequence of vectors |
| Black Box | Append-only event log on every craft |
| Tower | Merge coordinator, one per repo |
| Controls | Exclusive or shared code modification rights |

## Documentation

- **[Specification](/docs/specification)** — The authoritative formal spec with numbered `RULE-*` identifiers
- **[Contributing](/docs/contributing)** — Validation checklist for all changes
- **[Design Brief](/docs/design-brief)** — The original informal design notes
- **[Agent Operating Manual](/docs/agent/operating-manual)** — Behavioral guidance for agents operating as pilots
