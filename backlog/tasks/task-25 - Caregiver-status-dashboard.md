---
id: TASK-25
title: Caregiver status dashboard
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 05:55'
updated_date: '2026-11-15 03:02'
labels: []
milestone: m-11
dependencies:
  - TASK-33
references:
  - TASK-49
  - TASK-54
priority: medium
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The caregiver has Reliability and Activity tabs, but no at-a-glance answer to "is it working?". The activity log is kept in memory only (the last 1000 events) and is lost on restart, so startup and crash history need a small record saved to disk. Report facts only: never present inactivity or repeated taps as distress or an emergency.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A dashboard shows whether the device is online and since when, the last successful startup, crashes or watchdog restarts in the last 7 days, and failed help requests
- [x] #2 Audio is checked with a Test sound button that the caregiver confirms they heard; the dashboard shows when that was last confirmed
- [x] #3 Crashes are told apart from power loss and deliberate quits
- [x] #4 This health record survives restarts and has a fixed maximum size on disk
- [x] #5 Wording reports what happened and never describes inactivity or repeated taps as distress
- [x] #6 The dashboard is admin-only
- [x] #7 Tests cover the health record: saving, the size limit and crash counting
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure shared/health/healthRecord.ts: runs (startedAt, homeReadyAt, ending), bounded to 30 days and 200 runs; beginRun classifies an unended previous run as power-loss (Windows booted after its last heartbeat) or stopped-unexpectedly; endings quit / closed / windows-session-end / home-gave-up; summarizeHealth for the last 7 days; parseSafetyLog for the watchdog's safety-events.log.
2. services/health/healthStore.ts: userData/health-record.json, atomic sync writes, 256 KB read cap, a damaged file set aside as health-record.corrupt.json; reads the previous heartbeat.txt before startHeartbeat overwrites it; trims safety-events.log to its last 200 lines when over 64 KB.
3. Hooks: start in index.ts before the heartbeat; Home did-finish-load marks a successful startup; Ctrl+Shift+Q = quit, Home recovery give-up = home-gave-up, launcher session-end = windows-session-end, before-quit = closed (first ending wins).
4. Network: kioskServices tracks online and since when from the existing 10s check.
5. Sound: caregiverChecks gets onSoundHeard, persisted in the record (reuses TASK-49's check, no competing record).
6. health:get (requireAdminUnlocked) + admin Status tab: internet, startups, 7-day counts, failed real help requests (tests excluded), last confirmed sound plus a Test sound button reusing the Checks voice check. Factual wording only.
7. Unit tests (record, store, size cap, crash counting) and an e2e that seeds an unended run, a watchdog relaunch and checks the tab and the admin gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned. Also fixed a TASK-49 bug the new e2e found: the voice check's windowsVoicesReady took Chromium's first, empty voiceschanged as 'no voices', so Test sound reported 'No voice is available' when clicked soon after admin opened (57 ms, never waited); it now waits for a non-empty list or 5 s. The network check now also runs once at startup so the Status tab isn't blank for 10 s. Unit: 1659 passed; lint/typecheck clean; status-dashboard + caregiver-checks e2e 18/18 twice.

Full e2e on 66a270f: 245 passed, 1 skipped, 1 failed (contact-test.spec.ts 'one test text...', the known activity-log race fixed by #75's expect.poll; this branch is from main without #75), 2 did not run (the rest of that serial file). PR #76.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-10-14 17:18
---
TASK-49 adds the initial caregiver test panel without waiting for contact delivery. Coordinate its heard-sound confirmation with this dashboard's existing Test sound AC rather than creating competing health records. TASK-54 adds contact testing once the SMS request lifecycle and Home flow are ready; test failures must remain distinct from real help-request failures.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added admin's Status tab: internet state, start and last successful startup, 7-day counts of unexpected stops, watchdog restarts, power loss, Windows shutdowns, deliberate closes and failed real help requests, and a Test sound counted only after 'I heard it'. Backed by a saved health record (30 days, 200 runs, 256 KB cap, atomic writes, damaged file set aside); unended runs are classified at next start by boot time vs last heartbeat. health:get is admin-only. Also fixed the voice check giving up on Chromium's first empty voiceschanged. Verified: 1659 unit tests, typecheck/lint, status-dashboard + checks e2e 18/18 twice, full e2e 245 passed (the one failure is the known contact-test race fixed in #75), crc review on 66a270f with no findings. PR #76.
<!-- SECTION:FINAL_SUMMARY:END -->
