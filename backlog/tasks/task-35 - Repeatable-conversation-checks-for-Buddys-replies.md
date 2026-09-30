---
id: TASK-35
title: Repeatable conversation checks for Buddy's replies
status: To Do
assignee: []
created_date: '2026-09-29 09:24'
labels: []
milestone: m-9
dependencies:
  - TASK-11
priority: low
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-11's unit test pins the prompt wording, which proves nothing about what the model actually says. A small, repeatable script that sends a fixed set of tricky statements (a late parent coming to visit, needing to go to work, asking when family is coming) and flags replies that confirm false things or invent plans would catch regressions whenever the prompt or model changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A script sends a fixed set of confused or tricky statements to the configured model and saves the replies
- [ ] #2 Each reply is checked, by rules or a grading prompt, for confirming false statements, inventing people or plans, or guessing
- [ ] #3 It runs only by hand with the caregiver's API key, never in the normal test suite
- [ ] #4 The first run is recorded in the task notes
<!-- AC:END -->
