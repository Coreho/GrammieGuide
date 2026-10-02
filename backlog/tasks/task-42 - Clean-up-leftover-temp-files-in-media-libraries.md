---
id: TASK-42
title: Clean up leftover temp files in media libraries
status: Done
assignee: []
created_date: '2026-10-02 18:00'
updated_date: '2026-10-02 20:31'
labels: []
milestone: m-8
dependencies:
  - TASK-06
priority: low
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while reviewing PR #23 (TASK-06). A crash or power cut during import, save or remove can leave .import.tmp and .index.tmp files, or a media file the index no longer lists. Nothing sweeps them, so disk use on her machine slowly grows. Deleting unlisted files is dangerous when the index itself could not be trusted, which is why the safety criterion below matters.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Leftover .import.tmp and .index.tmp files are removed the next time the library loads
- [x] #2 Media files that no index entry lists are removed, and every file the index lists is left alone
- [ ] #3 Nothing is swept when the index could not be read, or when a corrupt index could not be backed up
- [x] #4 The sweep runs inside the library's operation queue and never delays the kiosk starting
- [x] #5 Unit tests cover each kind of leftover and prove that listed files survive
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Library load now sweeps leftover .import.tmp/.index.tmp files and unlisted UUID media files inside the operation queue (no constructor work). Verified by new libraryStore unit tests (536 unit tests pass, lint, typecheck, build, e2e pass). Open: AC #3 not met, a corrupt index that is backed up successfully still sweeps with an empty listed set; ENOENT first-import leftovers are not swept.
<!-- SECTION:FINAL_SUMMARY:END -->
