---
title: Intercom
sidebar_position: 5
---

# Intercom

The **intercom** is a shared communication channel for all pilots aboard a craft. All intercom traffic is recorded in the [black box](/docs/concepts/black-box).

## Aviation Analogy

In aviation, cockpit communication follows strict radio discipline — pilots identify themselves, state who they're addressing, and keep transmissions short and clear. ATC adopts the same discipline to prevent miscommunication between pilots.

## Implementation

In the daemon, each craft maintains an intercom message history as an array of `IntercomMessage` entries. The REST API exposes two endpoints per craft:

- `GET /api/v1/projects/:name/crafts/:callsign/intercom` — list all messages
- `POST /api/v1/projects/:name/crafts/:callsign/intercom` — send a message

Each message records the sender (`from`), their seat type (`seat`), the message content, and a timestamp.

The daemon also provides real-time delivery via WebSocket pub/sub. Clients subscribe to channel patterns (exact match, prefix glob like `"craft:*"`, or the `"*"` firehose) through a `ChannelRegistry` and receive published messages when patterns match. System notifications (e.g., checklist results) are also broadcast to intercom subscribers.

## Radio Discipline

### The 3W Principle

Every transmission must include:

1. **Who you are calling** — the recipient
2. **Who you are** — the sender
3. **Where you are** — your current context in the codebase

```
"pilot-bravo, pilot-alpha, I'm in src/auth/oauth.ts working on the callback handler."
```

### Readback

Safety-critical exchanges — especially control handoffs — must be explicitly read back by the receiving pilot to confirm understanding:

```
pilot-alpha: "pilot-bravo, pilot-alpha, your controls."
pilot-bravo: "pilot-alpha, pilot-bravo, my controls. Confirmed."
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

pilot-alpha: "pilot-bravo, pilot-alpha, I'm in src/auth/session.ts.
  I need to add a dependency on your token validation function in src/auth/tokens.ts.
  Can we coordinate? Over."

pilot-bravo: "pilot-alpha, pilot-bravo, I'm wrapping up the token refresh logic
  in src/auth/tokens.ts. Give me five minutes and I'll export the validator.
  I'll call you when it's ready. Over."

pilot-alpha: "pilot-bravo, pilot-alpha, copy. Standing by. Out."
```

## Related Concepts

- [Controls](/docs/concepts/controls) — handoffs require intercom readback
- [Black Box](/docs/concepts/black-box) — all intercom traffic is recorded
- [Pilots & Seats](/docs/concepts/pilots-and-seats) — all seat types can use the intercom
