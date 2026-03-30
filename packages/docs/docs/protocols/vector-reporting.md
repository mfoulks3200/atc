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
