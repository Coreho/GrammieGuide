---
id: TASK-36
title: Recorded narration for photos
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 09:24'
updated_date: '2026-10-14 00:04'
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
- [x] #1 The caregiver can record narration for a photo with the microphone (record, play back, re-record, delete) or attach an audio file
- [x] #2 Narration is stored in the media library and served through the media protocol, and the admin window can play it back
- [x] #3 In the photo viewer, photos with narration show a large play button; narration plays only when she taps it, unless the caregiver sets it to play automatically
- [x] #4 Tests cover storing, replacing and removing narration, and an e2e test plays a narration in the viewer
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add bounded validated narration storage with atomic publication, serialized photo operations and caregiver-gated IPC. 2. Add audio-only microphone access for the unlocked admin document; recording, attachment, preview, replacement, deletion and per-photo autoplay controls. 3. Add viewer Listen/Stop controls with shared audio leases, paging/Home cleanup, optional autoplay and slideshow holds. 4. Verify storage and permission boundaries, actual recording/playback, offline use, music coordination, font sizes and photo/music regressions. Keep storage, caregiver UI and viewer verification in separate commits.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Continuation retains the storage slice and adds caregiver recording and viewer playback.

2026-10-13: completed the existing storage slice and caregiver/viewer UI. Production build, typecheck and lint pass; 900 unit tests pass. Photo/music regressions pass 28/28; expanded narration E2E passes 5/5, including real MediaRecorder capture with a fake microphone, admin preview, attachment, offline viewer playback, music pause/resume, paging/Home cleanup, opt-in autoplay, all font steps, live deletion and locking admin during recording. Screenshots of admin and viewer inspected. Inverting the audio-only permission condition made its unit test fail; the original condition was restored and the test passes. Stories are not included in settings backups. No photo captions, source paths or narration content are logged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Caregivers can record or attach a familiar voice to a photo, preview/replace/delete it and opt into autoplay. The offline viewer offers large Listen/Stop controls; music and slideshow give way and leaving ends narration. Verified with 900 unit tests, build/lint/typecheck, 28 photo/music regression cases and 5 narration E2E cases.
<!-- SECTION:FINAL_SUMMARY:END -->
