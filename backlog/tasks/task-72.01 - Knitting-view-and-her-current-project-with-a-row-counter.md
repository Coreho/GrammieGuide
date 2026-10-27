---
id: TASK-72.01
title: Knitting view and her current project with a row counter
status: To Do
assignee: []
created_date: '2026-10-27 09:28'
updated_date: '2026-10-27 09:30'
labels:
  - knitting
  - home
dependencies: []
parent_task_id: TASK-72
priority: high
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The foundation for the knitting tile, and the part she would use most. Knitters lose their place when they put the work down, and with dementia that is harder to recover. A large row counter that remembers where she got to, next to what she is making and who it is for, lets her pick it straight back up.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Admin has a Knitting tab where the caregiver sets her current project: what it is, who it is for, and an optional photo
- [ ] #2 Home shows the project with a large row count and large add-one and take-one-away buttons
- [ ] #3 The count survives an app restart and Home recovery, and saving it never resets her other settings
- [ ] #4 An accidental quick double tap adds one row, not two
- [ ] #5 The caregiver can reset the count or start a new project from admin; she cannot reset it by accident on Home
- [ ] #6 Logs record that the counter was used, never the project name or who it is for
- [ ] #7 Unit and e2e tests cover counting, persistence, the double-tap guard and the admin setup
- [ ] #8 Delivers the Knitting tile and its shelf, modelled on the News shelf, with the My project sub-tile; the other sub-tiles arrive with their own subtasks
- [ ] #9 The My project sub-tile shows the project name and current row, so she can see where she got to before opening it
<!-- AC:END -->
