---
id: TASK-94
title: Edit Nursing History from the caregiver panel
status: Done
assignee: []
created_date: '2026-11-22T00:33:00Z'
updated_date: '2026-11-22T00:42:00Z'
labels:
  - nursing
dependencies: []
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Nursing tab in admin to add, edit, reorder and remove her nursing chapters and papers (pages from pictures or one PDF), plus page-1 pictures on Home's paper buttons.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Caregiver can add, edit, reorder and remove chapters
- [x] #2 Caregiver can add a paper from pictures or one PDF, rename, reorder and remove it; removed pages are deleted
- [x] #3 Caregiver-only actions are enforced in main
- [x] #4 Home paper buttons show the first page; chapter cards show the paper count
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built and installed on her computer 2026-11-21. Unit tests for every caregiver channel (tests/unit/nursingIpc.test.ts); visual check of the admin tab at 1440 and 820 px and of Home's chapter view with her real data (screens kept outside the repo).
<!-- SECTION:NOTES:END -->
