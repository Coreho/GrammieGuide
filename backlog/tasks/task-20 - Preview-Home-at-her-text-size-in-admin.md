---
id: TASK-20
title: Preview Home at her text size in admin
status: Done
assignee:
  - '@agy'
  - '@claude'
created_date: '2026-09-29 05:54'
updated_date: '2026-10-15 06:44'
labels: []
milestone: m-11
dependencies:
  - TASK-12
  - TASK-13
priority: low
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The caregiver edits tiles and settings in the admin window but cannot see how Home looks to her, at her text size and layout, without walking over to the kiosk screen.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The admin window shows a scaled, non-interactive preview of Home at her current text size, layout, theme and tiles
- [x] #2 The preview updates as soon as a setting or tile changes
- [x] #3 The preview never shows secrets and does not affect the real Home screen
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure preview styling helper: build CSS variable dictionary from theme and fontStep, clearing THEME_ONLY_KEYS, with unit tests.
2. Make TileGrid safe for admin: guard window.launcher?.getTileImages so admin can render TileGrid without throwing, falling back to icons/artwork.
3. Create HomePreview component: 1440x900 container scaled via CSS transform, inert, aria-hidden, pointer-events: none, no-op onActivate, static placeholder for Buddy floor, placeholder weather, consuming useConfigStore.
4. Integrate HomePreview in admin: place in both TilesTab and DisplayTab.
5. E2E test tests/e2e/home-preview.spec.ts: verify preview displays saved tiles, updates font-scale when slider changes, and clicks on preview tiles do not trigger actions.
6. Verify with typecheck, lint, unit tests, build, and targeted e2e suite; update CLAUDE.md and README.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added HomePreview component to admin (shown in TilesTab and DisplayTab) rendering a scaled, non-interactive (inert, aria-hidden, pointer-events: none, no-op onActivate) replica of Home at 1440x900 design size. Scoped theme tokens and --font-scale as CSS variables on the preview container only, clearing THEME_ONLY_KEYS on theme changes. Guarded launcher IPC in TileGrid so admin renders icons or card artwork when photo IPC is unavailable. Added unit tests for preview styling/isolation and e2e spec covering tile display, font scale updates, and non-interactivity.

Claude's review changes: Home's clock/weather/date header was copied into the preview; extracted it into launcher HomeHeader.tsx (with timeParts) so Home and the preview render the same component, still without importing BuddyFloor into admin. Simplified TileGrid's no-launcher fallback. Narrowed m2-smoke's admin text lookup, which now also matched the preview's tile label. Verified: typecheck, lint, npm test 973 passed, build, full e2e suite 141 passed (home-preview.spec: tiles render and update live, preview is inert and a click opens nothing on Home, Display text size changes the preview's --font-scale without touching admin's root).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Admin's Tiles and Display tabs show a scaled, non-interactive preview of Home (her header, tiles, layout, theme and text size), built from Home's own HomeHeader and TileGrid without Buddy's 3D floor, fed only by the public config so it never shows secrets and updates as soon as a setting is saved. Verified with unit tests, home-preview.spec and the full e2e suite (141 passed).
<!-- SECTION:FINAL_SUMMARY:END -->
