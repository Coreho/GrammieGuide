---
id: TASK-80
title: Birthdays and anniversaries on the Today card
status: To Do
assignee: []
created_date: '2026-11-15 05:43'
labels:
  - home
  - feature
milestone: m-12
dependencies:
  - TASK-79
priority: medium
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Family birthdays and anniversaries are dates she cares about and is upset to miss. They repeat every year, so they don't fit Buddy's one-off dated plans (TASK-24). The caregiver should enter each one once, and the Today card should mention it in the days before and on the day.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Admin has a list of yearly dates (person, kind of occasion, day and month, optional year) that is saved, validated and included in settings backups
- [ ] #2 The Today card mentions an occasion from a caregiver-chosen number of days before (default 3) and on the day, in plain words such as "Tom's birthday is on Friday"
- [ ] #3 29 February occasions are shown on 28 February in non-leap years
- [ ] #4 Ages or years married are shown only when the caregiver entered a year and switched that on
- [ ] #5 Buddy can answer "whose birthday is coming up?" from these entries only
- [ ] #6 Unit tests cover the date rules, including year ends and leap years
<!-- AC:END -->
