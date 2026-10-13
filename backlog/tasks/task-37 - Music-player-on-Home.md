---
id: TASK-37
title: Music player on Home
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 09:25'
updated_date: '2026-10-13 06:24'
labels: []
milestone: m-8
dependencies:
  - TASK-09
  - TASK-32
references:
  - src/shared/audio/audioPolicy.ts
priority: medium
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from TASK-09 after Codex's review: TASK-09 is now the caregiver's library and playlists, and this is what she uses. She should be able to play familiar music in two taps, keep it playing while she uses the rest of the screen, and always have an obvious way to stop it. Local files only, so it works offline. The spec's z-layer values clash with existing ones (`newsOverlay` is 210), so pick new ones in `zLayers.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Music built-in tile opens the playlist cards (up to 6), with a large play/pause and a large, obvious Stop on the same screen; next track is secondary
- [x] #2 Tapping the card already playing does nothing
- [x] #3 Music keeps playing after she leaves the screen, with a now-playing chip on Home that has its own Stop
- [x] #4 Playback stops by itself after the caregiver's auto-stop time (default 90 minutes)
- [x] #5 Everything works with no internet connection
- [x] #6 A missing file skips ahead; a playlist that cannot play dims with "Not available right now" and no other error wording
- [x] #7 The activity log records play, stop and auto-stop by playlist id
- [x] #8 Unit tests cover the queue (wrap, shuffle, giving up after repeated errors, auto-stop), and an e2e test plays a generated WAV and stops it from the chip
- [x] #9 Music goes through the shared audio rule (`src/shared/audio/audioPolicy.ts`): the player reports Play, Pause, Stop and auto-stop with `audioStep` and does what `decideAudio` says (playing, lowered, held, paused or off, at its `musicVolume`, asking again at `changesAt`) instead of deciding overlaps itself
- [x] #10 Buddy's voice, his listening and the open chat panel report to the same rule, so music lowers under his lines, pauses while he listens or a chat is open, and comes back afterwards
- [x] #11 Web page sound feeds the rule: the embedded page's WebContents `audio-state-changed` starts a `webPage` hold when the page becomes audible and ends it when the page goes quiet or closes, so music pauses and then comes back
- [x] #12 While `decideAudio` says `muteWebPage`, the embedded page is muted with `webContents.setAudioMuted(true)`, and it is unmuted as soon as the rule no longer says so
- [x] #13 While `showStopMusic` is true, the browser's nav bar shows a large music Stop beside Home and Back, and tapping it stops music for good; an e2e test opens a web page while music plays, stops the music from the nav bar and sees that Stop disappear
- [x] #14 Unit tests cover the page-sound wiring with a fake WebContents: becoming audible, going quiet and closing start and end the hold, and `muteWebPage` mutes and unmutes the page
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a pure tested playlist queue, shuffle/error bounds and auto-stop deadline. 2. Wire the existing shared audioStep/decideAudio rule through a main-process coordinator with timer, voice-stop and embedded-page audibility/mute events. 3. Build a persistent launcher music player, playlist overlay, Home chip and browser-nav Stop using the established clay style and shared z-layers. 4. Connect Buddy speech, listening and chat to the same coordinator, with cleanup after navigation and renderer recovery. 5. Exercise actual generated audio offline, playlist cards, missing files, chip/nav Stop, auto-stop, voice/chat holds, page audio/muting and all font sizes; run unit, lint, typecheck, build and appropriate Electron regressions. The player depends on the verified TASK-09 branch, which will merge before this task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented persistent offline Music player and shared audio runtime. Validation: 841 unit tests, lint, typecheck and build pass. All 114 Electron regressions passed, then 13 Music and Home recovery checks passed after two review fixes: an intentional Pause/listening hold cannot classify a pending play rejection as a bad song; main-document reload clears only that renderer audio. Both fixes have red/green unit regressions. Inverting the page mute guard fails its regression. Generated local WAV playback verifies repeat-card no-op, missing-song skip/all-missing calm dimming, manual pause, Home/Photos/chat/browser Stop, actual embedded page sound and mute/unmute, Buddy speech, auto-stop privacy, renderer recovery and all five text sizes at two viewport sizes. The listening transport is stubbed to exercise microphone hold wiring without a live microphone. Screenshots inspected for six cards and Home chip/date fit. No dependency or schema bump. Shared audio foundation merged in PR40; playback core and visible UI are separate follow-up PRs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Music now plays offline from six caregiver playlists with clear Pause/Play and Stop everywhere, missing-file recovery, auto-stop and shared Buddy/page audio coordination. Validated with actual generated audio, privacy assertions, all font sizes, crash recovery and red/green race regressions.
<!-- SECTION:FINAL_SUMMARY:END -->
