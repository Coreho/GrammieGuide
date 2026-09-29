---
id: TASK-12
title: Give each tile a permanent color
status: To Do
assignee: []
created_date: '2026-09-29 05:53'
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
- [ ] #1 Each tile stores its own color, chosen by the caregiver from the clay palette in the admin Tiles tab
- [ ] #2 Moving, adding, editing or removing tiles never changes any other tile's color
- [ ] #3 A config migration gives existing tiles the colors they show today, so nothing changes on upgrade
- [ ] #4 New tiles get a color not already used on Home when the palette allows
- [ ] #5 Tests cover the migration and that reordering keeps colors
<!-- AC:END -->
