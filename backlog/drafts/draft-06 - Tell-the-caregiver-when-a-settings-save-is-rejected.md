---
id: DRAFT-06
title: Tell the caregiver when a settings save is rejected
status: Draft
assignee: []
created_date: '2026-10-04 14:10'
updated_date: '2026-10-04 14:10'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-39 made setConfig throw ConfigValidationError on a patch that would not validate, and the rejected save now leaves no trace: no config change, no config:changed push, no 'config-updated' log. That is the safe behaviour, but it is silent.

What the caregiver sees today: the admin store keeps its last good config, so controlled inputs (sliders, selects) snap back to their previous values with no explanation, and useConfigStore.save's promise rejection is unhandled. Someone who has just moved a slider and watched it jump back has no idea whether the app is broken, whether they did something wrong, or whether the change was saved.

Worth doing: catch ConfigValidationError in useConfigStore.save and surface it in the admin tabs that already have an error slot - TilesTab has role='alert' for its own validation messages and could reuse it, and the same pattern would apply to DisplayTab, WeatherTab, ConfusionTab and BuddyTab. ConfigValidationError.issues is already a list of field paths with no values, so it is safe to show; the caregiver-facing sentence is the error's own message.

Deliberately not done in TASK-39: it is a UI concern across five tabs, and TASK-39's own scope was the persistence layer. Doing it inside TASK-39 would have mixed a main-process safety fix with an admin-panel feature and made the safety fix harder to review.

Also unresolved while in there: a rejected save still leaves the form showing the caregiver's typed value in some uncontrolled inputs (for example a text field mid-edit), because only the store was rolled back. Worth checking whether the revert is visible for every control type.
<!-- SECTION:DESCRIPTION:END -->
