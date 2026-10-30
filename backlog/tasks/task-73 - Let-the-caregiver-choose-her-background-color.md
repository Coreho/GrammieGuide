---
id: TASK-73
title: Let the caregiver choose her background color
status: Done
assignee:
  - '@claude'
created_date: '2026-10-27 18:17'
updated_date: '2026-10-27 18:23'
labels:
  - home display
dependencies: []
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner (2026-10-27) wants to choose the color behind her Home and her full-screen views (News, Knitting, Photos, Music, Games, the web page bar) instead of being tied to each theme's own. They chose calm presets over a free color picker: her text, cards and tiles keep the theme's colors, so a background only works when it is as light or as dark as the theme it sits under, and a dementia-friendly screen should never end up hard to read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Admin's Display tab offers a set of calm background presets plus 'Theme default', showing only the presets her text stays readable on with the chosen theme
- [x] #2 The chosen background shows on Home, her full-screen views and admin's Home preview, and changes live without a restart
- [x] #3 Switching to a theme the saved background doesn't suit falls back to that theme's own background without losing the choice; existing setups keep their current look
- [x] #4 Tests cover the preset rules, the saved setting, and Home showing the chosen color
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. shared/theme.ts: THEME_TONES (light/dark per theme), ten calm presets (five light, five dark) that replace only the background tokens (page, bgA, bgB, bgC), backgroundsFor(theme) and themeTokens(theme, background), which ignores a preset whose tone doesn't match.
2. Config: optional display.background, lenient (.catch) so an unknown name never fails the config; unset is the theme's own background, so no schema bump or migration.
3. Home (App.tsx) and admin's Home preview apply themeTokens, so every view that uses the background tokens follows live.
4. Admin Display tab: Background choices (Theme default plus the presets suited to the theme, with swatches) and a note when the saved one doesn't suit the current theme.
5. Tests: unit (tones match each theme, WCAG AA contrast of ink and ink2 on every offered preset, token override and fallback, lenient schema); e2e (default, live change on Home, a full-screen view and the preview, other-tone fallback and return, back to Theme default).
6. Branch from feat/buddy-chatgpt-plan, like the other open work, since installed packages follow it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checks: npm test 1,231 passed (8 new in backgrounds.test.ts, including WCAG AA contrast of ink and ink2 on every offered preset); typecheck and lint clean. e2e background-color.spec 4/4 (default, live change on Home, the Photos view and the preview, other-tone fallback and return, Theme default) and home-preview.spec 3/3. Screenshots checked: Home on Plum, admin's swatches. Left DisplayTab's older lines unformatted (Prettier would reflow lines this task didn't touch). The full e2e suite runs on the combined test branch for her computer.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a background color choice. admin → Display offers Theme default plus calm presets (five light, five dark), showing only those whose tone matches the theme so her text stays readable (unit-tested to WCAG AA). The choice replaces only the background tokens on Home, her full-screen views and admin's Home preview, live; under a theme of the other tone the theme's own background shows and the choice is kept. Optional, lenient config field, so no migration and existing setups look the same. Verified with unit tests, background-color e2e 4/4 and home-preview e2e 3/3.
<!-- SECTION:FINAL_SUMMARY:END -->
