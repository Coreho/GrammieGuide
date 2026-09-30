---
id: TASK-26
title: Merge the reworked Backlog plan into main
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 08:27'
updated_date: '2026-09-29 09:26'
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
- [x] #1 chore/backlog-rework is pushed and opened as a pull request against main
- [x] #2 The pull request is merged only after the owner approves it
- [x] #3 After merging, local main is updated with git pull and `backlog task list` on main shows the reworked plan
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Push chore/backlog-rework and open a PR against main
2. Merge it on GitHub (owner approved in chat on 2026-09-29)
3. Pull main locally and confirm `backlog task list` shows the reworked plan
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PR #6 opened and merged on GitHub (merge commit cf84ffd, 2026-09-29 08:39 UTC) after the owner said "merge chore/backlog-rework". PR #4 had been merged two minutes earlier; both combined without conflicts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pushed chore/backlog-rework, opened PR #6 and merged it after the owner approved. Verified by pulling main to cf84ffd and running backlog task list, milestone list and draft list: 25 tasks, the six themed milestones, and 5 drafts.
<!-- SECTION:FINAL_SUMMARY:END -->
