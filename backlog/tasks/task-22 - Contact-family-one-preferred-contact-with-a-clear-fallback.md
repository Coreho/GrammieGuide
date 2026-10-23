---
id: TASK-22
title: 'Contact family: one preferred contact with a clear fallback'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 05:54'
updated_date: '2026-10-23 17:19'
labels: []
milestone: m-7
dependencies:
  - TASK-17
  - TASK-33
  - TASK-05
  - TASK-06
references:
  - decision-02
  - TASK-54
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
priority: high
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A familiar face and "Call Sarah" is more concrete than a generic Help button. Today she has no way to ask for help at all: the Help button was removed from Home in M3 (commit cb1f6e6), and the unused `HelpOverlay` still says "A caregiver has been notified" with no notification logic behind it. This task is what she sees and what the caregiver sets up, on the channel chosen in TASK-17. Delivery tracking (saved status, timeouts, late answers, expiry) was split out into TASK-33 after Codex's review. Honesty is the core requirement: "Request sent" only after confirmed delivery, and "answered" only when someone actually responds. The button's words must match what the channel really does: a request for a call back should not be labeled as a call. The contact photo comes from the media library (TASK-05, TASK-06), so this does not wait for the photo library. Start with one preferred contact and one fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Home shows a large contact button with the preferred contact's photo and name, always in the same place, worded to match what the chosen channel does
- [x] #2 Tapping it shows a calm "Sending…" state; "Request sent" appears only after delivery is confirmed
- [x] #3 A different, clear message appears only when the contact actually responds, never on delivery alone
- [x] #4 If delivery fails, is unknown, or nobody responds in time, she sees plainly what happens next (the fallback contact, or what to do instead); nothing implies someone is coming
- [x] #5 Repeated taps never send duplicate requests; they show the current request's status
- [x] #6 No screen says someone was notified unless delivery was confirmed; the old "A caregiver has been notified" text is removed or shown only after confirmation
- [x] #7 The caregiver sets the preferred and fallback contacts (name, photo, how to reach them) in admin; channel credentials are secrets, stripped from renderers and set through their own admin channel like the API key
- [x] #8 When she seems upset, Buddy points her to the contact button instead of telling her to phone someone
- [x] #9 An e2e test runs the flow against a fake channel
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add version-18 contact settings with safe defaults; strip phone numbers and Twilio fields from public config, protect them from generic config edits and settings restore, and expose dedicated caregiver-only settings/credential channels.
2. Connect TASK-33 to configured Twilio credentials and add launcher-only request/status APIs derived entirely from saved contacts. Preserve names/photos for active requests so settings changes cannot misidentify a notification.
3. Replace the reserved Home footer slot and unused HelpOverlay with a large clay callback button and truthful request status, including fallback and telephone guidance. Exclude these taps from confusion detection and block idle dimming while the flow is open.
4. Add an admin Contacts tab for preferred/fallback names, photos, SMS numbers, timing, and write-only provider credentials. Make Buddy point to the actual contact button when available, without sending from chat.
5. Verify config/IPC/privacy and UI status logic with unit tests; run built-app fake-channel e2e for settings, callback states, duplicate taps, fallback, failure and layout/font sizes. Inspect screenshots, run full tests/build/lint, and document remaining real-channel/device checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Channel fixed by accepted decision-02: ordinary Twilio SMS. Her-facing button copy is “Ask {name} to call,” never “Call {name}.” The recipient receives a normal text and needs no app or account. UI states map strictly to the main-process lifecycle: Sending; Request delivered (Twilio device-delivery status); {name} saw it (inbound reply from that configured phone after this request); trying fallback; or no request confirmed. A second configured SMS contact is the automatic fallback. If SMS cannot be sent or neither contact answers, direct her to the real telephone without implying anyone is coming. Twilio Account SID, API Key SID/secret, Messaging Service/sender, and contact phone numbers are caregiver-only data; secrets never reach a renderer or log.

Implemented version-18 contact setup (off by default), dedicated caregiver-window/main-frame gated settings and write-only credentials, public config/backup redaction, and generic-patch/restore protection. Connected TASK-33 to saved credentials and a launcher-only no-argument send API. Added names/photos to persisted request snapshots and prevent setup changes while a request guard is active. Home uses its existing 420x112 footer slot; status distinguishes delivery/YES, fallback, failure and expiry; contact taps bypass confusion detection and an open flow blocks idle dimming. Added Contacts admin tab and deterministic Buddy distress guidance with no send authority. Initial full unit suite passed 1200 tests; built-app flow and screenshots passed before final edge cases. Follow-up e2e run exposed a test race (Sending is shown before the disk/network send completes); send-count checks now wait for the observed side effect.

Final evidence: npm test passed 93 files / 1200 tests; npm run build passed both TypeScript projects and all bundles; npm run lint passed. Built-app Playwright passed all 17 selected checks across contact-family, contact-requests, Home preview, config backup and idle dimming. Contact UI checks prove real caregiver form/photo selection, no send on setup, same 420x112 footer footprint in both layouts/all five font sizes, distinct Sending/delivery/YES, duplicate suppression after reopening and Home reload, automatic fallback, late preferred YES, failure/expiry telephone guidance, missing-photo phone icon and wide 12-character name fit. No renderer page errors. Screenshots of populated Home and failure state at largest text size were visually inspected. Unit checks prove role/frame gates, write-only credentials, public/backup privacy, generic-patch/restore protection, contact identity snapshots, active-request settings guard and Buddy guidance without send authority. A temporary phone-redaction mutation failed its privacy test and was restored. Mechanical design check returned only advisories for the incumbent overlay backdrop and admin-specific colors/radius; the launcher uses existing theme tokens. Contact setup is excluded from backups and preserved on restore; the backup UI explains this. Live SMS proof and real-kiosk touch/sound verification remain TASK-17/manual checks; no live texts were sent. TASK-54 remains a separate caregiver test panel.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-10-14 17:18
---
The SeniorsUI comparison reinforces this task's truthful callback-request wording, fixed Home footprint and confirmed delivery/acknowledgement requirements. Existing decision-02 remains authoritative: this is an SMS request to call back, not live calling. TASK-54 supplies the repeatable caregiver verification after this flow is implemented.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented fixed Home Ask {name} to call with library photo and honest saved request states; added gated Contacts setup and write-only SMS credentials, snapshot identity/privacy protections, telephone fallback and Buddy button guidance. Verified with 1200 unit tests, 17 built-app e2e checks, build/typecheck, lint, screenshot inspection and a caught privacy mutation. Contact setup defaults off. Real Twilio delivery/YES proof and kiosk verification remain outstanding.
<!-- SECTION:FINAL_SUMMARY:END -->
