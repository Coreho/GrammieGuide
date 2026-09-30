---
id: TASK-15
title: Buddy interaction and motion settings
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 05:53'
updated_date: '2026-09-30 22:38'
labels: []
milestone: m-9
dependencies: []
priority: high
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tapping Buddy plays a reaction and offers a Let's chat button, so chatting takes two taps; for some people one tap straight to chat is simpler. He also roams the footer and fidgets. More animation is not automatically better: it can delight her or pull her away from what she was doing, so the caregiver should choose based on watching her. Roaming on/off already exists (`buddy.roaming`); the caregiver-only menu on Ctrl+Shift+B stays as is.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The caregiver chooses what her tap does: open chat directly, or play a reaction with the Let's chat button (today's behavior)
- [x] #2 The caregiver chooses a motion mode: stays put, walks now and then (today's roaming), or reduced motion
- [x] #3 Reduced motion keeps him in place with fewer, gentler gestures and no unprompted fidgets
- [x] #4 Changes apply on Home immediately without a restart
- [x] #5 A config migration maps the current roaming setting onto the new motion mode
- [x] #6 Unit tests cover the behavior machine in each motion mode
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Config: replace `buddy.roaming` with `buddy.motion` ('still' | 'roam' | 'reduced') and add `buddy.tapAction` ('reaction' | 'chat'); migration 006 maps roaming true to 'roam' and false to 'still', and defaults tapAction to 'reaction' (today's behavior).
2. Behavior machine: 'still' never strolls; 'roam' is today's behavior; 'reduced' stays in place with fewer, gentler gestures and no unprompted fidgets. Deliberate caregiver commands keep working in every mode.
3. Home: a tap opens chat directly when tapAction is 'chat'; otherwise today's reaction plus the Let's chat button. Settings apply live through config:changed.
4. Admin Buddy tab: two plain choices replacing the roaming checkbox.
5. Tests: machine unit tests per motion mode, migration test, e2e for tap-to-chat and a live mode change.
Delegated to Codex (gpt-6-astra, yolo); Claude verifies.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by Codex (gpt-6-astra, yolo, session 01a0f459-b3c9-7d12-8508-e2df808a3ad2): buddy.roaming replaced by buddy.motion (still, roam, reduced) and buddy.tapAction (reaction, chat); schema 6 with migration 006 (roaming false becomes still, anything else roam, saved values win). Machine: strolls only in roam; reduced has no unprompted fidgets, gestures idle_calm/wave/listen/talk/heart, one gesture per reply, no walk to the chat spot; switching away from roam stops him at his rendered position; caregiver commands (including walk) work in every mode. Tap reactions in reduced mode are waves and hearts. Tap-to-chat opens chat directly, still excluded from confusion detection. Admin Buddy tab has two plain selects. Reviewed by Claude with no changes needed. Verified: typecheck, lint, unit 302, build, full e2e 27 passed (m4-buddy-presence covers one-tap chat and live motion changes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The caregiver now chooses what her tap on Buddy does (reaction with Lets chat, or chat right away) and how he moves (stays put, walks now and then, or reduced motion with fewer, gentler gestures), applied live; migration 006 carries over the old roaming setting. Verified with machine unit tests for each mode, migration tests and e2e.
<!-- SECTION:FINAL_SUMMARY:END -->
