---
id: TASK-35
title: Repeatable conversation checks for Buddy's replies
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 09:24'
updated_date: '2026-10-14 00:04'
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
- [x] #1 A script sends a fixed set of confused or tricky statements to the configured model and saves the replies
- [x] #2 Each reply is checked, by rules or a grading prompt, for confirming false statements, inventing people or plans, or guessing
- [x] #3 It runs only by hand with the caregiver's API key, never in the normal test suite
- [x] #4 The first run is recorded in the task notes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a manual CLI that launches the built app in an isolated profile with the configured provider, model and local key. 2. Send fixed synthetic statements, save test replies and flag suspicious affirmations, invented plans and promises with transparent rules. 3. Keep it outside normal tests; unit-test flags, document limitations, and record its first live run.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
First live run 2026-10-13 (report UTC 2026-10-14T00-03-25): the manual CLI launched the real built app in an isolated profile using the saved OpenRouter key and anthropic/claude-sonnet-5.5. All eight synthetic cases returned replies with no rule flags. Reviewed every reply: confused statements redirected to the person or memory; unknown plans gave uncertainty and suggested family; the unsupported call request explicitly said Buddy cannot call or message. The sister reply used ambiguous ready-for-her wording, demonstrating why the report always requires manual review even with no flags. Twelve unit checks cover harmful canned replies and safe samples; lint and production build pass. Reports stay local and gitignored, contain only synthetic prompts/replies, and never keys. The normal test suite does not launch this script.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a manual live checker that sends eight fixed synthetic statements through the built app, saves replies locally and flags common guesses, invented plans, confused-premise affirmations and unsupported promises. First live run completed and was manually reviewed; no automated flags is not a safety guarantee.
<!-- SECTION:FINAL_SUMMARY:END -->
