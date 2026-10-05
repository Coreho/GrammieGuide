---
id: decision-01
title: 'Contact family over Pushover emergency push, not SMS or live calling'
date: '2026-10-05 10:48'
status: proposed
---
## Context

Milestone m-7 wants a familiar face and an honest status: "sent only after confirmed delivery, and answered only when someone actually responds." That requirement, not cost, is what decides the channel. A channel that cannot report acknowledgement cannot back an honest "someone saw this" line to a woman with dementia, and an untrue reassurance is worse than no feature at all.

There is also a live honesty bug to fix regardless: `HelpOverlay.tsx:65` says "A caregiver has been notified. You're safe at home." with no notification code behind it, and the unused overlay is the only place that string exists.

### Verified 2026-10-05

**Pushover** - $4.99 USD one-time per platform (iPhone/iPad, Android and Desktop are each a separate purchase; multiple devices of the same platform are covered). No subscription for individuals. Each user may send up to 10,000 messages/month free. Emergency-priority messages return a 30-character receipt, pollable no faster than once every 5 seconds and for up to 1 week, returning `acknowledged`, `acknowledged_at`, `acknowledged_by`, `acknowledged_by_device`, `last_delivered_at`, `expired`, `expires_at`. Retries continue server-side until the message's `expire` value, and can be cancelled by receipt or by tag. Callback URLs are offered as an alternative to polling, but require a URL reachable from the public Internet.

**Twilio US SMS** - $0.0083 per 160-character segment base rate, plus carrier passthrough (AT&T $0.0035, T-Mobile $0.0045 outbound), so roughly $0.012-0.013 per segment in practice. $0.001 per message that terminates in `Failed`. Delivery receipts originate from the carriers, not Twilio.

**Twilio US Programmable Voice** - inbound local $0.0085/min, inbound toll-free $0.0220/min, outbound local $0.0140/min. Numbers are rented: local $1.15/month, toll-free $2.15/month.

**Twilio A2P 10DLC** - registration is mandatory for *anyone* sending SMS from a 10DLC number to US numbers, "including individuals and hobbyists". It requires a Brand plus a Campaign, and Campaigns are manually vetted for opt-in/opt-out and purpose. Standard and Low-Volume Standard Brands require a business Tax ID (EIN). Unregistered traffic attracts additional carrier fees, and Campaign use-case types carry monthly fees. Toll-free and short-code numbers sit outside 10DLC but have their own onboarding.

The decisive detail is the Tax ID. GrammieGuide is one elderly woman's kiosk maintained by her family, not a business, so a Standard Brand is not available to it. Sole Proprietor registration exists for first-time and low-volume senders, but it is still manually vetted and is not positioned for a permanent safety feature. The exact fee table sits on a JavaScript-only help page and could not be verified without signing in - treat the figure as unknown, but the structure is disqualifying either way.

### Offline behaviour is identical across every channel

All four options need the kiosk online. If her Wi-Fi is down, nothing is sent, and she must never be shown a success state. The app already knows about connectivity (`services/reliability/wifiWatch.ts`, and the browser's own offline detection), so this is a hard requirement on TASK-33 rather than a new problem. Pushover's retries are server-side and stop at `expire`, so a request can also end `expired` without ever being delivered - a state distinct from `failed`.

### AC2: "Call Sarah" cannot mean a live call

The kiosk has no handset requirement, no in-call UI, and none of the reserved `zLayers.incomingCall` / `activeCall` slots are used. A ringing phone putting an unfamiliar voice in a dementia patient's room is more alarming than a silent alert to a family member who then calls her own handset, which is the clinically-aligned direction. The design file's "Calling Sarah now / Sarah will be on the line in a moment" was already replaced with honest copy precisely because no calling exists (`HelpButton.tsx:4-9`).

## Decision

**Pushover, emergency priority, with polled receipts.** SMS and live calling are both rejected for now; email is rejected outright as a primary channel.

**"Call Sarah" asks Sarah to call her.** It does not place a call. Consequently her-facing copy must not say "Call Sarah" - a button labelled that way promises a thing this app does not do, which is the exact failure mode TASK-22 AC#6 exists to prevent. Her-facing wording should state what happens ("Ask Sarah to call"), with Sarah's photo, which the launcher CSP and `grammie-media:` protocol already permit and TASK-14 already covers. "Call Sarah" survives only in the caregiver-facing sense.

The kiosk polls receipts; it does not accept callbacks. It sits behind NAT on a home network with no public URL, so Pushover's callback option is unusable. Polling runs roughly every 15-30 seconds while a request is outstanding, respecting the documented 5-second floor, and stops at `expires_at`.

## Consequences

- **A single third-party vendor sits on the safety-critical path.** Pushover is a small independent company; that concentration is the main risk of this choice. It is mitigated by keeping the model in TASK-22 - one preferred contact plus a clear fallback - so losing Pushover degrades rather than breaks the feature.
- **Every contact must install and buy the app** ($4.99 once per platform). Acceptable for adult children; not acceptable if a contact is elderly or not technical. The caregiver panel has to be honest about this when adding a contact.
- **SMS cannot serve as the fallback** without A2P 10DLC registration, which this project cannot do without a business Tax ID. So the fallback must be a second Pushover contact or email - and email cannot report acknowledgement, so it may only ever be a best-effort secondary. TASK-22 should be told this before it designs the fallback.
- **Three new persisted states** are needed for TASK-33: `expired` (server-side retries ran out, distinct from `failed`) alongside `delivered` and `answered`, plus `acknowledged_by_device` for the caregiver's benefit.
- **Unverified:** the A2P 10DLC registration fee. Not load-bearing for this decision.
- **Reconsideration trigger:** if the owner has no family member willing to install Pushover, this decision is void and the honest fallback is a loud on-screen prompt to use a real telephone, with no notification at all. That is a worse product but a truthful one.