---
id: TASK-12
title: Give each tile a permanent color
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 05:53'
updated_date: '2026-10-05 05:09'
labels: []
milestone: m-6
dependencies: []
priority: high
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tile colors come from the tile's position (`tileBackground(index)` and `tileInk(index)` in `renderer/launcher/src/clay.ts`), so moving, adding or removing a tile can repaint the others. A tile's color is part of how she recognizes it; consistent appearance is a W3C cognitive accessibility recommendation. The next config schema version is 5 unless another migration lands first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each tile stores its own color, chosen by the caregiver from the clay palette in the admin Tiles tab
- [x] #2 Moving, adding, editing or removing tiles never changes any other tile's color
- [x] #3 A config migration gives existing tiles the colors they show today, so nothing changes on upgrade
- [x] #4 New tiles get a color not already used on Home when the palette allows
- [x] #5 Tests cover the migration and that reordering keeps colors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by Codex (session 01a0ec5e-1f19-71d3-8883-1166ecf03b10): tiles store a required colorIndex 0-3 (schema v5); migration 005 assigns the old index % 4 so upgrades look identical (existing values win); config:set keeps saved colors when a patch omits them and gives new tiles an unused color, else the least-used one; Home renders from colorIndex; admin Tiles tab has a four-swatch picker. Claude verified: npm test 21 files / 268 tests passed (new tileColors, configIpc and tileGrid tests cover the migration and reorder/edit/add/remove), typecheck and lint clean, npm run build ok, npm run test:e2e 22 passed. Open: AC 1 needs the admin color picker checked on screen. In the four clay themes every tile shares one surface color, so the swatches look alike; colors only differ in the two Tiles themes.

Greptile review of PR #8 (color picker had no interaction test): added tests/e2e/tile-colors.spec.ts. It picks a swatch for a new tile in the admin form, saves, and checks the color main saved and the color Home paints; adds a second tile without choosing and checks it gets an unused color; reopens the first tile, sees its saved swatch pressed, changes it, and checks the other tile is untouched. Claude ran it on 2026-09-30: npm run build ok, npm run test:e2e 25 passed (22 existing + 3 new), lint clean. AC 1 checked on that evidence plus a screenshot of the picker in the default Tiles Bold theme (four distinct swatches, the chosen one outlined with a check mark). Not yet committed or pushed.

Final check on main (2026-10-05): tests/e2e/tile-colors.spec.ts passes all three tests (picker sets the color main saved and Home paints; a tile added without choosing gets a color Home is not using; reopening shows the saved swatch and changing one leaves the other alone), alongside unit coverage of the migration and reorder/edit/add/remove. 679 unit tests, lint and typecheck clean, all 71 e2e tests pass. Known cosmetic limit, not a gap in this task: in the four clay themes every tile shares one surface color, so the swatches look alike; colors only differ in the two Tiles themes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Each tile stores its own colorIndex and keeps it: moving, adding, editing or removing tiles never repaints the others, migration 005 gives existing tiles the colors they show today, and a new tile gets an unused color when the palette allows. Verified with unit tests over the migration and reorder/edit/add/remove plus tests/e2e/tile-colors.spec.ts, which drives the admin swatch picker and checks the color Home paints.
<!-- SECTION:FINAL_SUMMARY:END -->
