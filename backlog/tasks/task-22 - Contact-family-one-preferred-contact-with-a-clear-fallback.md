---
id: TASK-22
title: 'Contact family: one preferred contact with a clear fallback'
status: To Do
assignee: []
created_date: '2026-09-29 05:54'
labels: []
milestone: m-7
dependencies:
  - TASK-17
  - TASK-07
priority: high
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A familiar face and "Call Sarah" is more concrete than a generic Help button. Today she has no way to ask for help at all: the Help button was removed from Home in M3 (commit cb1f6e6), and the unused `HelpOverlay` still says "A caregiver has been notified" with no notification logic behind it. This task builds the real flow on the channel chosen in TASK-17. Honesty is the core requirement: "Request sent" only after confirmed delivery, and "answered" only when someone actually responds. Start with one preferred contact and one fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Home shows a large contact button with the preferred contact's photo and name (for example "Call Sarah"), always in the same place
- [ ] #2 Tapping it sends a request and shows a calm "Sending…" state; "Request sent" appears only after the channel confirms delivery
- [ ] #3 A different, clear message appears only when the contact actually responds, never on delivery alone
- [ ] #4 If delivery fails, or nobody responds within a caregiver-set time, the request goes to the fallback contact, or she is told plainly what to do instead; nothing implies someone is coming
- [ ] #5 With no internet she is told plainly the request could not be sent, and it is recorded as failed
- [ ] #6 Repeated taps never send duplicate requests; they show the current request's status
- [ ] #7 No screen says someone was notified unless delivery was confirmed; the old "A caregiver has been notified" text is removed or shown only after confirmation
- [ ] #8 The caregiver sets the preferred and fallback contacts (name, photo, how to reach them) in admin; channel credentials are secrets, stripped from renderers and set through their own admin channel like the API key
- [ ] #9 When she seems upset, Buddy points her to the contact button instead of telling her to phone someone
- [ ] #10 Every request, delivery result and response is logged with its outcome, and failed requests are available to the caregiver dashboard
- [ ] #11 Unit tests cover the request status logic, and an e2e test runs the flow against a fake channel
<!-- AC:END -->
