---
id: TASK-18
title: Family photo viewer
status: To Do
assignee: []
created_date: '2026-09-29 05:53'
labels: []
milestone: m-8
dependencies:
  - TASK-07
priority: medium
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Photos are introduced as something to enjoy: large pictures with the caregiver's captions and, where recorded, a family member's voice. She is never asked to identify anyone or answer anything. Whether this helps her still needs testing with her, so keep it simple and watch how she uses it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Photos built-in tile opens one large picture at a time with its caption in large text
- [ ] #2 Large next and back buttons move between photos; nothing advances on a timer unless the caregiver turns on a gentle slideshow
- [ ] #3 Photos with narration show a large play button; narration plays only when she taps it, unless the caregiver sets it to play automatically
- [ ] #4 There are no questions, quizzes, scores or names she has to supply
- [ ] #5 Everything works with no internet connection
- [ ] #6 Home and Back always work, and with no photos yet the tile shows a gentle message, never an error
- [ ] #7 The activity log records opening the viewer, never photo content or captions
- [ ] #8 An e2e test opens the viewer with seeded photos, pages through them and plays a narration
<!-- AC:END -->
