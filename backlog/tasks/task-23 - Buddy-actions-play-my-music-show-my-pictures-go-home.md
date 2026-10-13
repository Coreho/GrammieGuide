---
id: TASK-23
title: 'Buddy actions: play my music, show my pictures, go home'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 05:54'
updated_date: '2026-10-13 06:47'
labels: []
milestone: m-9
dependencies:
  - TASK-37
  - TASK-18
priority: medium
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buddy can chat but cannot do anything. A small, fixed set of explicit actions would make him more useful: "play my music", "show my pictures", "go home". Each action also needs a visible button, because speech recognition may not catch her words and she should never have to phrase a request just right. The model must not be able to invent actions or claim it did something it did not.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In chat, Buddy can play her music, show her pictures and go Home, and nothing else
- [x] #2 Each action also appears as a large visible button in the chat panel
- [x] #3 Spoken and typed requests both work
- [x] #4 Actions come from a fixed list validated in main, and Buddy never says an action happened unless it did
- [x] #5 If music or photos are not set up yet, Buddy says so kindly and does not pretend
- [x] #6 Unit tests cover action validation, and an e2e test asks for music and sees it start
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define three validated actions and conservative explicit typed/spoken intents in main, without giving the model arbitrary tools or changing the frozen prompt. 2. Resolve only saved playable playlists and visible photos; return calm unavailable responses and no success claim before the renderer completes the action. 3. Add large chat buttons and route both input methods through the same action path; close chat for playback/view navigation, reporting only confirmed results. 4. Verify action validation, unavailable/disabled/sender boundaries, actual generated-audio playback and photo/Home navigation in Electron, plus existing chat/music regressions.

General phrasing can propose only the same three fixed tools through the existing chat provider; explicit common requests resolve locally first so these controls also work offline. Ignore model success text when an action is proposed and show a fixed confirmation only after the real player/view completes it. Keep the frozen system prompt unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented three main-validated Buddy actions with large chat buttons. Direct typed/spoken requests resolve locally without a key/network; more general wording may propose one known empty-input tool, with accompanying model text discarded. Main chooses the first saved playlist with an existing song or visible existing photo; arbitrary and multiple tool requests are refused. Music confirmation waits for the actual current media play attempt, and an older refresh cannot undo Stop or a newer choice. Both races reproduced red before fixing and pass with a mock that clears paused at play invocation as Chromium does. Verification: 871 unit tests, lint, typecheck and build pass; 17 action/provider/music Electron checks passed, then 11 action/music checks passed after the race fixes. Existing chat-off and no-key/write-only-key/rejected-key flows pass. The full nine-test handoff suite passed on rerun with unchanged product code; accelerated timing checks had intermittent failures in broader runs, documented rather than weakened. Action buttons fit all five text sizes and screenshot inspected. Actual generated WAV and approved PNG are used; speech recognition transport is stubbed, not the main action path. Mutation removing tool-input rejection fails its regression. Frozen prompt unchanged; no dependency or schema change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Buddy can play local music, show approved photos and go Home through fixed validated requests and large buttons. Tested offline playback, spoken input wiring, missing media, arbitrary-tool rejection, real playback confirmation and Stop races; 871 unit tests and targeted Electron regressions pass.
<!-- SECTION:FINAL_SUMMARY:END -->
