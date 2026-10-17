---
id: TASK-57
title: Set up working local tile and games test
status: Done
assignee:
  - '@codex'
created_date: '2026-10-17 13:08'
updated_date: '2026-10-17 13:11'
labels: []
dependencies: []
type: chore
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The dev profile has only a Probe tile. Populate it so the user can try current tiles and games.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All six Home tiles open and all four built-in games work.
- [x] #2 Sample photos and music work; the original configuration is backed up.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Back up local settings, seed all tiles and sample media, exercise the views and games, and leave the dev profile ready.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Local profile configured with six tiles in more8: wide Photos and Music, Weather, NPR News, Games and Wikipedia Websites. Added three Windows wallpaper sample photos and a generated 24-second chime WAV in Sample Music. Weather sample is New York. Backup: %APPDATA%/grammieguide/before-tile-test-1792242572349.json. PIN hash/salt and both provider keys compared equal before/after. Local helper scripts and screenshot are under ignored test-results/. Application source was unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the Probe-only dev setup with a working tile and games test. npm run build passed. Playwright exercised all six cards, sample photo decoding, music play/stop, matching cards, puzzle swapping and size controls, Tic-Tac-Toe moves, chime pads, live NPR stories, live weather and embedded Wikipedia, with no renderer exceptions.
<!-- SECTION:FINAL_SUMMARY:END -->
