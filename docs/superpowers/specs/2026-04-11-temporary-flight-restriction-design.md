# Temporary Flight Restriction (TFR) — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Spec Sections:** 2.6 (Domain Model), 4.5 (Protocol)

## Summary

A Temporary Flight Restriction (TFR) is an externally imposed constraint that pauses agent activity to prevent token usage. TFRs allow the user to halt all agent work — globally, per-project, or per-craft — while configuring something or diagnosing an issue. TFRs do not alter craft lifecycle state; they act as an overlay flag (`holdingPattern`) that blocks all agent actions while active.

## Design Decisions

- **Overlay, not lifecycle state.** A TFR sets a `holdingPattern: true` flag on affected crafts rather than introducing a new `CraftStatus`. The craft retains its current state and resumes from it when the TFR lifts. This keeps the lifecycle state machine untouched.
- **Two enforcement modes.** Graceful (default) gives agents a wind-down window to reach a safe stopping point and record state. Immediate stops agents instantly with no wind-down — a force option for when token burn must stop now.
- **Three scope levels.** Global (all agents everywhere), project (all agents in one repository), and craft (one specific craft). Provides surgical precision without over-complicating.
- **User and optionally tower as issuers.** The user can always issue a TFR at any scope. The tower may issue project- or craft-scoped TFRs if enabled via a project configuration boolean. The tower may never issue global TFRs.
- **Automatic resume.** When a TFR is lifted, all affected agents automatically pick up where they left off. No manual per-agent restart.
- **Dual observability.** TFR events are recorded in both the tower's system log (global view) and each affected craft's black box (per-craft audit trail), plus intercom notifications.

## Spec Changes

### 1.1 Terminology Table — New Entry

| Term | Meaning |
|------|---------|
| Temporary Flight Restriction (TFR) | An externally imposed pause on agent activity, scoped globally, per-project, or per-craft. |

### 2.1.1 Black Box Entry Types — New Entries

| Type | When to Record |
|------|----------------|
| `TFRIssued` | A TFR has taken effect on this craft. Records scope, mode, reason, and issuer. |
| `TFRLifted` | A TFR affecting this craft has been lifted. Records duration and issuer. |

### 2.6 Temporary Flight Restriction

A **Temporary Flight Restriction (TFR)** is an externally imposed constraint that pauses agent activity to prevent token usage. TFRs do not alter craft lifecycle state — they act as an overlay that blocks all agent actions while active.

#### Properties

| Property   | Type                                  | Constraints                                                                  |
|------------|---------------------------------------|------------------------------------------------------------------------------|
| Identifier | `string`                              | Unique, immutable after creation.                                            |
| Scope      | `"global"`, `"project"`, or `"craft"` | Required. Determines what is affected.                                       |
| Target     | `string \| null`                      | Required for `project` (project ID) and `craft` (callsign) scopes. Null for global. |
| Mode       | `"graceful"` or `"immediate"`         | Required. Default: `graceful`.                                               |
| Reason     | `string`                              | Required. Why the TFR was issued.                                            |
| Issued By  | `"user"` or `"tower"`                 | Required. Who issued the TFR.                                                |
| Issued At  | `Date`                                | Timestamp when the TFR was issued.                                           |
| Lifted At  | `Date \| null`                        | Null while active. Set when lifted.                                          |

#### Rules

- **RULE-TFR-1:** A TFR MUST have a unique identifier, a scope, a mode, a reason, and an issuer.
- **RULE-TFR-2:** A TFR scoped to `project` MUST specify a project target. A TFR scoped to `craft` MUST specify a craft callsign. A `global` TFR MUST have a null target.
- **RULE-TFR-3:** The user MAY issue a TFR at any scope (global, project, or craft).
- **RULE-TFR-4:** The tower MAY issue a TFR at the project or craft scope only if tower-initiated TFRs are enabled in project configuration. The tower MUST NOT issue global TFRs.
- **RULE-TFR-5:** A TFR MUST NOT alter a craft's lifecycle state. Affected crafts retain their current `CraftStatus` but MUST have a `holdingPattern` flag set to `true`.
- **RULE-TFR-6:** While a craft's `holdingPattern` flag is `true`, no pilot on that craft MAY take any action — no code modifications, no vector reports, no checklist executions, no intercom messages, no control transfers.
- **RULE-TFR-7:** Multiple TFRs MAY be active simultaneously. A craft is in a holding pattern if *any* active TFR applies to it (by global scope, matching project, or matching callsign).
- **RULE-TFR-8:** Lifting a TFR clears the `holdingPattern` flag on all affected crafts that are not subject to another active TFR.

### 4.5 TFR Protocol

#### Issuance

1. The issuer (user or tower, per RULE-TFR-3/4) declares a TFR with scope, mode, reason, and target.
2. The system records the TFR with a timestamp.
3. The system identifies all affected crafts based on scope and target.

#### Enforcement — Graceful Mode (default)

1. All affected agents receive a TFR notification.
2. Agents are given a brief wind-down window to reach a safe stopping point.
3. During wind-down, agents MUST record their current state in the black box as an `Observation` entry.
4. After wind-down, the `holdingPattern` flag is set on all affected crafts.
5. A `TFRIssued` entry is recorded in each affected craft's black box.

#### Enforcement — Immediate Mode

1. All affected agents are stopped immediately.
2. The `holdingPattern` flag is set on all affected crafts with no wind-down window.
3. A `TFRIssued` entry is recorded in each affected craft's black box by the system (since agents cannot act).

#### Lifting

1. The user lifts the TFR (only the user may lift a TFR, regardless of who issued it).
2. The system sets `liftedAt` on the TFR record.
3. The `holdingPattern` flag is cleared on all affected crafts not subject to another active TFR.
4. All affected agents automatically resume from their prior state.

#### Observability

- A `TFRIssued` entry MUST be recorded in the black box of every affected craft when the TFR takes effect.
- A `TFRLifted` entry MUST be recorded in the black box of every affected craft when the TFR is lifted.
- Both events MUST also be posted as system notifications on each affected craft's intercom.
- The tower MUST maintain a log of all TFR events (issued, lifted) with full metadata.

#### Rules

- **RULE-TFRP-1:** In graceful mode, agents MUST be given a wind-down window to reach a safe stopping point and record state before the holding pattern takes effect.
- **RULE-TFRP-2:** In immediate mode, the holding pattern takes effect instantly with no wind-down.
- **RULE-TFRP-3:** Only the user MAY lift a TFR, regardless of who issued it.
- **RULE-TFRP-4:** When a TFR is lifted, all affected agents MUST automatically resume from their prior state.
- **RULE-TFRP-5:** A `TFRIssued` and `TFRLifted` entry MUST be recorded in the black box of every affected craft.
- **RULE-TFRP-6:** TFR events MUST be posted as system notifications on each affected craft's intercom.
- **RULE-TFRP-7:** The tower MUST maintain a log of all TFR events with full metadata.

### Appendix A — New Rule Index Entries

| Rule ID    | Summary                                                                | Section |
|------------|------------------------------------------------------------------------|---------|
| RULE-TFR-1 | TFR must have identifier, scope, mode, reason, and issuer.             | 2.6     |
| RULE-TFR-2 | Project/craft TFRs require target; global TFRs have null target.       | 2.6     |
| RULE-TFR-3 | User may issue TFR at any scope.                                       | 2.6     |
| RULE-TFR-4 | Tower may issue project/craft TFR if enabled; never global.            | 2.6     |
| RULE-TFR-5 | TFR must not alter lifecycle state; uses holdingPattern flag.           | 2.6     |
| RULE-TFR-6 | No pilot actions permitted while holdingPattern is true.               | 2.6     |
| RULE-TFR-7 | Multiple TFRs may coexist; craft holds if any TFR applies.            | 2.6     |
| RULE-TFR-8 | Lifting TFR clears holdingPattern unless another TFR still applies.   | 2.6     |
| RULE-TFRP-1| Graceful mode: wind-down window before holding pattern.                | 4.5     |
| RULE-TFRP-2| Immediate mode: no wind-down, instant hold.                            | 4.5     |
| RULE-TFRP-3| Only the user may lift a TFR.                                          | 4.5     |
| RULE-TFRP-4| Agents auto-resume when TFR is lifted.                                 | 4.5     |
| RULE-TFRP-5| TFRIssued and TFRLifted entries in affected craft black boxes.         | 4.5     |
| RULE-TFRP-6| TFR events posted as intercom system notifications.                    | 4.5     |
| RULE-TFRP-7| Tower maintains log of all TFR events.                                 | 4.5     |
