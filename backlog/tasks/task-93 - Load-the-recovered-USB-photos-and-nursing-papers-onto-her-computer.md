---
id: TASK-93
title: Load the recovered USB photos and nursing papers onto her computer
status: To Do
assignee:
  - '@claude'
created_date: '2026-11-21T20:40:00Z'
labels:
  - photos nursing
dependencies:
  - TASK-91
  - TASK-92
priority: medium
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One-time content load once TASK-91 and TASK-92 are installed on her computer. Source: the sorted copy in C:\Users\jeale\GramsUSB\Organized (Pictures, plus her nursing studies and teaching papers). The owner chose to skip pictures she already has among her current Photos, so near-identical images are left out. Nothing from her files goes into this repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Her photo library and config are backed up before anything changes, and the app is stopped while content is written
- [ ] #2 USB pictures not already in her library are added to the New album through the app's own photo pipeline and are visible to her
- [ ] #3 The Nursing History tile is on Home with its chapters, stories and papers, using a free Home slot so no existing tile moves
- [ ] #4 The app restarts normally afterwards and her existing photos, tiles and settings are unchanged
<!-- AC:END -->
