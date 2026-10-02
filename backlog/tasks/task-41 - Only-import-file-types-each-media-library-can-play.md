---
id: TASK-41
title: Only import file types each media library can play
status: Done
assignee: []
created_date: '2026-10-02 18:00'
updated_date: '2026-10-02 20:18'
labels: []
milestone: m-8
dependencies:
  - TASK-06
priority: low
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while reviewing PR #23 (TASK-06). Import accepts any file with a 1-10 character extension, and the Windows file picker has no type filter, so a photos library can end up holding an .exe or .mp3 that grammie-media:// will never serve. The caregiver would then see entries that show or play nothing, with no hint why.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Importing into photos accepts only the image types grammie-media serves, and music only the audio types it serves
- [x] #2 The file picker offers only those types for the chosen library
- [x] #3 A batch with a rejected file adds nothing, and the caregiver sees a plain message naming the kinds of file that are accepted
- [x] #4 Unit tests cover accepted and rejected extensions for both libraries
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Library import now accepts only the file types grammie-media serves for each library (shared LIBRARY_CONTENT_TYPES in src/shared/media/mediaTypes.ts); a batch with any rejected file adds nothing and returns a plain message; picker filters per library. Verified with lint, typecheck, 620 unit tests, build and e2e.
<!-- SECTION:FINAL_SUMMARY:END -->
