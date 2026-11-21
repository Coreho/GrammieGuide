---
id: TASK-91
title: Photo albums, starting with a New album
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-21T20:40:00Z'
updated_date: '2026-11-21T20:41:00Z'
labels:
  - photos
dependencies: []
priority: medium
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Twelve of her old USB sticks were recovered (C:\Users\jeale\GramsUSB) and hold about 2,300 pictures she has never seen in GrammieGuide. The owner wants them in the Photos tile as a separate album called New, so they don't get mixed into the 819 family photos already there and she can choose to look at either. Photos today are one flat list with no albums.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each photo can belong to a named album; photos saved before albums existed belong to her main album and nothing about them changes
- [ ] #2 When her visible photos are in more than one album, the Photos tile first offers each album as a large choice with how many photos it has; with one album it opens straight to the photos as today
- [ ] #3 Inside an album she pages through only that album's photos, with Home and a way back to the album choice
- [ ] #4 The caregiver can see each photo's album, move a photo to another album, and choose the album when importing
- [ ] #5 Album names are validated in main and never logged
- [ ] #6 Unit and e2e tests cover the album choice, a single album opening directly, and moving a photo between albums
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure shared/media/photoAlbums.ts: album name rules (trimmed, one line, at most 40 characters, no control characters; empty = her main album shown as 'My photos') and grouping visible photos into albums (main first, then others by name), each keeping caregiver order.
2. Photo gains album (string, '' for main); PhotoPatch gains album; photoLibrary reads it leniently (anything not a valid name is the main album), validatePhotoPatch checks it, import() takes an optional album. No config change: album is library metadata like caption.
3. photos:import takes { album? } validated in main before the picker opens; nothing about albums is logged.
4. Home PhotoViewer: with 2+ albums, an album choice screen (large cards: cover thumbnail, name, N photos); picking one pages only that album; an Albums button in the header returns to the choice; one album opens straight to the photos as today. Album vanishing while she looks returns to the choice.
5. Admin Photos tab: 'Album for new photos' input (datalist of existing albums) used by Add photos; per-photo Album field; a Show filter by album so ~3,000 photos stay manageable.
6. Tests: unit (photoAlbums, photoLibrary album patch/import/lenient read), e2e (album choice, single album opens directly, moving a photo between albums in admin shows up on Home).
<!-- SECTION:PLAN:END -->
