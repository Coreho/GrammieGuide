---
id: TASK-36
title: Recorded narration for photos
status: To Do
assignee: []
created_date: '2026-09-29 09:24'
labels: []
milestone: m-8
dependencies:
  - TASK-07
  - TASK-32
priority: medium
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from TASK-07 after Codex's review. A family member's recorded voice telling the story behind a photo is separate work from importing and captioning photos: it needs the microphone in the admin window, audio stored in the media library, playback allowed in both windows, and the shared audio rules (TASK-32) so narration and music do not play over each other.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The caregiver can record narration for a photo with the microphone (record, play back, re-record, delete) or attach an audio file
- [ ] #2 Narration is stored in the media library and served through the media protocol, and the admin window can play it back
- [ ] #3 In the photo viewer, photos with narration show a large play button; narration plays only when she taps it, unless the caregiver sets it to play automatically
- [ ] #4 Tests cover storing, replacing and removing narration, and an e2e test plays a narration in the viewer
<!-- AC:END -->
