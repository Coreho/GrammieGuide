---
id: TASK-33
title: 'Contact requests: delivery lifecycle and saved status'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 09:24'
updated_date: '2026-10-23 11:39'
labels: []
milestone: m-7
dependencies:
  - TASK-17
references:
  - decision-02
  - TASK-54
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
priority: high
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from TASK-22 after Codex's review. Stopping duplicate taps is not enough: an honest "Request sent" needs a request lifecycle that survives the app restarting mid-request, timeouts where delivery is unknown, late answers after the fallback contact was tried, and expiry. This task is the main-process side; TASK-22 is what she sees and what the caregiver sets up.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each request gets an id, and its status (sending, delivered, answered, failed, expired, unknown) is saved to disk at every step, so a restart mid-request resumes or reports it honestly
- [x] #2 A timeout where delivery is not confirmed is reported as unknown, never as sent
- [x] #3 A request still saved as sending after a restart is never sent again blindly: the app first asks the channel whether it arrived, or re-sends under the same request id so the channel drops the repeat. If the channel chosen in TASK-17 can do neither, the request becomes unknown and is not re-sent on its own, so the family is never notified twice
- [x] #4 An answer that arrives after the request moved to the fallback contact is shown correctly and not lost
- [x] #5 Requests expire after a caregiver-set time, and it is clearly defined when she can send a new one
- [x] #6 Every request outcome is available to the caregiver dashboard
- [x] #7 Unit tests cover the lifecycle, including restart, the app stopping after the channel accepted a request but before the result was saved, unknown delivery and late-answer cases
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Implement a serialized main-process request service and atomic validated disk journal, with tests proving duplicate suppression and restart/uncertain-submission safety.
2. Add delivery polling, YES acknowledgement correlation, automatic fallback, caregiver-supplied expiry and separate test requests; cover failures, late replies and persistence faults with a fake channel.
3. Implement a bounded Twilio REST channel from current documentation and expose redacted saved outcomes through admin-gated IPC for TASK-25. Contact setup and Home UI remain TASK-22; live channel proof remains TASK-17.
4. Run focused tests, full unit tests, typecheck/build and lint; document integration and remaining live-test dependency.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Channel fixed by accepted decision-02: Twilio SMS using REST polling so the kiosk needs no publicly reachable webhook. Persist the Twilio outbound Message SID with the local request before treating submission as complete; poll that resource for queued/sent/delivered/undelivered/failed. Poll inbound Messages filtered by the Twilio number and configured contact number, and accept an acknowledgement only when it is newer than the request and its normalized body is the allowed confirmation (initially YES). Device delivery and human acknowledgement are distinct states. Store enough cursors/SIDs to survive restart, reject stale or duplicate replies, preserve late replies after fallback, and never resend merely because the local save outcome is uncertain. Use a restricted Twilio API key for production rather than the main Auth Token; all credentials stay main-process-only and are redacted from logs.

Implemented serialized lifecycle, durable pre-send intents and atomic validated journal, Twilio REST adapter with no POST retries, delivery/YES distinction, timed fallback, expiry, separate test requests and redacted admin history IPC. Startup resumes polling. Contact setup will supply the main-only credential getter in TASK-22; no live SMS has been sent and TASK-17 remains open. Initial full unit suite: 89 files / 1177 tests passed. Review tightened persistence so unchanged polls do not rewrite the journal and each distinct delivery/acknowledgement observation is saved separately.

Final validation: npm test passed 89 files / 1180 tests; npm run build passed both TypeScript projects and all Electron bundles; npm run lint passed. New built-app Playwright restart/admin-IPC test passed (1/1). A wrong-phone acknowledgement mutation was detected by the rejection test, and source restored. AC evidence: lifecycle and disk tests cover durable states/restart/unknown submission (1-3,7); late preferred YES after fallback and persisted reply SID tests cover late answers (4); expiry boundary and repeated-tap tests prove configured expiry/new-request rules (5); actual Electron preload/IPC test and unit gate test prove redacted admin history access for the future dashboard (6). The service accepts caregiver-derived expiry options; its setup form belongs to TASK-22. Retains latest 1000 outcomes, evicting expired guards only. Plain YES cannot distinguish intended old-vs-new request after expiry; this protocol limitation is documented. TASK-17 remains open for live vendor proof, and TASK-22 must supply the main-only credential getter and Home/admin setup UI.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-10-14 17:18
---
TASK-54 reuses this lifecycle for a separate caregiver test request. Coordinate test-vs-real status and deduplication without weakening restart, unknown-delivery, late-reply or expiry behavior.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the TASK-33 main-process callback lifecycle: durable pre-send intents, no automatic replay of uncertain sends, Twilio delivery and inbound YES polling, saved fallback/late replies, configurable expiry, test isolation, atomic fail-closed storage and private admin history access. Verified with 1180 unit tests, build/typecheck, lint, one real Electron IPC/restart e2e and a detected wrong-phone mutation. Live SMS proof and caregiver/Home setup remain TASK-17 and TASK-22.
<!-- SECTION:FINAL_SUMMARY:END -->
