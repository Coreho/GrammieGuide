---
id: TASK-72.03
title: Gallery of her finished knitting
status: Done
assignee:
  - '@claude'
created_date: '2026-10-27 09:28'
updated_date: '2026-10-27 18:06'
labels:
  - knitting
dependencies:
  - TASK-72.01
parent_task_id: TASK-72
priority: medium
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She is proud of what she makes. A gallery of her finished pieces, and who received them, is something to look through and show visitors, and it reminds her of a skill she still has.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The caregiver can add photos of finished pieces with what it is and who it was for, and can reorder or remove them
- [x] #2 She can page through them large, with the description shown under each picture
- [x] #3 An empty gallery shows a calm line instead of an error
- [x] #4 Descriptions and recipients are never logged
- [x] #5 Tests cover adding, paging, the empty state and a missing picture
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New 'knitted' media library (userData/media/knitted, JPEG only), served only by grammie-media://; generic library writes refuse it, like patterns. TASK-72.05 will add 3D model files to the same library.
2. A shared picture step in services/knitting: decode, re-encode at most 1600 px (like family photos) plus a 320 thumbnail, reused by pattern pages.
3. The knitting file gains pieces [{id, what, forWhom, picture: entry id}] (max 60, newest first, caregiver order); additive with a default, no config change.
4. IPC (caregiver only): knitting:addPiece (what, for whom, native picker for one picture, lock rechecked after it, picture removed again if the record can't be saved), knitting:movePiece (earlier/later), knitting:removePiece (record first, then file). Home gets pieces through knitting:home with media URLs only. Activity events carry no description or recipient.
5. Home: a 'My knitting' card on the shelf; a gallery view with one piece at a time, the picture large and 'what it is' and 'For <name>' under it, large Back/Next/Home, 'N of M', arrow keys; a calm line for a missing picture while the caption and other pieces still work. Removing the last piece while she looks returns her to the shelf, which says what is left.
6. Admin Knitting tab: 'My knitting' section with the list (thumbnail, what, for whom), Move earlier/later and Remove, and an add form (what it is, who it was for, Choose a photo).
7. Tests: unit (add, cancel, lock recheck, unreadable picture, cleanup, limit, order, move, remove, gates, logging, missing entry, old files load); e2e (add two pieces, reorder, page through with captions, empty shelf, missing picture deleted before Home ever loads it, fit at every text size, logging).
8. Docs: README, CLAUDE.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as planned. Owner chose (2026-10-27) to add each piece's photo in the Knitting tab rather than from the Photos tab, and asked for a 3D viewer too: that is TASK-72.05, so each piece record leaves room for a model. Empty gallery (AC3): the My knitting card only appears once a piece exists (parent TASK-72 AC3), and removing the last piece while she is looking returns her to the shelf, which shows its calm line; e2e covers both. The shared picture step moved from knittingPatterns.ts to knittingPictures.ts (encodePicture, removePictures); pattern behaviour is unchanged. Checks so far: npm test 1,291 passed; lint and typecheck clean; knitting-gallery.spec 6/6 (adding, newest-first order, reorder, paging with captions, missing photo deleted before Home ever loaded it, fit at every text size on both screens, removal back to the shelf, nothing personal in the activity log).

Full e2e (npm run build, then npx playwright test): 182 passed, all 22 knitting tests among them. The one failure was photo-viewer.spec's focus-wrap test, the known race fixed by PR #57 (c449162, into main, not yet on this branch); it stopped the 4 tests after it in that serial file. photo-viewer.spec run alone: 10/10 on the first run, and the same known test failed again on the second.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added her finished-knitting gallery. In admin → Knitting → My knitting the caregiver types what a piece is and who it was for, then picks one photo; it is re-encoded into a new knitted media library (served only through grammie-media://) and the piece goes first, with Move earlier/later and Remove. On Home a My knitting card opens the gallery: one piece at a time, shown whole, with its name and 'For <name>' underneath and large Back/Next. A missing photo keeps its caption with a calm line, and removing the last piece returns her to the shelf's calm line. Activity events never carry descriptions or recipients. Pattern pages now share the same picture step (knittingPictures.ts). Verified with 1,291 unit tests, knitting-gallery e2e 6/6, and the full e2e suite (182 passed; the only failure was the known photo-viewer focus flake fixed in PR #57).
<!-- SECTION:FINAL_SUMMARY:END -->
