---
id: TASK-13
title: 'Fixed Home layouts, including a simple four-tile layout'
status: To Do
assignee: []
created_date: '2026-09-29 05:53'
labels: []
milestone: m-6
dependencies: []
priority: high
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Home lays tiles out automatically: the column count follows the number of tiles, so adding or removing one reflows the rest, and extra rows scroll. The scrolling handles overflow, but her main activities should fit on one screen and stay put. A tile's place is part of how she finds it; consistent placement is a W3C cognitive accessibility recommendation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The caregiver picks a layout in admin, including a simple four-tile layout with large tiles and at least one denser option
- [ ] #2 Each tile keeps its slot: adding, removing or editing other tiles never moves it, and empty slots stay empty instead of tiles sliding over
- [ ] #3 Home shows every tile on one screen with no scrolling at every text size, and admin explains when a layout is full
- [ ] #4 Wide tiles take two slots
- [ ] #5 A config migration places existing tiles into a layout in their current order
- [ ] #6 Tests cover slot placement and that changing one tile never moves another
<!-- AC:END -->
