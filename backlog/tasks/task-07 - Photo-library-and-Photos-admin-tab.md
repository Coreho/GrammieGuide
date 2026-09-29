---
id: TASK-07
title: Photo library with captions and recorded narration
status: To Do
assignee: []
created_date: '2026-09-29 04:19'
updated_date: '2026-09-29 05:52'
labels: []
milestone: m-8
dependencies:
  - TASK-05
  - TASK-06
documentation:
  - docs/specs/04-photo-games.md
priority: medium
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Family photos are something for her to enjoy: large pictures with a caption the caregiver wrote, and sometimes a family member's recorded voice telling the story. There is no requirement for her to identify anyone or answer questions (the quiz-style photo games from spec 04 are on hold). Whether photos help her still needs to be tested with her. This library also supplies photo tile images and contact photos. Spec 04 still describes the import pipeline (downscaling, thumbnails, failed decodes).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The admin Photos tab imports jpg, png and webp (and heic where Windows can decode it); each photo is downscaled to a 1600px long edge, saved as JPEG, and given a 320px thumbnail
- [ ] #2 Files that fail to decode are reported as failed without stopping the batch, and large imports show a progress count
- [ ] #3 Each photo has an optional caption, a "show to her" switch, and a caregiver-set order
- [ ] #4 The caregiver can record narration for a photo with the microphone (record, play back, re-record, delete) or attach an audio file
- [ ] #5 The launcher can list only photos marked to show; listing all, editing and removing are admin-only
- [ ] #6 Tests cover import, narration storage and the admin-only boundaries
<!-- AC:END -->
