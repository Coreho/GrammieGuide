---
id: TASK-53
title: Optional gentle idle dimming without interrupting media
status: To Do
assignee: []
created_date: '2026-10-14 17:17'
labels: []
milestone: m-6
dependencies: []
references:
  - TASK-13
  - TASK-32
  - src/shared/confusionDetector.ts
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
priority: low
type: enhancement
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The kiosk can remain visually bright while nobody is interacting with it. Optional gentle dimming could make it calmer, but must be assessed on her actual device and kept separate from returning Home. The caregiver controls the timeout and dim level; the screen must never become an obstacle to finding the next familiar button.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The caregiver can enable idle dimming and set a bounded inactivity time and dim level; it is off for existing installations and preserves other settings on upgrade.
- [ ] #2 Dimming is gradual and bounded so visible Home/navigation controls remain identifiable; it does not change tile positions, font size or saved theme.
- [ ] #3 The first genuine tap, key or scroll restores normal brightness immediately; a wake-up tap does not accidentally activate a tile or send a contact request.
- [ ] #4 Active video, Buddy speaking/listening/chat, photo narration and a pending contact flow are not dimmed mid-use; music-only playback may continue while the screen dims and its Stop control remains visible.
- [ ] #5 Passive photo/news reading is accommodated by the configurable timeout and gentle dim level; returning Home remains a separate setting and dimming does not start that navigation.
- [ ] #6 Leaving a view, restart and recovery do not leave the screen stuck dimmed; animation respects the existing reduced-motion preference.
- [ ] #7 Automated clock/input checks cover timeout, activity exclusions, wake-up handling and recovery; legibility is checked on the actual device at every text size.
<!-- AC:END -->
