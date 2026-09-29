---
id: TASK-09
title: Music tile with caregiver playlists
status: To Do
assignee: []
created_date: '2026-09-29 04:20'
updated_date: '2026-09-29 05:52'
labels: []
milestone: m-8
dependencies:
  - TASK-05
  - TASK-06
documentation:
  - docs/specs/03-music-tile.md
priority: medium
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She should be able to play familiar music the caregiver chose in two taps, keep it playing while she uses the rest of the screen, and always see an obvious way to stop it. It must work offline, so this task covers local files only; internet radio from spec 03 is a separate draft, and Spotify is not scheduled. The spec's z-layer values clash with existing ones (`newsOverlay` is 210), so pick new ones in `zLayers.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Music built-in tile opens a few playlist cards (up to 6), with a large play/pause and a large, obvious Stop on the same screen; next track is secondary
- [ ] #2 Tapping the card already playing does nothing
- [ ] #3 Music keeps playing after she leaves the screen, with a now-playing chip on Home that has its own Stop
- [ ] #4 Playback stops by itself after the caregiver's auto-stop time (default 90 minutes)
- [ ] #5 Everything works with no internet connection
- [ ] #6 A missing file skips ahead; a playlist that cannot play dims with "Not available right now" and no other error wording
- [ ] #7 The admin Music tab imports mp3, m4a, aac, flac, ogg and wav with title, artist, length and album art read from the file, builds playlists, and sets auto-stop and the chip
- [ ] #8 The activity log records play, stop and auto-stop by playlist id
- [ ] #9 Unit tests cover the queue (wrap, shuffle, giving up after repeated errors, auto-stop), and an e2e test plays a generated WAV and stops it from the chip
<!-- AC:END -->
