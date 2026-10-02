---
id: TASK-06
title: Media library store for imported files
status: Done
assignee: []
created_date: '2026-09-29 04:19'
updated_date: '2026-10-02 17:22'
labels: []
milestone: m-8
dependencies: []
documentation:
  - docs/specs/00-overview.md
priority: medium
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Music and photos need a caregiver-managed library: files copied in under generated names, indexed apart from config because the lists can hold hundreds of entries that should not be pushed to renderers on every config change, and they are not settings that belong in migrations. This is shared infrastructure item 2 in the overview. The index should fail safe the way config does (back up a corrupt file and start fresh) so a bad index can never stop the kiosk booting.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each library keeps its own index file in userData, separate from the config store
- [x] #2 Importing copies files into the library folder under generated names; the original path is never stored
- [x] #3 Libraries support list, import, update and remove, and removing an entry deletes its files
- [x] #4 A missing or corrupt index starts empty (backing up the corrupt one) instead of crashing the app
- [x] #5 Admin library channels call requireAdminUnlocked() first
- [x] #6 Unit tests cover import naming, removal and index recovery
- [x] #7 An interrupted import (the app closing or the disk filling up) leaves no half-written entries, and the library stays usable
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added LibraryStore (per-library index.json in userData/media, UUID-named copies, atomic import with rollback, corrupt-index backup), library:* admin IPC gated by requireAdminUnlocked, and admin preload API. Verified with lint, typecheck, build, 510 unit tests and the e2e mediaProtocol spec.
<!-- SECTION:FINAL_SUMMARY:END -->
