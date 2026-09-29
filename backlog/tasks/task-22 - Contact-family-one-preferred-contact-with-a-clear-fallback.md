---
id: TASK-22
title: 'Contact family: one preferred contact with a clear fallback'
status: To Do
assignee: []
created_date: '2026-09-29 05:54'
updated_date: '2026-09-29 09:25'
labels: []
milestone: m-7
dependencies:
  - TASK-17
  - TASK-33
  - TASK-05
  - TASK-06
priority: high
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A familiar face and "Call Sarah" is more concrete than a generic Help button. Today she has no way to ask for help at all: the Help button was removed from Home in M3 (commit cb1f6e6), and the unused `HelpOverlay` still says "A caregiver has been notified" with no notification logic behind it. This task is what she sees and what the caregiver sets up, on the channel chosen in TASK-17. Delivery tracking (saved status, timeouts, late answers, expiry) was split out into TASK-33 after Codex's review. Honesty is the core requirement: "Request sent" only after confirmed delivery, and "answered" only when someone actually responds. The button's words must match what the channel really does: a request for a call back should not be labeled as a call. The contact photo comes from the media library (TASK-05, TASK-06), so this does not wait for the photo library. Start with one preferred contact and one fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Home shows a large contact button with the preferred contact's photo and name, always in the same place, worded to match what the chosen channel does
- [ ] #2 Tapping it shows a calm "Sending…" state; "Request sent" appears only after delivery is confirmed
- [ ] #3 A different, clear message appears only when the contact actually responds, never on delivery alone
- [ ] #4 If delivery fails, is unknown, or nobody responds in time, she sees plainly what happens next (the fallback contact, or what to do instead); nothing implies someone is coming
- [ ] #5 Repeated taps never send duplicate requests; they show the current request's status
- [ ] #6 No screen says someone was notified unless delivery was confirmed; the old "A caregiver has been notified" text is removed or shown only after confirmation
- [ ] #7 The caregiver sets the preferred and fallback contacts (name, photo, how to reach them) in admin; channel credentials are secrets, stripped from renderers and set through their own admin channel like the API key
- [ ] #8 When she seems upset, Buddy points her to the contact button instead of telling her to phone someone
- [ ] #9 An e2e test runs the flow against a fake channel
<!-- AC:END -->
