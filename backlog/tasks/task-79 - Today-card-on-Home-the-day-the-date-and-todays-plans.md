---
id: TASK-79
title: 'Today card on Home: the day, the date and today''s plans'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-15 05:43'
updated_date: '2026-11-15 06:49'
labels:
  - home
  - feature
milestone: m-12
dependencies: []
priority: high
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She often doesn't know what day it is or what is happening today, and asks family the same question many times. A calm card on Home that always answers "what day is it, and what's on today?" reduces that. Plans already exist: the caregiver saves dated `plan` entries for Buddy (TASK-24, `shared/buddy/personalFacts.ts`), so the card should show those rather than add a second place to enter them. Cancelled and past plans must never show. Wording is statements only, never a question she must answer, and never a claim the saved data doesn't support (a saved plan is what the caregiver recorded, not a promise).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Home shows the weekday, the date and the part of the day in plain words (for example "Saturday afternoon, 15 November"), and it changes at midnight and at each part of the day without a restart
- [ ] #2 Today's saved plans (TASK-24 `plan` entries dated today) appear on the card; cancelled, past and future plans do not
- [ ] #3 Tomorrow's plans can be shown as a separate, clearly labelled line, and the caregiver can switch that line off
- [ ] #4 The card fits the fixed Home layout at every font step and theme without moving or covering tiles, and is not a tile slot
- [ ] #5 Buddy can read the card aloud when she asks ("what day is it?", "what's on today?") using only what the card shows
- [ ] #6 The caregiver can turn the card off in admin's Display tab; existing installs keep their current Home until it is turned on
- [ ] #7 Unit tests cover the part-of-day and plan-filtering rules, and an e2e test covers the card showing and hiding plans
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure shared/today/today.ts: dayPeriod (shared with HomeHeader), plansOn/todayCardLines from TASK-24 plan facts by local date, explicitTodayRequest, todayReply.
2. display.todayCard {enabled false, showTomorrow true} via zod defaults (no schema bump).
3. TodayCard.tsx inside HomeHeader at a fixed 64px; Home and admin's Home preview render it from live config.
4. Admin Display tab: on/off and tomorrow switch.
5. buddyChat: fixed day/plans answers after gestures, before model/key; content-free logs.
6. Unit tests (rules, dates, recognizer, chat) and e2e (toggle, filtering, tiles don't move, largest text size, Buddy, off restores tiles).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Home's header already showed weekday, part of day and date (timeParts), so the card adds the plans row and reuses that wording. Turning the card on shortens the tiles once (fixed row); nothing moves afterwards. Verified: unit todayCard.test.ts 10/10; today-card + buddy-facts + background-color e2e 12/12; typecheck and lint clean. Full unit run had 4 load timeouts in photoLibrary/ravelryPicks while Codex ran TASK-84 alongside; both files pass alone (56/56).
<!-- SECTION:NOTES:END -->
