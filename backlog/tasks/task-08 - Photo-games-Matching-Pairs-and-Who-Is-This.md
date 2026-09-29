---
id: TASK-08
title: 'Photo games: Matching Pairs and Who Is This?'
status: To Do
assignee: []
created_date: '2026-09-29 04:20'
labels: []
milestone: m-5
dependencies:
  - TASK-07
documentation:
  - docs/specs/04-photo-games.md
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two gentle games built from the family's own photos give her something pleasant to do and keep names and faces in circulation. There is no score, timer, "wrong" or game over, and Buddy comments from local lines, never the API. Spec 04 has the rules, adaptive ease and wording. Since it was written, new built-in tiles are added through the registry in `renderer/launcher/src/tiles/builtins.tsx`, and Buddy's real model and speech bubble exist for his lines.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Games built-in tile opens a menu with both games, or the only enabled game directly
- [ ] #2 Matching Pairs: face-down cards (3 or 4 pairs); a match stays up with the person's name, a miss shows for 1.5 seconds then flips back, and 6 misses in a row quietly drop the next round to 2 pairs
- [ ] #3 Who Is This?: one photo with 2 or 3 names drawn only from tagged people; any answer reveals the right name and caption, framed as "here is who it is", and 3 misses drop the choices to 2
- [ ] #4 Each round ends with Play again and All done, and Back works at any moment without a confirmation
- [ ] #5 Buddy comments from a local line list without immediate repeats; no scores or counts are shown, and sounds are off unless the caregiver turns them on
- [ ] #6 Caregiver game settings (which games, pairs, choices, sounds) arrive through a config migration
- [ ] #7 The activity log records started, finished and abandoned with hit and miss counts, which are never shown on the kiosk
- [ ] #8 Unit tests cover deck building and adaptive ease with a seeded RNG, and an e2e test plays a full Matching Pairs round
<!-- AC:END -->
