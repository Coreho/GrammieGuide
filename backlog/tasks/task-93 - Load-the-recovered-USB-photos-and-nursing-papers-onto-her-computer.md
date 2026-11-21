---
id: TASK-93
title: Load the recovered USB photos and nursing papers onto her computer
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-21T20:40:00Z'
updated_date: '2026-11-21T21:12:00Z'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-21: built and installed this branch on her computer (silent install, exit 0; app restarted healthy, config not reset). Backed up her photos index and config to GramsUSB\_GrammieGuide load\backup-before-new-album-*. Imported 1,329 USB pictures into the New album through the app's PhotoLibrary (540 she already had and 418 copies within the USB set left out; 1 unreadable). Nursing History content not loaded yet: 17 papers and 67 rendered pages are prepared in GramsUSB\_GrammieGuide load; the tile is not on Home yet.
<!-- SECTION:NOTES:END -->
