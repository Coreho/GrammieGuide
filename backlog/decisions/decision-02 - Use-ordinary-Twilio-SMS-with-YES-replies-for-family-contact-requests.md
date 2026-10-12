---
id: decision-02
title: Use ordinary Twilio SMS with YES replies for family contact requests
date: '2026-10-05 21:28'
status: accepted
---
## Context

Milestone m-7 lets her ask family for help from Home. The status she sees has to be honest: a request counts as delivered only when the channel confirms it, and as seen only when a person actually answers. A false reassurance to someone with dementia is worse than no feature.

Options compared (TASK-17) on confirmed delivery, knowing someone saw it, monthly cost, setup for each family member, and offline behavior:

- **Pushover emergency priority** has real acknowledgement receipts and low one-time pricing, but every family member must buy, install and learn a dedicated app. The owner rejected that support burden.
- **Ordinary SMS through Twilio** reaches the phones family already have with no setup on their side. Twilio reports queued, sent, delivered, undelivered and failed; "delivered" means the handset received it, not that anyone read it. A reply from the configured number is the only honest acknowledgement. Costs are a number, per-message usage, carrier passthrough fees and A2P 10DLC registration (Sole Proprietor brand, since this is not a business), and the caregiver does a one-time account, sender and compliance setup.
- **Automated voice calls** need no app and can collect a keypad answer, but are more intrusive, behave badly with voicemail, and add call-flow and per-minute cost.
- **Email** is cheap and needs no setup, but neither timely delivery nor human acknowledgement can be established, so it cannot be the primary safety channel.

Every channel needs the kiosk online.

## Decision

Use ordinary SMS sent through Twilio's REST API, with polling instead of a webhook so the kiosk needs no publicly reachable address.

- Home's button says "Ask {name} to call". The kiosk never places a live call.
- The family member receives a normal text, for example "Grammie asked you to call her. Reply YES to confirm you saw this."
- Her status is strictly tied to evidence: "Sending" while queued or sent; "Request delivered" only after Twilio reports device delivery; "{name} saw it" only after a new inbound YES from that configured phone, received after this request.
- A second SMS contact is the automatic fallback. If neither contact can be confirmed, Home directs her to the real telephone and never claims that anyone was notified or is coming.

## Consequences

- TASK-22 and TASK-33 are written against this channel: Twilio credentials and contact numbers are caregiver-only and main-process-only, never logged or sent to a renderer; production uses a restricted API key rather than the account Auth Token.
- The request lifecycle must persist the outbound Message SID before treating submission as complete, survive restarts, deduplicate, expire requests, correlate replies to the right request, reject stale or duplicate replies, keep late replies after fallback, and never resend just because a local save outcome is uncertain.
- Offline, or an API outcome that cannot be confirmed, stays failed or unknown and produces no reassurance.
- The caregiver must create a Twilio account, register a sender (A2P 10DLC) and supply credentials before the feature works. TASK-17's end-to-end test from a dev machine waits on that.
- This replaces the earlier Pushover recommendation in PR #32, which was never merged.
