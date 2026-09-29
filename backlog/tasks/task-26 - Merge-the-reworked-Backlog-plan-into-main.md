---
id: TASK-26
title: Merge the reworked Backlog plan into main
status: To Do
assignee: []
created_date: '2026-09-29 08:27'
labels: []
dependencies: []
priority: high
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reworked plan (six themed milestones, TASK-11 to TASK-25, the on-hold drafts, and the fixes from Greptile's review of PR #5) was committed on branch `chore/backlog-rework` and had not been pushed when this task was written. Until it is merged, `main` still carries the older V2 plan (the "V2 features" milestone, with scam shield, photo games and presence as active tasks). As of 2026-09-29 the branch merges cleanly with PR #4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 chore/backlog-rework is pushed and opened as a pull request against main
- [ ] #2 The pull request is merged only after the owner approves it
- [ ] #3 After merging, local main is updated with git pull and `backlog task list` on main shows the reworked plan
<!-- AC:END -->
