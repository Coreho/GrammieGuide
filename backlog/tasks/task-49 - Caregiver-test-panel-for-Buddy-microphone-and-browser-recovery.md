---
id: TASK-49
title: 'Caregiver test panel for Buddy, microphone and browser recovery'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 17:17'
updated_date: '2026-10-15 02:34'
labels: []
milestone: m-11
dependencies: []
references:
  - TASK-25
  - src/renderer/admin/src/components/ReliabilityTab.tsx
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
priority: high
type: feature
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The caregiver can inspect separate settings and logs but lacks a repeatable way to confirm that the experience actually works on her device. The SeniorsUI 1.0.34 investigation showed that a test label can conceal an incomplete path, so results must distinguish observed success, caregiver-confirmed sound, failure and unavailable configuration. This task adds the initial local test panel; contact delivery tests are a separate follow-up so this panel can ship before Twilio setup. Coordinate with TASK-25's dashboard and Test sound requirement rather than creating competing health records.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Only an unlocked caregiver can start tests; privileged test requests are also authorized in main.
- [x] #2 The panel offers individually initiated Buddy voice, microphone recognition, connectivity and browser recovery checks; each reports checking, passed, failed or unavailable in plain language.
- [x] #3 Audio playback completion is distinguished from the caregiver confirming that sound was heard; a voice or microphone failure does not produce a successful result.
- [x] #4 Microphone and audio tests can be cancelled and leave no active recording or delayed speech after cancellation, panel close or admin lock; test phrase content is not logged.
- [x] #5 A browser recovery check verifies that the senior can return Home after a controlled page failure without navigating to an arbitrary supplied URL or leaving hidden media playing.
- [x] #6 Any displayed result includes when it was checked and does not imply a feature is working now solely because an earlier test passed; TASK-25 reuses the relevant audio confirmation.
- [x] #7 Targeted automated checks cover authorization, unavailable configuration, failures and cancellation; a documented real-device walkthrough covers audible voice, microphone and recovery.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared types and plain-language results (src/shared/checks/caregiverChecks.ts): check ids voice/microphone/connectivity/browserRecovery; statuses checking, played (voice only, waiting for the caregiver), passed, failed, unavailable, cancelled; every result carries checkedAt.
2. Main service (services/checks/caregiverChecks.ts) with injectable deps and in-memory results (reset on restart, never implies 'working now'):
   - Voice: main synthesizes with the configured Edge voice or tells admin to use the Windows voice; admin plays it under a buddyVoice audio hold and reports played/failed; heard/not heard are accepted only for the same run after 'played'. Last heard confirmation exported for TASK-25.
   - Microphone: one listenOnce through runPowerShell with a new AbortSignal option, under a main-owned 'listening' audio hold; cancel kills PowerShell. Heard words are returned to the panel only, never logged.
   - Connectivity: Windows online state plus Microsoft's connection-test address, with a timeout and captive-portal detection.
   - Browser recovery: refused while a page is open; asks Home to open a fixed refused local address (launcher-only channel, no URL from any caller), waits for the recovery screen state, then closes through closeEmbeddedBrowser and returns Home; verifies the page is closed.
3. Cancellation: checks:cancel from the panel (tab change/unmount), the sender window being destroyed, and a new onAdminLocked hook in adminAuth all cancel running checks.
4. IPC: checks:* handlers call requireAdminUnlocked() and recheck after every await; results pushed to admin with checks:changed. Launcher gets checks:recovery-start / browser:return-home events and browser:openRecoveryCheck.
5. Admin: new Checks tab with one button per check, status + time checked, heard/not-heard buttons, Stop.
6. Tests: unit tests for the service (authorization is IPC-level), voice transitions, cancellation, connectivity outcomes, recovery outcomes, shellExec signal; e2e for lock gating, connectivity offline, browser recovery and voice/mic availability.
7. Docs: CLAUDE.md/AGENTS.md section, README status, real-device walkthrough in notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the Checks tab (admin), services/checks/caregiverChecks.ts and ipc/checksIpc.ts as planned. Results are in memory only (TASK-25 owns the on-disk health record) and lastHeardSound() is the heard-sound confirmation TASK-25 should reuse. runPowerShell gained an AbortSignal option; adminAuth gained onAdminLocked(). Verified: typecheck, lint, npm test (909 passed), build, tests/e2e/caregiver-checks.spec.ts 5/5.

Real-device walkthrough (not yet performed): 1) Unlock admin, open Checks. 2) Buddy's voice: Check now; confirm the line plays from the kiosk speaker; answer I heard it (expect Passed) and repeat with the volume muted, answer I didn't hear it (expect Failed). Turn the online voice off in the Buddy tab and repeat to hear the Windows voice. 3) Microphone: Check now and say a short sentence within 8 seconds; expect Passed and the words shown once; repeat silently (expect Failed: didn't hear anything); start it again and press Stop, then confirm no powershell.exe remains in Task Manager. 4) Internet: Check now with Wi-Fi on (Passed) and with Wi-Fi off (Failed, not connected). 5) Getting back Home: with Home showing (move the admin window aside), Check now; Home briefly shows 'This page won't open right now' then returns Home; expect Passed. Open a web tile on Home first and run it again: expect Not available, and her page stays open. 6) Start the microphone check and press Lock: after unlocking, it shows Stopped.

Verification: npm test 909 passed; caregiver-checks.spec 5/5 (lock refusal in main, offline connectivity with time, recovery screen then Home, voice waits for the answer, lock cancels the microphone check); full suite 125 passed, 1 failed in buddy-actions.spec (pre-existing cold-launch race, also fails alone on the TASK-53 branch; fixed by TASK-51/PR #48). AC6: lastHeardSound() is exported for TASK-25 rather than a second record. Remaining before Done: the real-kiosk walkthrough above.
<!-- SECTION:NOTES:END -->
