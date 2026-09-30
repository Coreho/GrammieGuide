---
id: TASK-30
title: Recover when the Home screen crashes or freezes
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-29 09:24'
updated_date: '2026-09-30 22:03'
labels: []
milestone: m-6
dependencies: []
priority: high
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The watchdog heartbeat is written by the main process every 15 seconds, whether or not the Home screen works, and `windows/windowManager.ts` has no handling for a crashed or unresponsive renderer. If Home crashes or hangs, the app still looks alive to the watchdog, and she is left with a blank or frozen screen and no way out. Found by Codex's plan review and confirmed in the code on 2026-09-29.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 If the Home screen crashes, it reloads by itself
- [x] #2 If the Home screen stops responding for a set time, it is reloaded
- [x] #3 A crash loop does not reload forever: after a few failed recoveries in a short time, the app restarts cleanly and the watchdog path takes over
- [x] #4 Each recovery is logged as a reliability event for the caregiver
- [x] #5 The recovery policy is pure logic with unit tests, and an e2e test crashes the Home renderer and sees it come back
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A pure recovery policy (unit tested with fake times): a crash or a hang of the Home renderer gets a reload, but a few recoveries inside a short window mean the app exits without the quit flag so the watchdog relaunches it with a natural back-off.
2. windowManager wires it up: `render-process-gone` on the launcher's webContents, and `unresponsive`/`responsive` on the window with a grace period before forcing a reload.
3. Before reloading Home, close the embedded browser, so a web page left over the fresh Home can't leave her without a Home button.
4. Each recovery, and the give-up exit, is logged with logReliabilityEvent.
5. E2E: crash the Home renderer with forcefullyCrashRenderer() and see Home come back.
Implementation delegated to Codex (new session, workspace-write in this worktree); Claude verifies.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by Codex (session 01a0f3b0-ae60-7222-9dbd-a0639366a379): pure policy in services/reliability/homeRecovery.ts (reload on a crash; on a hang, reload once 10 s pass without `responsive`; the 4th recovery within 5 minutes gives up), wired in windowManager.ts for the launcher window: render-process-gone (clean-exit ignored), unresponsive/responsive, closeEmbeddedBrowser() before every reload, a hang reload via forcefullyCrashRenderer() + reload(), and giving up stops the heartbeat and calls app.exit(1) without the quit flag so the watchdog relaunches after its stale-heartbeat delay. Every reload and the give-up go to logReliabilityEvent.
Claude's review changes: (1) the flag that ignores our own forced crash is now cleared by any render-process-gone and by did-finish-load; before, it was cleared only for reasons 'killed'/'crashed', and any other reason would have left hang detection off for the session. (2) The e2e spec's final check now asks the reloaded page from the main process, because Playwright's page handle dies with the crashed renderer (the recovery itself worked: new renderer pid, did-finish-load), and it looks for the empty-Home text instead of the text-size button, which is being removed from Home.
Verified by Claude on 2026-09-30: typecheck and lint clean, unit tests 20 files / 264 passed (9 new), build ok, the new crash spec passes, and the full e2e suite passes (23).
Open: the hang path and the give-up exit are covered by the unit tests of the policy only, not run end to end, so AC 2 and AC 3 are left unchecked. AC 4: the reliability log is in memory only, so the give-up entry is lost when the app exits; persisting it is outside this task (TASK-25 covers the dashboard). Not committed yet.

Greptile review of PR #12, fixed by Codex (gpt-6.1-sol, yolo, session 01a0f446-cdcc-7ed0-bc86-ba8dc5559b29) and reviewed by Claude: (1) the give-up is saved to home-recovery-gave-up.json in userData just before app.exit(1) and logged as home-recovery-gave-up on the next start, then deleted; missing or damaged files never block startup (10 unit tests). (2) e2e now covers a freeze (window emits unresponsive, Home reloads in a new renderer after the 10 s grace), a cancelled freeze (responsive within 0.5 s, same renderer after the grace) and the give-up (four crashes, exit code 1, no quit flag, record saved, restored into the admin reliability log after relaunch). The freeze test exposed a real bug: reloading right after forcefullyCrashRenderer() left Home crashed on Windows, so the reload now waits for render-process-gone. Claude added a 5 s backstop that reloads anyway if that report never comes. Codex ran typecheck, lint, unit (274), build and the 4 recovery e2e tests itself.
<!-- SECTION:NOTES:END -->
