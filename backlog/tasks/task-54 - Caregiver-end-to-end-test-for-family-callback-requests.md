---
id: TASK-54
title: Caregiver end-to-end test for family callback requests
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 17:18'
updated_date: '2026-11-12 20:27'
labels: []
milestone: m-7
dependencies:
  - TASK-49
  - TASK-22
  - TASK-33
references:
  - decision-02
  - TASK-17
  - TASK-25
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
priority: high
type: feature
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The contact channel is already decided in decision-02: ordinary Twilio SMS asking a family member to call back, with a new YES reply as acknowledgement. TASK-17 covers the initial live channel proof; TASK-33 owns the persisted request lifecycle and TASK-22 owns the senior-facing flow. This follow-up gives the caregiver a repeatable in-app test after that work exists. The SeniorsUI investigation found contact buttons whose policy rejects every contact, so this check must exercise actual configured delivery and acknowledgement rather than a visual simulation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only an unlocked caregiver can start a clearly marked test request to a configured preferred or fallback contact; main enforces that authorization.
- [ ] #2 The test uses the existing request lifecycle and shows submission, device delivery and a matching new YES acknowledgement as distinct results; queued, sent, timed-out or unknown outcomes never mean delivered or seen.
- [ ] #3 The test clearly identifies that it is a test and keeps its state separate from a real pending senior request; repeated test taps cannot duplicate a request or disturb that real request.
- [ ] #4 Failure, offline operation, missing configuration, expiry and fallback are reported plainly; no result implies someone is coming or a live kiosk call was placed.
- [ ] #5 Late, stale and duplicate acknowledgements, restart and uncertain submission follow the same persisted behavior as ordinary requests; leaving the panel does not silently resend.
- [ ] #6 Results include the check time and outcome without logging credentials, message bodies or phone numbers; the caregiver dashboard distinguishes test outcomes from genuine help-request failures.
- [ ] #7 Automated checks exercise delivery, acknowledgement, failure and restart with a fake channel; a caregiver-initiated real-channel check and its observed result are documented once setup is available.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lifecycle: a settled test (answered/failed) no longer holds the tap guard; an open test never blocks her real request, and real requests claim YES replies first. A 4xx from Twilio on submit is a definite refusal (failed), not unknown.
2. ContactController.startTest/testState: caregiver picks the first or second person; one text, purpose test, 5 min window; refused while a real request or another test is open.
3. IPC contacts:testState / contacts:startTest behind requireCaregiver; content-free contact-test-* activity events.
4. Admin Contacts: 'Test a callback text' panel showing sent, delivered and YES reply as separate lines with check time; wording from a pure shared helper.
5. Unit tests (lifecycle, controller, IPC gate, wording) and an e2e run with the fixture channel.
6. Real-channel check is the owner's: enter credentials, run the test, record the result (also closes TASK-17 AC4).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-12: Built the caregiver test (admin > Contacts > Test a callback text) on the existing lifecycle. ContactController.startTest/testState, IPC contacts:testState/startTest behind the caregiver-window gate, pure wording in shared/contactTest.ts. Lifecycle changes: Twilio 4xx on submit is failed (definite), settled tests release the tap guard, an open test never refuses her real request and real requests claim a YES first. Verified: npm test 1635 passed, lint clean, e2e contact-test (4), contact-family (6) and contact-requests (1) passed with the fake channel. Still open: the dashboard half of AC6 (TASK-25 not built; summaries carry purpose) and the real-channel check in AC7, which needs the owner to enter Twilio credentials in admin.
<!-- SECTION:NOTES:END -->
