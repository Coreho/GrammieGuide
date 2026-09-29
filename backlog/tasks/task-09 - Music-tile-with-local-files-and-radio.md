---
id: TASK-09
title: Music tile with local files and radio
status: To Do
assignee: []
created_date: '2026-09-29 04:20'
labels: []
milestone: m-5
dependencies:
  - TASK-05
  - TASK-06
documentation:
  - docs/specs/03-music-tile.md
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She should be able to play music the caregiver chose in two taps, and keep it playing while she uses the rest of the screen. This is phase 1 of spec 03: local files plus internet radio, with no account needed. Spotify (phase 2) is not scheduled. Voice control was deferred in the spec until speech-in existed; it now does (`buddy:listen`) but stays out of scope here. The spec's z-layer values clash with existing ones (`newsOverlay` is 210), so pick new ones in `zLayers.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Music built-in tile opens up to 6 playlist cards, now playing, a large play/pause, and previous/next (hidden for radio); tapping the card already playing does nothing
- [ ] #2 Music keeps playing after she leaves the screen, with a now-playing chip on Home to reopen or stop it
- [ ] #3 Playback stops by itself after the caregiver's auto-stop time (default 90 minutes), radio included
- [ ] #4 A missing file or failed stream skips ahead; a playlist that cannot play dims with "Not available right now" and no other error wording
- [ ] #5 The admin Music tab imports mp3, m4a, aac, flac, ogg and wav with title, artist, length and album art read from the file, builds up to 6 playlists (tracks, or a radio stream with a test play), and sets auto-stop and the chip
- [ ] #6 Radio stream addresses are limited to http and https
- [ ] #7 The activity log records play, stop and auto-stop by playlist id
- [ ] #8 Unit tests cover the queue (wrap, shuffle, giving up after repeated errors, auto-stop), and an e2e test plays a generated WAV and stops it from the chip
<!-- AC:END -->
