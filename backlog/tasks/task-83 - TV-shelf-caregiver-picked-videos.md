---
id: TASK-83
title: 'TV shelf: caregiver-picked videos'
status: To Do
assignee: []
created_date: '2026-11-15 05:43'
labels:
  - home
  - video
  - feature
milestone: m-12
dependencies:
  - TASK-50
priority: medium
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She enjoys certain programmes and knitting shows, but video sites are full of distractions, autoplay and adverts. A shelf of a few videos or playlists that the caregiver picked, opened full screen with only Home and Stop, gives her that without the site around it. TASK-50 is building large playback controls for embedded YouTube pages; this shelf should open videos through that work rather than build a second player.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A built-in TV tile shows the caregiver's picked videos as large cards with a picture and a title
- [ ] #2 The caregiver adds videos or playlists by link in admin; only those exact items can be opened from the shelf, and their sites are approved automatically
- [ ] #3 A video opens full screen with large Home and Stop, follows the audio rules (music pauses), and the idle timeout still applies
- [ ] #4 When a video can't be played (removed, offline, region-blocked), she sees a calm message and the shelf, never the site's error page
- [ ] #5 No video address appears in activity or reliability logs
<!-- AC:END -->
