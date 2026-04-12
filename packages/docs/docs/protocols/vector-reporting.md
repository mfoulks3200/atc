---
title: Vector Reporting
sidebar_position: 1
---

# Vector Reporting Protocol

Each time a craft passes through a [vector](/docs/concepts/vectors-and-flight-plans), the pilot must file a vector report with ATC. This is not optional -- unreported vectors are not considered passed, and the craft will be denied landing clearance.

## Aviation Analogy

In aviation, pilots report their position to air traffic control as they pass through waypoints on their route. ATC needs these reports to track the aircraft's progress and maintain separation. In the same way, ATC needs vector reports to verify a craft is progressing through its flight plan.

## Report Schema

The `VectorReport` interface is defined in `@airtrafficcontrol/types`:

| Field                | Type     | Description                                                            |
| -------------------- | -------- | ---------------------------------------------------------------------- |
| `craftCallsign`      | `string` | The craft that passed the vector                                       |
| `vectorName`         | `string` | The vector that was passed                                             |
| `acceptanceEvidence` | `string` | Proof that acceptance criteria were met (test output, artifacts, etc.) |
| `timestamp`          | `Date`   | When the vector was passed                                             |

## How It Works

Vector reporting is implemented in `@airtrafficcontrol/core` (`flight-plan.ts`). The core functions are:

### 1. Get the Next Vector

`getNextVector(flightPlan)` returns the first vector with `Pending` status. Vectors must be passed in order (RULE-VEC-2).

### 2. Report the Vector

`reportVector(flightPlan, vectorName)` validates and records a vector passage:

- Throws `VectorError` if the vector does not exist in the flight plan.
- Throws `VectorError` if the vector has already been passed.
- Throws `VectorError` if the vector is not the next in sequence (enforces RULE-VEC-2: no skipping).
- Returns an updated flight plan (with the vector's status set to `Passed`) and a skeleton `VectorReport`.

:::note
The `VectorReport` returned by `reportVector()` has empty `craftCallsign` and `acceptanceEvidence` fields. Callers are expected to populate these or use `createVectorReport()` separately.
:::

### 3. Create a Full Vector Report

`createVectorReport(craftCallsign, vectorName, evidence)` creates a complete `VectorReport` with all fields populated and the current timestamp.

### 4. Record in the Black Box

The pilot also records a `VectorPassed` entry in the [black box](/docs/concepts/black-box). This is separate from the vector report itself.

### 5. Check Completion

`allVectorsPassed(flightPlan)` returns `true` when every vector has `Passed` status. Returns `true` for an empty flight plan (vacuously true). This is used by the tower to verify landing clearance eligibility (RULE-VEC-4).

## Rules

- **RULE-VEC-2:** Vectors must be passed in order. A pilot must not skip ahead. Enforced in `reportVector()`.
- **RULE-VEC-3:** When a craft passes through a vector, the pilot must report it to ATC.
- **RULE-VEC-4:** A craft must not enter the Landing Checklist phase until all vectors have been passed and reported.
- **RULE-VRPT-1:** A vector report must be filed each time a craft passes through a vector. This is not optional.
- **RULE-VRPT-2:** A vector report must include the craft callsign, vector name, acceptance evidence, and timestamp. Enforced by the `VectorReport` interface.
- **RULE-VRPT-3:** ATC must record the report and update the craft's flight plan status. Implemented by `reportVector()` returning an updated flight plan.
- **RULE-VRPT-4:** A craft missing any vector report must be denied landing clearance. Enforced in `Tower.requestClearance()` via `allVectorsPassed()`.

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

- [Vectors & Flight Plans](/docs/concepts/vectors-and-flight-plans) -- what vectors are and how they're organized
- [Black Box](/docs/concepts/black-box) -- VectorPassed entries complement the report
- [Landing Checklist](/docs/protocols/landing-checklist) -- what happens after all vectors are reported
