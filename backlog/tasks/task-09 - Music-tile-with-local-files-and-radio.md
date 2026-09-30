---
id: TASK-09
title: Music library and playlists
status: To Do
assignee: []
created_date: '2026-09-29 04:20'
updated_date: '2026-09-29 09:25'
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
The caregiver side of music: importing familiar songs and arranging them into a few playlists. It must work offline, so it covers local files only; internet radio is a separate draft, and Spotify is not scheduled. The player she uses on Home was split out into TASK-37 after Codex's review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The admin Music tab imports mp3, m4a, aac, flac, ogg and wav, reading title, artist, length and album art from each file
- [ ] #2 Imports copy files into the media library and report files that fail without stopping the batch
- [ ] #3 The caregiver builds up to 6 playlists from imported tracks, each with a name and shuffle on or off, and sets the auto-stop time and whether the now-playing chip shows
- [ ] #4 Removing a track removes it from every playlist
- [ ] #5 Admin music channels call requireAdminUnlocked() first
- [ ] #6 Tests cover import metadata, failed files and playlist editing
<!-- AC:END -->
