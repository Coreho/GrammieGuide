---
id: TASK-84
title: 'Recipes shelf: one step at a time'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-11-15 05:43'
updated_date: '2026-11-15 06:35'
labels:
  - home
  - feature
milestone: m-12
dependencies: []
priority: medium
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She still likes to cook familiar dishes but loses her place in a recipe. A shelf of a few favourite recipes, each shown one step per page with big Next and Back buttons, keeps her on track. The knitting pattern viewer already solves the same "one page at a time" problem (`TurnControls`, a store outside config, pictures through the photo pipeline), so recipes should follow its patterns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A built-in Recipes tile shows the caregiver's recipes as large cards with a photo and a name
- [ ] #2 A recipe opens to its ingredients, then one step per page in large print with Next and Back, and remembers her step if she leaves and comes back the same day
- [ ] #3 The caregiver adds, edits, orders and removes recipes in admin, with optional photos for the recipe and each step
- [ ] #4 Recipes are stored outside config, survive a damaged file without blocking Home, and are caregiver-only to change
- [ ] #5 Buddy can read the current step aloud when she asks
- [ ] #6 E2E covers adding a recipe in admin and stepping through it on Home
<!-- AC:END -->
