---
id: TASK-92
title: 'Nursing History tile: her career story and papers'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-21T20:40:00Z'
updated_date: '2026-11-21T21:12:00Z'
labels:
  - nursing
dependencies: []
priority: medium
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She was a nurse for her whole working life: trained at Freedmen's Hospital School of Nursing, became Senior VP of Patient Care and Chief Nursing Officer at East Orange, then taught practical nursing at Dover Business College while earning her MSN in nursing education at Walden University. Her recovered USB sticks hold her coursework and the course materials she wrote for her students. The owner wants a Nursing History tile on Home: big cards for each chapter of her career, each with a short story and her real papers from that time, shown page by page in large print like the knitting patterns. Her papers are personal and some carry private details, so content must live only in her userData, never in this public repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A built-in Nursing History tile opens a shelf of large chapter cards (title and years), in the caregiver's order
- [x] #2 A chapter shows its short story and large buttons for each of its papers; a paper opens one page at a time with large Back/Next/Home controls and 'Page N of M'
- [x] #3 Chapters, stories and paper titles live in a nursing file in userData and page pictures in a JPEG-only nursing media library served by grammie-media://; generic library writes refuse it
- [x] #4 An empty or missing history shows a calm line; a missing page picture shows a calm line while other pages still work; a damaged file is set aside and the view starts empty
- [x] #5 Paper titles and story text are never logged
- [x] #6 Tests cover the shelf, a chapter, paging a paper, the empty state and a missing page
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. shared/nursing/nursingHistory.ts: zod schema (chapters: title, years, story, papers of page entry IDs), Home payload type and pure nursingForHome (page URLs, null for a missing picture).
2. services/nursing/nursingStore.ts: userData/nursing/history.json read/replace, atomic, damaged file set aside with a nursing-reset reliability event.
3. JPEG-only nursing media library (paths, protocol, content types), refused by generic library writes.
4. Home-only nursing:home IPC; activity event nursing-history-opened only.
5. builtinKey 'nursing' with a nurse's-cap icon and admin label; Home view NursingHistory.tsx reusing the Knitting shelf's classes and TurnControls: chapter cards -> chapter story + paper buttons -> paper pages.
6. Tests: unit (store, payload) and e2e (empty state, chapter, paging with a missing page, way back).
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
New built-in Nursing History tile. Home shows large chapter cards; a chapter shows its story and a button per paper; a paper pages one at a time with the knitting viewer's controls and 'Page N of M'. History in userData/nursing/history.json (schema-validated, atomic, damaged file set aside), page pictures in a JPEG-only nursing media library that generic writes refuse, read through the Home-only nursing:home. No content in the repo; titles and stories never logged. No admin editor yet: content is loaded by TASK-93. Verified: unit tests (store, payload; 1715 passing), e2e nursing-history.spec (empty state; chapter, story, paging a paper with a missing page, keyboard, way back). The full e2e suite was not run (owner's call).
<!-- SECTION:FINAL_SUMMARY:END -->
