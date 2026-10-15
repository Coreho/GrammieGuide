---
id: TASK-51
title: Buddy navigation to saved Home tiles by spoken or typed name
status: In Progress
assignee:
  - '@codex'
  - '@claude'
created_date: '2026-10-14 17:17'
updated_date: '2026-10-15 02:34'
labels: []
milestone: m-9
dependencies:
  - TASK-23
references:
  - TASK-23
  - src/shared/buddy/actions.ts
  - src/main/services/ai/buddyChatService.ts
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
priority: medium
type: feature
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buddy already handles music, pictures and Home through TASK-23. SeniorsUI demonstrates useful spoken tile navigation, but GrammieGuide should extend the existing deliberate Talk interaction rather than require exact phrases or continuous listening. The added outcome is opening an unambiguous caregiver-saved Home tile by its current name, with equivalent typed input and ordinary touch navigation available.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With Buddy chat enabled, common spoken and typed requests open an unambiguous visible saved tile by its current caregiver-defined name, alongside the existing music, pictures and Home actions.
- [x] #2 Explicit saved-tile requests work without an AI key or network beyond whatever the destination itself requires; removed, hidden or unavailable tiles receive calm wording.
- [x] #3 Main validates the requested tile/action against current saved configuration; input or model output cannot supply arbitrary URLs, executable paths or unknown actions.
- [x] #4 Ambiguous names do not silently choose a tile; she receives a simple clarification or visible choices without changing the stable Home layout.
- [x] #5 Navigation success is acknowledged only after the requested opening succeeds; failures never produce a claim that it opened.
- [x] #6 Recognition remains deliberately initiated through the existing Talk interaction and stops on close/cancel; disabling chat removes this entry path and no always-listening mode is introduced.
- [x] #7 Tests cover spoken/typed wiring, renamed/removed/hidden tiles, ambiguity, failed opening and arbitrary-target rejection; the real-device recognition check is documented.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing Buddy action contract with strict saved tile requests and ID-only plans, using the Home visibility helper for main validation and ambiguity. 2. Resolve whole tile requests before the key/network check and expose a fixed model tool without changing the frozen prompt. 3. Execute plans through the same App tile-opening path as taps, revalidate current tiles, and confirm only successful opens. 4. Add unit and focused Electron coverage, update matching Buddy chat guidance, and record an unperformed real-device walkthrough. 5. Run typecheck, lint, all unit tests, build, and only the buddy-actions Electron spec; leave task status, criteria, summary and git history to the coordinator.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Extended the existing Buddy action path with strict name requests, ID-only plans, current-layout validation and in-chat ambiguity choices. Added renderer revalidation and shared tap/Buddy tile activation. Web tile confirmation now waits for loading; recognition cancellation uses the existing injected PowerShell runner without editing speech services. AGENTS.md was absent and is gitignored; it will be created locally from CLAUDE.md with matching guidance.

Real-device recognition walkthrough (documented only; NOT performed): Enable Buddy chat, remove the AI key, and save visible tiles named Family Albums and Local Paper. Open chat and tap Talk, then say 'Open Family Albums', 'Go to Local Paper', and 'Show me Family Albums', returning Home between requests. The matching saved destination should open, with confirmation only on success; a website may still need network access. Save two tiles with the same label, say 'Open <that label>', and verify large position-labelled choices appear without moving Home tiles; tap the intended choice. Rename, remove or overflow a tile and repeat its old name; expect calm unavailable wording. Start Talk then close chat: the microphone process should stop and a late phrase must not navigate. Disable chat and confirm no chat invitation/menu entry or listening entry remains. This hardware/microphone walkthrough still needs coordinator verification.

Verification progress: typecheck passed; the full unit suite passed (67 files, 915 tests). Lint initially found four missing return annotations in new test helpers; these were fixed and lint now passes. Build passed with dependency annotation warnings. Running only tests/e2e/buddy-actions.spec.ts, including offline typed navigation, duplicate-name choices, spoken routing, delayed web success and web failure.

Focused Electron run: offline typed saved-tile navigation and duplicate-name choices passed. The web-delay test exposed a previous action's success toast remaining visible during a new pending open; new actions now clear stale confirmations. Updated the test to assert absence of success even when no toast exists. Also rechecked native-app visibility at its final saved-ID launch boundary. Re-running required checks and the same focused spec.

Codex stopped at its usage limit during the final e2e rerun; Claude finished it. Fixes after review: (1) taps keep their old path (browser:open, the 'Opening …' toast, and Home's recovery screen on a failed load); only Buddy uses ID-only browser:openTile. (2) openUrlAndWait now returns loaded/failed/pending/refused: a failed load keeps the recovery screen, a slow page (20s) or a replaced load (ERR_ABORTED) gets no claim either way. (3) An explicit 'open/go to/show me …' that names no saved tile at all goes on to chat when a key exists (so 'show me how to make tea' is answered), and gets the calm unavailable reply without a key; a saved-but-hidden tile is always answered as unavailable. (4) Names ignore a leading the/my/a. Verified: typecheck, lint, npm test 922 passed, build, buddy-actions.spec 6/6 and page-recovery.spec 4/4.

Verification: npm test 922 passed; full e2e suite 126 passed (buddy-actions.spec covers offline typed opening, stubbed spoken routing, duplicate-name choices, arbitrary targets, web success only after load and failure without a claim). Remaining before Done: the spoken walkthrough on the kiosk's microphone above.
<!-- SECTION:NOTES:END -->
