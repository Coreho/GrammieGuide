---
id: TASK-13
title: 'Fixed Home layouts, including a simple four-tile layout'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-29 05:53'
updated_date: '2026-10-12 07:19'
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
- [x] #1 The caregiver picks a layout in admin, including a simple four-tile layout with large tiles and at least one denser option
- [x] #2 Each tile keeps its slot: adding, removing or editing other tiles never moves it, and empty slots stay empty instead of tiles sliding over
- [x] #3 Home shows every tile on one screen with no scrolling at every text size, and admin explains when a layout is full
- [x] #4 Wide tiles take two slots
- [x] #5 A config migration places existing tiles into a layout in their current order
- [x] #6 Tests cover slot placement and that changing one tile never moves another
- [x] #7 Each layout has a stated tile capacity and a label length limit, and admin prevents or clearly warns about going past them
- [x] #8 Upgrading never loses a tile: tiles that do not fit the chosen layout are kept and listed in admin
- [x] #9 The layouts leave room for the contact button and the now-playing chip
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Checked on the real device at every text size
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a pure shared Home-layout model with two named layouts: Simple four (2 columns × 2 rows, 4 slots, 28-character label guidance) and More choices (4 columns × 2 rows, 8 slots, 18-character label guidance). A wide tile consumes two adjacent slots in one row.
2. Bump config from schema 7 to 8 on current main. Add `display.homeLayout` and a nullable permanent `slot` on each tile. Migration 008 chooses Simple four when the existing tiles consume at most 4 slots, otherwise More choices; it assigns slots in current order without mutating input. Tiles that cannot fit remain in config with `slot: null` and are never deleted. Record that the unmerged TASK-21 branch also claims v8 and must rebase its approved-sites migration to v9 after this lands.
3. Add pure placement helpers for occupied slots, first available placement, layout reconciliation, wide-tile row boundaries, capacity/label warnings, and visible-vs-overflow tiles. Preserve every unaffected tile’s slot when adding, removing, editing, or explicitly repositioning another tile.
4. Replace TileGrid’s count-driven/scrolling layout with the selected fixed rows and columns. Position each placed tile explicitly by saved slot, leave holes empty, hide overflow tiles from Home, keep wide tiles at span 2, and make the tile region `overflow: hidden` with fixed `minmax(0, 1fr)` rows so every placed tile stays on one screen at every font step.
5. Reserve the existing 150px footer for the future “Ask {name} to call” control and Buddy, and add a bounded utility position beside the date for the future now-playing chip. These reservation elements are structural and visually empty until TASK-22/TASK-37 render into them.
6. Update admin Tiles: a layout picker with names/capacities; slot/position shown for every tile; overflow tiles clearly marked “Not shown on Home”; no automatic compaction after removal; additions and size changes use only free compatible slots; editing can choose a free position; full layouts and overlong labels produce plain guidance without deleting data. Switching layouts preserves valid slots, places the rest in current order, and keeps overflow entries.
7. Extend main-process config:set normalization so renderer bugs or older callers cannot create duplicate/invalid placements: existing valid slots win, missing/conflicting tiles take free slots, and overflow remains null. Keep colors and secrets unchanged.
8. Add unit coverage for placement, holes, wide spans, stability, migration and overflow preservation; add E2E coverage for layout selection, add/edit/remove stability, full-layout guidance, overflow listing, and no tile-area scrolling at all five font steps. Run typecheck, lint, unit tests, production build and the relevant/full E2E suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Planning findings (2026-10-05): Home is a fixed 1440×900 Stage with a non-scrolling outer surface, a variable header, the tile area, and a fixed 150px Buddy footer. TileGrid currently chooses columns from tile count, relies on CSS auto-placement, grows rows intrinsically, and scrolls overflow; Tiles admin reorders the array with Move up/down. TASK-13 therefore needs saved slot identity, not only a different CSS template.

The music spec places the future now-playing chip under the clock, while the original visual design placed Help/contact in the footer. The plan preserves the footer and reserves a bounded utility position beside the date so the two future surfaces do not consume tile slots. Actual contact/music controls remain outside this task.

Integration hazard: branch wip/approved-sites-foundation contains an unmerged TASK-21 migration also numbered 008. Current main is schema 7, so this task will use the next canonical version 8; TASK-21 must rebase afterward and renumber its migration/config version to 9. Do not merge both version-8 migrations independently.

The real-device Definition of Done cannot be proven on this development machine; automated checks will cover all five font steps and the fixed 1440×900 Stage, while the hardware check remains open until exercised on the kiosk.

Implemented schema v8 fixed Home layouts. Added the shared Simple four and More choices definitions, permanent nullable tile slots, wide-tile adjacency rules, deterministic placement/preservation helpers, migration 008, and main-process normalization for legacy callers and layout-only changes. Home now renders explicit two-row grids without scrolling, leaves holes in place, keeps overflow off Home but in config, and reserves structural contact/now-playing areas. Admin now exposes layout capacity and label guidance, compatible position selection, full-layout errors, and clearly marked overflow entries. Added restrained hover/press motion to launcher and admin buttons with a prefers-reduced-motion fallback. Verification: typecheck and production build pass; lint passes; 689 unit tests pass. The full built-app E2E run reached 74 passing with one stale wide-tile CSS assertion; after correcting that assertion, all 3 News E2E tests and both changed Home/admin interaction tests pass. Both layouts were exercised at all five font steps with no tile-region scrolling. The real-device Definition of Done remains open.

Review (2026-10-12, Claude): fixed a stale TASK-31 reference on the reserved now-playing area (it is TASK-37), and admin now flags saved labels longer than the current layout's limit, since switching to More choices lowers the limit under existing labels (AC #7). Scope note: buttonMotion.css (global hover/press motion for launcher and admin buttons) is outside this task's criteria; it ships in this PR and is called out there so it can be dropped on request.
<!-- SECTION:NOTES:END -->
