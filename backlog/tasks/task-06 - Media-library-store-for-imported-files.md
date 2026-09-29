---
id: TASK-06
title: Media library store for imported files
status: To Do
assignee: []
created_date: '2026-09-29 04:19'
labels: []
milestone: m-5
dependencies: []
documentation:
  - docs/specs/00-overview.md
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Music and photos need a caregiver-managed library: files copied in under generated names, indexed apart from config because the lists can hold hundreds of entries that should not be pushed to renderers on every config change, and they are not settings that belong in migrations. This is shared infrastructure item 2 in the overview. The index should fail safe the way config does (back up a corrupt file and start fresh) so a bad index can never stop the kiosk booting.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each library keeps its own index file in userData, separate from the config store
- [ ] #2 Importing copies files into the library folder under generated names; the original path is never stored
- [ ] #3 Libraries support list, import, update and remove, and removing an entry deletes its files
- [ ] #4 A missing or corrupt index starts empty (backing up the corrupt one) instead of crashing the app
- [ ] #5 Admin library channels call requireAdminUnlocked() first
- [ ] #6 Unit tests cover import naming, removal and index recovery
<!-- AC:END -->
