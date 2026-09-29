---
id: TASK-07
title: Photo library and Photos admin tab
status: To Do
assignee: []
created_date: '2026-09-29 04:19'
labels: []
milestone: m-5
dependencies:
  - TASK-05
  - TASK-06
documentation:
  - docs/specs/04-photo-games.md
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Photo games (and later a Photos slideshow tile and a life book) need the family's photos, tagged with who is in them and how they relate to her. Tagging is manual and belongs to the caregiver; there is no face detection. Spec 04 covers the caregiver side and photo import.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The admin Photos tab imports jpg, png and webp (and heic where Windows can decode it); each photo is downscaled to a 1600px long edge, saved as JPEG, and given a 320px thumbnail
- [ ] #2 Files that fail to decode are reported as failed without stopping the batch, and large imports show a progress count
- [ ] #3 Each photo has a person (autocompleted from existing names), relation, optional caption and a "use in games" switch; several photos can be given the same person at once
- [ ] #4 The launcher can list only photos marked for games; listing all, editing and removing are admin-only
- [ ] #5 The tab says when there are too few photos or people for each game
- [ ] #6 Tests cover import and the admin-only boundaries
<!-- AC:END -->
