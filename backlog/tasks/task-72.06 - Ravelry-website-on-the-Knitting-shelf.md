---
id: TASK-72.06
title: Ravelry website on the Knitting shelf
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T22:47:00Z'
updated_date: '2026-10-31T22:54:00Z'
labels:
  - knitting
  - browsing
dependencies: []
references:
  - https://www.ravelry.com/
  - src/renderer/launcher/src/tiles/KnittingShelf.tsx
  - src/shared/browser/approvedSites.ts
parent_task_id: TASK-72
priority: medium
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner asked on 2026-10-31 to bring ravelry.com into the Knitting tile. She is a skilled knitter and Ravelry is the largest knitting pattern site. Every Ravelry page redirects to a login, so someone must sign in once inside her protected browser (the persist:web session keeps it). Reports since Ravelry's June 2020 redesign describe headaches, migraines and seizures from its look, which the founders dispute and which we have not assessed for her, so it stays opt-in and the caregiver should try it with her.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Unlocked admin → Knitting has a switch that adds or removes a Ravelry card on her Knitting shelf; with no Knitting tile the switch is disabled and says why
- [x] #2 With the switch off, ravelry.com is refused like any other unapproved site; with it on, ravelry.com and its subdomains open and lookalike or other sites stay blocked
- [x] #3 Tapping the card opens Ravelry in the embedded browser with its usual nav bar, Home button and recovery screen; a link leaving Ravelry is blocked
- [x] #4 A switch change reaches an already-open shelf without restarting, and an unavailable knitting file doesn't hide the card
- [x] #5 Unit and e2e tests cover the switch, the approved-sites rule, opening the page and a blocked link, without touching the real site
- [x] #6 The address is fixed in code, so the caregiver never types it and a tile's saved address can't point the card elsewhere
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Optional tile.ravelry flag (no migration) set from admin → Knitting; RAVELRY_URL constant in shared/knitting/knitting.ts.
2. tileSites approves the site only for a Knitting tile with the flag on.
3. Shelf reads the flag from live config and shows a card that opens through browser:open.
4. Unit tests on the rule; e2e with https stubbed in the persist:web session; one live check of the real login page from a throwaway data folder.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Live check 2026-10-31: the shelf card opened the real site in the built app from a throwaway data folder (navigate 200 to /account/login, login fields present, nothing blocked). The login page has a Remember me box, so admin's text asks for it. Nobody has signed in yet, so staying signed in after a restart is untested.
<!-- SECTION:NOTES:END -->
