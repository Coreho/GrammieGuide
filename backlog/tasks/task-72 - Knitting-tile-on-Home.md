---
id: TASK-72
title: Knitting tile on Home
status: In Progress
assignee: []
created_date: '2026-10-27 09:28'
updated_date: '2026-10-27 10:25'
labels:
  - knitting
  - home
dependencies: []
priority: medium
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She loves knitting and is very good at it. It is one of the things she can still do well, so a Home tile built around it gives her something she's proud of and enjoys, rather than something to learn. The owner chose all four parts (2026-10-27): her current project with a row counter, large-print patterns, a gallery of her finished work, and knitting videos or ideas. Each part is its own subtask so each can be reviewed in one PR.

The owner wants it to work like the News tile: she taps Knitting on Home and gets a shelf of large sub-tiles, one per part, the way News opens its shelf of news sources (`renderer/launcher/src/tiles/NewsShelf.tsx`).

Context a future agent can't recover from the code: schema version 021 is already taken by Buddy's local voice on `feat/buddy-voice-and-moves` (PR #56), so the first knitting migration must use the next free number after whatever has merged. Keep this work on `feat/knitting-tile`, separate from the WhatsApp, Buddy and I'm bored branches.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Knitting built-in tile can be added from admin Tiles; tapping it opens a Knitting shelf of large sub-tiles, the same way the News tile opens its shelf
- [ ] #2 The sub-tiles are My project, Patterns, My knitting (her finished work) and Videos and ideas; each opens its part in one tap, and each part has a way back to the shelf and a Home button
- [ ] #3 A sub-tile appears only once its part is set up; with nothing set up the shelf shows a calm line, never an error
- [ ] #4 Each part is delivered by its own subtask
<!-- AC:END -->
