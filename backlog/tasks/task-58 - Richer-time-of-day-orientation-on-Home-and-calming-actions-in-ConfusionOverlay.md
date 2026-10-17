---
id: TASK-58
title: Richer time-of-day orientation on Home and calming actions in ConfusionOverlay
status: Done
assignee:
  - '@antigravity'
created_date: '2026-10-17 13:11'
updated_date: '2026-10-17 13:22'
labels: []
dependencies: []
references:
  - src/renderer/launcher/src/components/HomeHeader.tsx
  - src/renderer/launcher/src/components/ConfusionOverlay.tsx
  - src/renderer/launcher/src/App.tsx
priority: medium
type: enhancement
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Clock digits and AM/PM alone can be ambiguous for a user with dementia (for example confusing 7:00 AM with 7:00 PM), and ConfusionOverlay currently shows only generic text without temporal grounding, calming recovery actions, or clearing open built-in overlays. Adding an explicit time-of-day badge with day/night iconography on HomeHeader and enriching ConfusionOverlay with live day/time orientation, optional Buddy reassurance, and direct calming actions (Back to Home, Play Calming Music, Look at Family Photos, Chat with Buddy) helps orient and de-escalate frustration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 HomeHeader displays a clear time-of-day orientation badge (Morning, Afternoon, Evening, Night) with a matching sun/moon glyph alongside the clock and full date, and fits cleanly across all font steps and themes including admin HomePreview.
- [x] #2 Triggering confusion recovery (via rapid-tap detection or inactivity timeout) closes any open built-in overlay or chat panel so she truly returns to Home underneath ConfusionOverlay.
- [x] #3 ConfusionOverlay shows live plain-language day, time-of-day, time, and date orientation alongside reassuring copy and large Clay buttons for Back to Home, Play Calming Music, Look at Family Photos, and (when Buddy chat is enabled) Chat with Buddy.
- [x] #4 When ConfusionOverlay opens, Buddy offers a gentle wave and reassuring line (spoken when voiceEnabled is on) without logging personal content.
- [x] #5 Unit and E2E tests verify timeParts period classification (including late-night hours), built-in overlay dismissal on confusion, and the calming action buttons in ConfusionOverlay.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Enhance timeParts and HomeHeader in src/renderer/launcher/src/components/HomeHeader.tsx with DayPeriod (morning, afternoon, evening, night; 9 PM-5 AM night window), a DayPeriodGlyph SVG (Sunrise, Sun, Sunset, Moon/Stars), and a prominent Clay time-of-day orientation pill ([data-day-period]) beside AM/PM while keeping admin HomePreview and HomeView synced.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Enhanced timeParts and HomeHeader.tsx with DayPeriod (morning 5-11, afternoon 12-16, evening 17-20, night 21-4), DayPeriodGlyph, and the [data-day-period] orientation badge. Updated ConfusionOverlay.tsx with live temporal orientation ([data-confusion-orientation]), Escape key handling, and large Clay calming buttons (Back to Home, Play Calming Music, Look at Family Photos, Chat with Buddy). Updated App.tsx triggerConfusionRecovery to close any open built-in view, clear active toasts, and trigger a gentle Buddy wave and reassurance line. Verified with npm run lint, npm run build, Vitest unit tests (tests/unit/orientation.test.ts), and Playwright E2E tests (tests/e2e/orientation.spec.ts).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented richer time-of-day orientation on Home ([data-day-period] badge with DayPeriodGlyph and natural night hours 9 PM-5 AM) and enhanced ConfusionOverlay with live temporal grounding, automatic closure of open built-in overlays/toasts, gentle Buddy reassurance, and one-tap calming recovery actions (Back to Home, Play Calming Music, Look at Family Photos, Chat with Buddy). Verified with ESLint, typecheck, Vitest unit tests, and Playwright E2E tests.
<!-- SECTION:FINAL_SUMMARY:END -->
