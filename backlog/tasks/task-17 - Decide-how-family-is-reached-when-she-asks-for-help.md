---
id: TASK-17
title: Decide how family is reached when she asks for help
status: To Do
assignee: []
created_date: '2026-09-29 05:53'
labels: []
milestone: m-7
dependencies: []
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
- [ ] #1 Options are compared on confirmed delivery, knowing someone saw or answered, monthly cost, setup for each family member, and what happens when the kiosk is offline
- [ ] #2 It is decided whether "Call Sarah" requests a call back or places a live call
- [ ] #3 The choice is recorded as a Backlog decision, and the contact-family task is updated to match
- [ ] #4 A test request is sent end to end through the chosen channel from a dev machine, and its delivery and acknowledgement can be read back
<!-- AC:END -->
