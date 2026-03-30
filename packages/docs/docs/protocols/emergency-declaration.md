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
