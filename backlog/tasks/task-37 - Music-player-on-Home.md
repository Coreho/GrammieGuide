---
id: TASK-37
title: Music player on Home
status: To Do
assignee: []
created_date: '2026-09-29 09:25'
updated_date: '2026-10-01 18:50'
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
- [ ] #1 A Music built-in tile opens the playlist cards (up to 6), with a large play/pause and a large, obvious Stop on the same screen; next track is secondary
- [ ] #2 Tapping the card already playing does nothing
- [ ] #3 Music keeps playing after she leaves the screen, with a now-playing chip on Home that has its own Stop
- [ ] #4 Playback stops by itself after the caregiver's auto-stop time (default 90 minutes)
- [ ] #5 Everything works with no internet connection
- [ ] #6 A missing file skips ahead; a playlist that cannot play dims with "Not available right now" and no other error wording
- [ ] #7 The activity log records play, stop and auto-stop by playlist id
- [ ] #8 Unit tests cover the queue (wrap, shuffle, giving up after repeated errors, auto-stop), and an e2e test plays a generated WAV and stops it from the chip
- [ ] #9 Music goes through the shared audio rule (`src/shared/audio/audioPolicy.ts`): the player reports Play, Pause, Stop and auto-stop with `audioStep` and does what `decideAudio` says (playing, lowered, held, paused or off, at its `musicVolume`, asking again at `changesAt`) instead of deciding overlaps itself
- [ ] #10 Buddy's voice, his listening and the open chat panel report to the same rule, so music lowers under his lines, pauses while he listens or a chat is open, and comes back afterwards
- [ ] #11 Web page sound feeds the rule: the embedded page's WebContents `audio-state-changed` starts a `webPage` hold when the page becomes audible and ends it when the page goes quiet or closes, so music pauses and then comes back
- [ ] #12 While `decideAudio` says `muteWebPage`, the embedded page is muted with `webContents.setAudioMuted(true)`, and it is unmuted as soon as the rule no longer says so
- [ ] #13 While `showStopMusic` is true, the browser's nav bar shows a large music Stop beside Home and Back, and tapping it stops music for good; an e2e test opens a web page while music plays, stops the music from the nav bar and sees that Stop disappear
- [ ] #14 Unit tests cover the page-sound wiring with a fake WebContents: becoming audible, going quiet and closing start and end the hold, and `muteWebPage` mutes and unmutes the page
<!-- AC:END -->
