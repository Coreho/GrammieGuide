---
id: TASK-77
title: 'Photo details on tap: explanation and date'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12 20:28'
updated_date: '2026-11-12 20:36'
labels: []
dependencies: []
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the Photos viewer, tapping a photo should show a small card with the caregiver's explanation of the photo and when it was taken. Today the caption is always shown under the picture and a photo has no date. The owner asked for this on 2026-11-12.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The caregiver can save a 'when' for each photo in admin Photos (free text such as 'Summer 1962', so an unknown exact date is still honest)
- [x] #2 In her viewer a photo with an explanation or a date can be tapped to show both in a small card over the picture; tapping again hides it, and each new photo starts plain
- [x] #3 A photo with neither is not tappable and shows no hint; a visible hint tells her when there is something to read
- [x] #4 The slideshow does not advance while the card is open; stories, paging, Home and keyboard use keep working
- [x] #5 The date is never logged and reaches Home only for photos shown to her
- [x] #6 Unit and e2e tests cover saving the date, validation, and the tap behaviour
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Photo.date (free text, max 60) in library metadata; validatePhotoPatch accepts it; photos:* responses carry it.
2. Admin Photos: a 'When was this taken' field beside the caption (now labelled as the explanation).
3. PhotoViewer: the picture becomes a button when there is something to read; a card over the bottom of the picture shows explanation and date; hint line when closed; slideshow waits while open.
4. Update unit tests and the e2e specs that read captions in the viewer.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: the date is free text (max 60, tidied to one line), not a parsed date, because the exact day of an old family photo is rarely known. Her words now stay hidden until she taps the photo, as the owner asked; before this the caption was always under the picture. Not done: reading a date from the file's EXIF data on import.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Photos have an optional free-text 'when it was taken' saved from admin Photos. In her viewer a photo with words or a date is one large button: tapping shows both in a card over the bottom of the picture, tapping again hides it, each new photo starts plain, and the slideshow waits while the card is open. Verified with npm test (1619 passed), lint, typecheck, and e2e: photo-viewer (13, two new), photos (6), photo-narration (5), buddy-actions (6), mediaProtocol and tile-photos.
<!-- SECTION:FINAL_SUMMARY:END -->
