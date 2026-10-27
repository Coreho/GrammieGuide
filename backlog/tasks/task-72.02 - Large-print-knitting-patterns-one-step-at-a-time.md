---
id: TASK-72.02
title: 'Large-print knitting patterns, one step at a time'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-27 09:28'
updated_date: '2026-10-27 16:34'
labels:
  - knitting
dependencies:
  - TASK-72.01
parent_task_id: TASK-72
priority: medium
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She is skilled, but printed patterns are small and it is easy to lose the line. Showing a saved pattern large, one page or step at a time, and remembering where she was, keeps the pattern usable without help.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The caregiver can add pattern pages from the native file picker (at least JPEG and PNG photos of pages) and give the pattern a name
- [x] #2 She sees one page at a time, filling the screen, with large Next, Back and Home buttons
- [x] #3 The pattern reopens on the page she last viewed
- [x] #4 A pattern can be linked to her current project and opened from it
- [x] #5 Pattern files are served only through the media protocol, never as file paths to the renderer
- [x] #6 Tests cover import, paging, the remembered page and a missing file
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New 'patterns' media library (userData/media/patterns), served only by grammie-media://; generic library writes refuse it, like photos and stories.
2. Pattern pages go through the photo pipeline (decode, longer edge 2400 so text stays sharp, JPEG 85, 320 thumbnail) via LibraryStore.addImage; files picked together are ordered by name (page1, page2, page10).
3. The knitting file gains patterns [{id, name, pages: entry ids, lastPage}] (max 20 patterns, 60 pages) and project.patternId; additive with defaults, no config change.
4. IPC: caregiver knitting:addPattern (name, native picker, lock rechecked after it) and knitting:removePattern (record first, then files; unlinks the project); Home-only knitting:patternPage saves the page she is on. Home gets page URLs only.
5. Home: Patterns card on the shelf (opens the pattern directly when there is one, else a list); a viewer with one page filling the screen, large Back and Next, Page N of M, reopening on her last page; a calm line for a missing page; a Pattern button in the project view when one is linked.
6. Admin Knitting tab: add a pattern (name, choose page pictures), list with page count and Remove, and a pattern choice for her project.
7. Tests: unit (ordering, limits, failures, IPC gates, page memory, unlinking, missing entry); e2e (import, link, paging, reopen on last page, open from project, missing file, fit at every text size).
8. Docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: npm test 1,271 passed; typecheck and lint clean. Full e2e (npm run build, then npx playwright test): 177 passed; the one failure was this task's missing-page test, flaky alone too (2 of 3 runs). Cause: Chromium served the deleted page from its in-memory image cache even after page.reload() (resource timing showed 0 ms, 0 bytes). The test now deletes a page Home has never shown (the second page of a two-page Bobble hat pattern), and runs after the list test; knitting-patterns.spec 8/8 in 5 consecutive runs. Product behavior unchanged: a page already on screen staying visible is harmless, and a fresh Home has no cached copy. Noted the cache detail in CLAUDE.md. AC1: PNG pages imported through the real codec in e2e, mixed JPEG/PNG ordering in unit tests; the picker offers the photo extensions.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added large-print knitting patterns. The caregiver names a pattern and picks its page pictures in admin's Knitting tab; pages are resized for sharp text, ordered by file name and stored in a patterns media library served only through grammie-media://. On Home, a Patterns card opens one page at a time, filling the screen with large Back/Next/Home buttons, reopening on her last page (saved in main), with a calm line for a missing page; a pattern linked to her project opens from it. Also fixed saveProject/removeProject dropping saved patterns. Verified with 1,271 unit tests, knitting-patterns e2e 8/8 (5 runs), and the full e2e suite (177 other tests passing).
<!-- SECTION:FINAL_SUMMARY:END -->
