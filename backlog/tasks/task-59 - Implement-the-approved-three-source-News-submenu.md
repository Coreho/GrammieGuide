---
id: TASK-59
title: Implement the approved three-source News submenu
status: Done
assignee:
  - '@codex'
created_date: '2026-10-17 13:23'
updated_date: '2026-10-17 13:37'
labels: []
dependencies: []
type: feature
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The approved News design is three upright website preview cards for Yahoo News, BBC News and NBC News, left to right. The current single-feed story list omits that selection screen.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New News tiles and the local test News tile open three upright cards in the approved order; each opens its configured website in the protected browser.
- [x] #2 Previews load in main with bounded time and memory; unavailable previews leave a usable named card and no background audio or hidden renderer.
- [x] #3 Existing custom single-feed News tiles keep their behavior; caregivers can choose and edit website sources.
- [x] #4 Home, keyboard focus, large text, offline preview fallback and private source navigation are covered by tests and runtime checks.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add optional configured website sources without changing existing feed tiles, add bounded main-process screenshot previews and source-id navigation, build the clay source shelf and caregiver editor, test unit and Electron flows, and update the dev News tile.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented optional per-tile website sources with version-16 migration, editor defaults in Yahoo/BBC/NBC order and retained legacy feeds. Main resolves source IDs, derives site approvals, captures serialized muted sandboxed previews capped at 300 KB with 10-second cleanup, caches previews, and returns to the shelf on root Back. Live publisher screenshot checks succeeded for all three sites, with only the launcher window remaining afterward. Unit suite passed 1112 tests before additional IPC checks; source and IPC checks passed 9 tests. Initial UI review found the opening toast covered the header; source-shelf entry now clears it. Detector radius advisories resolved using existing 40/28px values.

Final validation: npm run build and npm run lint passed; full Vitest suite passed 1118 tests in 82 files. Seventeen distinct Electron E2Es passed across News shelf, legacy News, approved sites, browser close and recovery. Preview lifetime tests verify destruction after success, failure and the 10-second deadline; cache tests cover serialized/capped pending work. All three real publisher previews loaded, at roughly 60-66 KB per data URL. Local News tile updated with backup %APPDATA%/grammieguide/before-news-shelf-1792244040576.json; PIN and both provider keys preserved. Impeccable finish reviewer disposition ship; ordinary-extension evidence recorded at .impeccable/review/news/design-evidence.md with incumbent design files preserved. Normal dev app restarted with new submenu.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the approved Yahoo/BBC/NBC website-preview shelf and source editor, protected source-ID navigation with Back returning to the shelf, bounded muted previews with offline fallback, and migration preserving existing feed tiles. Verified with build, lint, 1118 unit tests, 17 distinct Electron E2Es, live publisher captures and a ship design review. The local test setup is updated and dev is running.
<!-- SECTION:FINAL_SUMMARY:END -->
