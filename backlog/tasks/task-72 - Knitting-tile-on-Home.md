---
id: TASK-72
title: Knitting tile on Home
status: To Do
assignee: []
created_date: '2026-10-27 09:28'
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

Context a future agent can't recover from the code: schema version 021 is already taken by Buddy's local voice on `feat/buddy-voice-and-moves` (PR #56), so the first knitting migration must use the next free number after whatever has merged. Keep this work on `feat/knitting-tile`, separate from the WhatsApp, Buddy and I'm bored branches.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Knitting built-in tile can be added from admin Tiles and opens a Knitting view on Home
- [ ] #2 The view offers her current project, patterns, her finished work and videos or ideas, each reachable in one tap with large controls and a Home button
- [ ] #3 Parts the caregiver has not set up are hidden or show a calm line, never an error
- [ ] #4 Each part is delivered by its own subtask
<!-- AC:END -->
