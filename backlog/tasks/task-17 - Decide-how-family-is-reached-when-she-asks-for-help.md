---
id: TASK-17
title: Decide how family is reached when she asks for help
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-09-29 05:53'
updated_date: '2026-10-05 10:50'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research done 2026-10-05 (opencode). Figures verified against vendor pages, not memory; recorded in backlog/decisions/decision-01.md (status: proposed, awaiting the owner).

The requirement that decides this is m-7's honest status - sent only after confirmed delivery, answered only when someone actually responds - not cost. A channel that cannot report acknowledgement cannot back an honest reassurance to a woman with dementia.

Verified: Pushover \.99 one-time per platform (iOS/Android/Desktop separate), no individual subscription, 10k sends/month free, emergency receipts pollable every 5s for a week with acknowledged/acknowledged_at/acknowledged_by/acknowledged_by_device, retries server-side until expire. Twilio US SMS \.0083/segment plus carrier passthrough (~\.012-0.013 real), receipts from carriers not Twilio. Twilio US Voice inbound local \.0085/min, toll-free \.0220/min, numbers rented \.15/mo local, \.15/mo toll-free.

The disqualifier for SMS is structural, not price: A2P 10DLC is mandatory for anyone sending from a 10DLC number to the US 'including individuals and hobbyists', needs Brand + manually vetted Campaign, and Standard Brands require a business Tax ID. GrammieGuide is a family-run kiosk for one woman, not a business, so no Standard Brand. Sole Proprietor exists but is for first-time/low-volume senders and still needs vetting. Exact fee table is on a JS-only help page and could not be verified without signing in; not load-bearing.

AC2 answered: request a callback, never a live call. No handset or in-call UI exists, and a ringing phone with an unfamiliar voice is more alarming than a silent alert to family who then call her own phone - the clinically-aligned direction. zLayers.incomingCall/activeCall stay unused.

Naming constraint found, worth flagging to TASK-22: since no call is placed, a button labelled 'Call Sarah' on her Home screen would be a lie. Her-facing copy must say 'Ask Sarah to call' with her photo. 'Call Sarah' survives only caregiver-facing.

Also found while researching: HelpOverlay.tsx:65 says 'A caregiver has been notified. You're safe at home.' with no notification code behind it, and HelpButton.tsx / HelpOverlay.tsx are dead code - nothing imports them. The Get help button was removed from Home in cb1f6e6 precisely because no calling capability existed to back it. So TASK-22 is greenfield: no IPC channel, no config block (schema is at v7), no service, no dependency, and no admin tab. zLayers.incomingCall/activeCall and PhoneIcon exist and are reusable.

Offline is identical across all four channels and is not a differentiator: all need the kiosk online, and she must never see a success state when nothing was sent. That is a hard requirement on TASK-33. Pushover also adds an 'expired' state distinct from 'failed'.
<!-- SECTION:NOTES:END -->
