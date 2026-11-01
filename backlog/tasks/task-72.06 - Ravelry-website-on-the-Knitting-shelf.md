---
id: TASK-72.06
title: Ravelry website on the Knitting shelf
status: Done
assignee:
  - '@claude'
created_date: '2026-10-31T22:47:00Z'
updated_date: '2026-10-31T23:20:00Z'
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

Installed on her computer 2026-10-31 19:17 (production build of main 7c71349, over the top; exe and app.asar hash-match the build). The owner turned the switch on from admin at 19:19, and a screenshot at 19:19:56 showed Ravelry open in the embedded browser with the Home button, past the login page. Staying signed in across a restart is still untested.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A caregiver switch in admin → Knitting adds a Ravelry card to her Knitting shelf, opening ravelry.com in her protected browser. It is off by default, and only the Knitting tile's flag approves the site, so other sites stay blocked and nothing downloads. Verified with 1497 unit tests, 211 e2e tests (kiosk-stacking skipped, it needs a special package), 0 crc findings on PR #67, and real use on her computer after install. Not verified: whether the sign-in survives a restart, and how Ravelry's design suits her, given reports of headaches since its 2020 redesign. Her saved patterns through the API remain TASK-72.07, which needs the owner's API key.
<!-- SECTION:FINAL_SUMMARY:END -->
