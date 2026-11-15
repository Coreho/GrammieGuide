---
id: TASK-81
title: Weather in plain words on Home
status: To Do
assignee: []
created_date: '2026-11-15 05:43'
labels:
  - home
  - weather
  - feature
milestone: m-12
dependencies: []
priority: medium
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Weather tile shows numbers and icons, but she decides what to wear by asking someone. A short plain sentence such as "Cold and rainy today. A warm coat and an umbrella." answers the real question. It must come only from the forecast the app already fetches, from a fixed vocabulary, so it can never make up advice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Home shows one short sentence about today's weather and what to wear, built from the existing forecast data and a fixed set of phrases
- [ ] #2 Thresholds (cold, warm, hot, rain, wind, snow) are pure, unit-tested rules in shared code
- [ ] #3 When the forecast is missing or stale, the sentence is hidden or says plainly that the weather isn't known, never an old forecast as today's
- [ ] #4 Buddy can say the sentence when she asks about the weather
- [ ] #5 The caregiver can turn the sentence off and choose Celsius or Fahrenheit wording
<!-- AC:END -->
