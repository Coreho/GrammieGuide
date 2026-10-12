---
id: TASK-14
title: Family photos as tile images
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 05:53'
updated_date: '2026-10-12 17:57'
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
- [x] #1 The caregiver can give any tile a photo from the photo library instead of an icon, and remove it again
- [x] #2 The photo fills the tile's picture area, and the label stays readable at every text size
- [x] #3 A missing or deleted photo falls back to the tile's icon, never a broken image
- [x] #4 Tests cover the fallback
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add an optional photo-library ID to tile config and a pure migration preserving existing tiles. 2. Add an accessible photo chooser and removal control to the tile editor. 3. Render the selected library thumbnail in the existing tile well, retaining the icon on missing images. 4. Verify choosing, removing, missing and deleted photos, persistence, and all text sizes in real Electron; run unit, lint and build checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 755 unit tests; lint, typecheck and production build; 33 Electron regressions covering Home layouts, News, photo library, photo viewer and five new tile-photo flows. UI checks prove assignment/removal for web, app and built-in tiles, image coverage and labels at every font step in both layouts at 1264x760 and 1440x900, missing-thumbnail icon fallback, live deletion and restart persistence. Inspected the dense-layout screenshot. Deliberately disabling onError fallback made the missing-thumbnail test fail; restored source and rebuilt successfully. Explicit caregiver tile selection may use a photo hidden from the viewer; the launcher receives only configured thumbnail URLs, without captions or arbitrary IDs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Any Home tile can use a managed library photo and return to its icon. Missing or deleted images retain the icon and tile position. Verified 755 unit tests, 33 Electron regressions, all text sizes, live deletion, persistence and a fallback mutation check; lint, typecheck and build pass.
<!-- SECTION:FINAL_SUMMARY:END -->
