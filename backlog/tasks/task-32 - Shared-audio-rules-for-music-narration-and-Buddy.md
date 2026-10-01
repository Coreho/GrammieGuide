---
id: TASK-32
title: 'Shared audio rules for music, narration and Buddy'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 09:24'
updated_date: '2026-10-01 18:52'
labels: []
milestone: m-8
dependencies: []
priority: medium
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Music, photo narration, Buddy's voice, his listening, and web pages can all make sound or use the microphone. Without one shared rule they talk over each other, and the planned music Stop lives on Home, hidden while a web page is open. Decide and build the rule before the music player and narration are built on top of it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One shared rule decides what happens when sounds overlap, for example music pauses or lowers while narration or Buddy speaks and resumes afterwards
- [x] #2 Music pauses while Buddy is listening, so the microphone does not pick it up
- [x] #3 The rule covers sound from web pages too: when a page in the embedded browser starts playing sound, music pauses, and it resumes once the page has gone quiet or is closed. Page sound never plays over Buddy's voice or while he is listening
- [x] #4 She can stop music from any screen, including while a web page is open
- [x] #5 The rule is pure logic with unit tests, including a web page's sound starting and stopping
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Decide the rule: everything that needs her ears or the microphone 'holds' music. Listening, narration, a chat with Buddy and an audible web page pause it; Buddy's voice outside chat lowers it. Music gets quieter at once but only comes back after a short quiet gap (RESUME_DELAY_MS), so back-and-forth doesn't pump it. Her own Pause/Stop always win; Stop works in every state and the Stop control shows on every screen while music is on.
2. Voices: one at a time (newest wins), and listening silences voices and refuses new ones, so the mic never hears him or a narration. Web page sound is muted while any voice plays or he is listening.
3. Build it as pure logic in src/shared/audio/audioPolicy.ts (state + audioStep(event, now) + decideAudio(state, now)), usable from main or the launcher.
4. Write tests/unit/audioPolicy.test.ts first (each AC, page sound starting/stopping/closing, stop from any state), watch them fail, then implement.
5. Document the rule briefly in CLAUDE.md for TASK-36/37/23; wiring into a player is left to those tasks.
6. Run lint, typecheck, unit tests and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: listening, narration, an open chat and an audible web page pause music; Buddy's voice outside a chat lowers it to 0.25 (about -12 dB). Narration pauses rather than lowers because every word of a family recording matters; a whole chat pauses music because a chat alternates listening, thinking and talking, and per-turn holds made music stop and start (thinking can outlast any short delay). Music gets quieter at once but only comes back RESUME_DELAY_MS (2s) after the hold ends. One voice at a time (newest wins); listening silences voices and refuses new ones; page sound is muted while a voice plays or he listens. Her Pause and Stop win; a fresh Play skips a pending resume delay.

API (src/shared/audio/audioPolicy.ts): audioStep(state, event, now) -> { state, stop: ids of voices to stop now }; decideAudio(state, now) -> { music: off|paused|held|lowered|playing, musicVolume, showStopMusic, muteWebPage, changesAt }. Callers give every sound a unique id; a late end for a cut-off id is ignored. Not wired into the app yet: no music player or narration exists. TASK-37 should own the coordinator, feed web page sound from WebContents 'audio-state-changed' (start on audible, end on quiet or close), apply muteWebPage with setAudioMuted, and render a music Stop in the browser NavBar whenever showStopMusic is true. TASK-36 reports narration; Buddy speech and listening report from speech.ts and BuddyChatPanel.

AC #4 is met at the rule level: Stop is accepted in every state (playing, lowered, held by a page, narration, listening or chat, paused) and never comes back by itself, and showStopMusic does not depend on the screen. The visible nav-bar Stop is TASK-37's to draw from showStopMusic.

Validation: tests/unit/audioPolicy.test.ts (36 tests) written first and seen failing (29 of 34 at that point) against a stub; now npm test 304 passed, npm run lint clean, npm run typecheck clean, npm run build ok. E2E not run (not possible unattended here, and there is nothing wired to drive yet).

Review follow-up: AC #4 is met in the rule (Stop is accepted in every audio state and showStopMusic depends on no screen; tests/unit/audioPolicy.test.ts, now labelled by audio state rather than screen). Its visible half, a music Stop in the browser nav bar while showStopMusic is true with an e2e test, is now TASK-37 AC #13, alongside the Stop on Home's chip (AC #3). The WebContents half of AC #3 is TASK-37 AC #11 (audio-state-changed feeds webPage start/end) and AC #12 (muteWebPage applied with setAudioMuted), with unit tests in AC #14; music and Buddy's voice, listening and chat going through audioPolicy are AC #9 and #10. CLAUDE.md's Audio rules section points there.

Review follow-up validation: npm run lint clean, npm run typecheck clean, npm test 304 passed (the 8 Stop-in-every-state tests among them), npm run build ok. E2E not run (not possible unattended here; the nav-bar Stop it would drive is TASK-37 AC #13).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the shared audio rule as pure logic in src/shared/audio/audioPolicy.ts: music gives way to listening, narration, a chat and web page sound (paused) and to Buddy's voice (lowered), comes back 2s after the hold ends, voices take turns and stay silent while he listens, page sound is muted under any voice or while he listens, and her Pause and Stop always win, with Stop offered in every audio state. Verified with 36 unit tests covering each criterion, including a web page's sound starting, stopping and closing, plus the full unit suite, lint, typecheck and build. Nothing plays music yet, so the wiring is tracked as acceptance criteria on TASK-37: #9-#10 route music and Buddy through the rule, #11-#12 feed page audio-state-changed in and apply muteWebPage with setAudioMuted, #13 draws the nav-bar music Stop with an e2e test, and #14 unit-tests the page wiring.
<!-- SECTION:FINAL_SUMMARY:END -->
