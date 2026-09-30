---
id: TASK-33
title: 'Contact requests: delivery lifecycle and saved status'
status: To Do
assignee: []
created_date: '2026-09-29 09:24'
updated_date: '2026-09-30 15:26'
labels: []
milestone: m-7
dependencies:
  - TASK-17
priority: high
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from TASK-22 after Codex's review. Stopping duplicate taps is not enough: an honest "Request sent" needs a request lifecycle that survives the app restarting mid-request, timeouts where delivery is unknown, late answers after the fallback contact was tried, and expiry. This task is the main-process side; TASK-22 is what she sees and what the caregiver sets up.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each request gets an id, and its status (sending, delivered, answered, failed, expired, unknown) is saved to disk at every step, so a restart mid-request resumes or reports it honestly
- [ ] #2 A timeout where delivery is not confirmed is reported as unknown, never as sent
- [ ] #3 A request still saved as sending after a restart is never sent again blindly: the app first asks the channel whether it arrived, or re-sends under the same request id so the channel drops the repeat. If the channel chosen in TASK-17 can do neither, the request becomes unknown and is not re-sent on its own, so the family is never notified twice
- [ ] #4 An answer that arrives after the request moved to the fallback contact is shown correctly and not lost
- [ ] #5 Requests expire after a caregiver-set time, and it is clearly defined when she can send a new one
- [ ] #6 Every request outcome is available to the caregiver dashboard
- [ ] #7 Unit tests cover the lifecycle, including restart, the app stopping after the channel accepted a request but before the result was saved, unknown delivery and late-answer cases
<!-- AC:END -->
