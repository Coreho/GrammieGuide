---
id: TASK-14
title: Family photos as tile images
status: To Do
assignee: []
created_date: '2026-09-29 05:53'
labels: []
milestone: m-6
dependencies:
  - TASK-07
priority: medium
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A photo of the person or place a tile leads to (her daughter's face, her church) is more concrete than an icon. Images come from the photo library and load through the media protocol, never `file://`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The caregiver can give any tile a photo from the photo library instead of an icon, and remove it again
- [ ] #2 The photo fills the tile's picture area, and the label stays readable at every text size
- [ ] #3 A missing or deleted photo falls back to the tile's icon, never a broken image
- [ ] #4 Tests cover the fallback
<!-- AC:END -->
