---
id: TASK-44
title: Clean up abandoned ad-blocker cache writes
status: Done
assignee:
  - '@codex'
created_date: '2026-10-12 13:51'
updated_date: '2026-10-12 13:56'
labels: []
dependencies: []
references:
  - 'https://github.com/Coreho/GrammieGuide/pull/35#discussion_r4245939814'
priority: low
type: bug
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #35 review identified adblocker-engine.bin.tmp left behind when a cache write is interrupted before rename. Offline restarts read the saved engine without removing this leftover.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Startup removes only the abandoned adblocker-engine.bin.tmp and preserves the saved engine and unrelated files
- [x] #2 A failed cache write or rename removes its temporary file while preserving the previous saved engine
- [x] #3 Cleanup failures cannot prevent startup or disable the running blocker
- [x] #4 Regression tests demonstrate the reported failure and pass with the fix
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce interrupted writes with real files and mocked Electron/blocker boundaries. 2. Sweep the exact temp file before cache startup and clean up failed writes without affecting blocking. 3. Run focused and full unit tests, lint, build, and the ad-blocker end-to-end specs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reviewed all four open PRs (#26, #33, #34, #35); this was the only reported defect. The fixed temp filename is overwritten by a later successful save, so the review claim that it is orphaned forever was too strong, but offline starts left it behind. Startup now unlinks only the exact app-owned temp path, and failed writes clean up while retaining the original error. Directory lookalikes are never recursively removed; cleanup failure cannot stop blocking. Regression proof: four of eight focused unit cases failed before the fix. Verification: all 698 unit tests pass, lint and formatting pass, typecheck and production build pass, and both ad-blocker E2E specs pass 9/9 including a seeded abandoned file on offline relaunch.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the abandoned ad-blocker cache file reported on PR #35. Startup and failed writes clean up the exact temp file without changing the saved engine or interrupting blocking. Added eight unit cases and extended the relaunch E2E test. Verified 698 unit tests, lint, typecheck, build, formatting, and 9 ad-blocker E2E tests.
<!-- SECTION:FINAL_SUMMARY:END -->
