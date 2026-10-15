---
id: TASK-54
title: Caregiver end-to-end test for family callback requests
status: To Do
assignee: []
created_date: '2026-10-14 17:18'
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
