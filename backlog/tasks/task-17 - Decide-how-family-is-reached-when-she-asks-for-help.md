---
id: TASK-17
title: Decide how family is reached when she asks for help
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-29 05:53'
updated_date: '2026-10-05 21:29'
labels: []
milestone: m-7
dependencies: []
references:
  - decision-02
priority: high
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The contact-family flow needs a real delivery channel, and the choice decides what "Request sent" and "answered" can honestly mean. Nothing is chosen yet. Starting points to verify, since terms and prices change:

- Push-notification app such as Pushover: emergency priority repeats until someone acknowledges, and receipts report delivery and acknowledgement. Each contact installs an app (one-time purchase); no phone number to rent.
- Text message through a provider such as Twilio: familiar to everyone, but delivery reports come from carriers and are not always reliable, US business texting needs A2P 10DLC or toll-free registration, and reading replies needs a way to receive or poll inbound messages.
- Automated phone call through a provider such as Twilio: rings like a call and can tell a person from voicemail with "press 1 to confirm"; needs a rented number.
- Email: free and simple, but no confirmation that anyone saw it.

Also undecided: whether "Call Sarah" asks Sarah to call her back, or places a live call from the kiosk (a much bigger feature). The V2 specs avoided new accounts on purpose; this feature likely needs one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Options are compared on confirmed delivery, knowing someone saw or answered, monthly cost, setup for each family member, and what happens when the kiosk is offline
- [x] #2 It is decided whether "Call Sarah" requests a call back or places a live call
- [x] #3 The choice is recorded as a Backlog decision, and the contact-family task is updated to match
- [ ] #4 A test request is sent end to end through the chosen channel from a dev machine, and its delivery and acknowledgement can be read back
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Compare no-install channels on delivery confirmation, human acknowledgement, cost, recipient setup, and offline behavior; reject any option that requires each family member to install or buy an app.
2. Use ordinary SMS as the proposed channel: send through Twilio, poll the outbound Message resource until delivered/undelivered/failed, and poll inbound Message resources for a reply from the configured contact without requiring a public webhook.
3. Define truthful states: “Sending” while queued/sent, “Request delivered” only after Twilio reports device delivery, and “Sarah saw it” only after an inbound YES reply from Sarah after that request. Timeout or failure advances to the configured fallback and never implies anyone is coming.
4. Present the SMS proposal and “Ask Sarah to call” wording for explicit owner approval before accepting the material vendor/product decision.
5. Once approved, record the accepted decision through Backlog CLI and update TASK-22 and TASK-33 to cover Twilio credentials, sole-proprietor/A2P setup, polling, deduplication, expiry, reply correlation, and fallback behavior.
6. Run an end-to-end development-machine test with owner-supplied local Twilio credentials and registered sender, verify delivery and an inbound YES reply, then finalize TASK-17 against each acceptance criterion.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision research and validation (2026-10-05):

- Pushover offers explicit acknowledgement receipts and low one-time per-platform pricing, but every family member would have to purchase/install/learn a dedicated app. The owner rejected that support burden, so Pushover is out.
- Ordinary SMS reaches existing phones with no recipient setup. Twilio reports outbound queued/sent/delivered/undelivered/failed states; delivered means device delivery, not human reading. An inbound reply from the configured number is the only honest human acknowledgement. Twilio charges for a number, usage, carrier passthrough, and A2P registration/campaign costs; the caregiver has a one-time account, sender, and compliance setup burden.
- Automated voice also requires no recipient app and can collect a keypad response, but it is more intrusive, interacts poorly with voicemail, and adds call-flow and per-minute complexity.
- Email has minimal provider cost and no recipient setup, but timely delivery and human acknowledgement cannot be established reliably, so it cannot be the primary safety channel.
- Every channel needs the kiosk online. Offline or an unconfirmed API outcome must remain failed/unknown and must never produce reassurance.

Owner accepted decision-02: ordinary Twilio SMS with REST polling and no public webhook. Home says “Ask {name} to call”; the kiosk does not place a live call. The recipient gets a normal text such as “Grammie asked you to call her. Reply YES to confirm you saw this.” “Request delivered” requires Twilio device-delivery status. “{name} saw it” requires a new inbound YES from that configured phone after the request. A second SMS contact is the automatic fallback; if neither contact can be confirmed, Home directs her to the real telephone without claiming anyone was notified.

TASK-22 and TASK-33 reference decision-02 and contain the corresponding UI, secret-storage, polling, persistence, deduplication, restart, late-reply, and fallback requirements. Current Twilio documentation was checked through Context7; API keys are preferred over the main Auth Token for production.

Live-test blocker: this development machine currently has no Twilio Account SID, API key/secret or Auth Token, sender/Messaging Service, destination number, or Twilio CLI configured. AC4 remains open until the owner completes Twilio account/sender registration and supplies credentials locally; no secret values should be posted in task notes or chat.
<!-- SECTION:NOTES:END -->
