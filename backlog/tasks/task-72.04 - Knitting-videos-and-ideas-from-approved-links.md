---
id: TASK-72.04
title: Knitting videos and ideas from approved links
status: In Progress
assignee:
  - '@claude'
created_date: 2026-10-27 09:28
updated_date: '2026-11-15T05:47:00Z'
labels:
  - knitting
  - browsing
dependencies:
  - TASK-72.01
parent_task_id: TASK-72
priority: low
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Knitting videos and inspiration sites give her new ideas, but the open web has ads and scams. Only links the caregiver saves should open, in the protected browser she already uses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The caregiver can save knitting links with a short label in the Knitting tab
- [x] #2 She sees them as large labelled buttons; tapping one opens it in the embedded browser with its usual Home and recovery behaviour
- [x] #3 Saved knitting links are allowed by the approved-sites rule without separate setup, and other sites stay blocked
- [x] #4 Video pages get the existing large playback controls
- [x] #5 Tests cover saving a link, opening it and a blocked link from that page
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared: shared/knitting/knittingLinks.ts holds the link schema (uuid id, label 1-40, http(s) address without a username or password, at most 2048 chars) and MAX_KNITTING_LINKS = 8. Links live on the Knitting tile in config as optional tile.knittingLinks (no migration), like tile.ravelry, because tileSites() approves sites from config. Lenient per entry: a bad or duplicate entry is dropped and the list cut to 8, so one entry can never fail her config at boot.
2. Approved sites: tilePages() returns each saved link on Knitting tiles, so a link's whole site is approved exactly like a web tile's, and removing it blocks the site again.
3. Home: a Videos and ideas card on the Knitting shelf, read from live config. One link opens it straight away; more opens a screen of large labelled buttons (label, plus Video or Website). Opening goes through browser:open like the Ravelry website card; a refused open keeps her there with a calm line. Owner chose 2026-11-15: with all five parts set up, the four cards keep their places, slightly shorter, and Videos and ideas is a full-width bar below them; with four or fewer it takes the next place in the 2x2 grid.
4. Admin Knitting tab: a Videos and ideas section to add a label and address (checked with the shared schema, plain messages), list them, move earlier or later and remove; saved on every Knitting tile through config:set like the Ravelry switch.
5. Tests: unit for the schema, its leniency in the tile schema and tileSites; e2e knitting-links.spec for saving in admin reaching an open shelf, the list, a video link getting the large playback controls (video fixture), a blocked link from a saved page showing the recovery screen, and a removed link's site blocked again.
6. CLAUDE.md knitting notes and README.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-15: Built on feat/knitting-links. Links are tile.knittingLinks on the Knitting tile (optional, no migration, lenient per entry in shared/knitting/knittingLinks.ts); tilePages() approves each link's site like a web tile. Home: Videos and ideas card (one link opens straight away, more open KnittingLinks.tsx's large buttons marked Video or Website), opening through browser:open like the Ravelry website card. With all five parts the card is a full-width bar under the four, which keep their row and column (owner's choice). Admin: Videos and ideas section in the Knitting tab (name, address, move earlier/later, remove, at most 8).
Verified: typecheck, lint, unit 1691 passed (new knittingLinks.test.ts: schema messages, leniency, cap, tileSites/navigationAllowed); e2e knitting-links.spec 5/5 (saving reaches an open shelf, order, the video fixture standing in for YouTube gets the large playback controls and Play works, a link from a saved page to another site shows the recovery screen and Back to the page returns, one link opens straight away, removing the last link blocks its site, five-card layout keeps the four in place, words fit at all five text sizes); full e2e 257 passed, 1 skipped (kiosk-stacking, needs a packaged exe). Deliberate breaks caught: 5 in unit tests (links not approved, no cap, credentials allowed, duplicates kept, a non-list failing config), 2 in e2e (no bar for five cards, one link not opening). Not tested: a real YouTube page (supportsVideoControls is unchanged), her own use.
<!-- SECTION:NOTES:END -->
