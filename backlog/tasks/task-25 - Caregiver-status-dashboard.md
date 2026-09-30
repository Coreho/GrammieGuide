---
id: TASK-25
title: Caregiver status dashboard
status: To Do
assignee: []
created_date: '2026-09-29 05:55'
updated_date: '2026-09-29 09:25'
labels: []
milestone: m-11
dependencies:
  - TASK-33
priority: medium
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The caregiver has Reliability and Activity tabs, but no at-a-glance answer to "is it working?". The activity log is kept in memory only (the last 1000 events) and is lost on restart, so startup and crash history need a small record saved to disk. Report facts only: never present inactivity or repeated taps as distress or an emergency.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A dashboard shows whether the device is online and since when, the last successful startup, crashes or watchdog restarts in the last 7 days, and failed help requests
- [ ] #2 Audio is checked with a Test sound button that the caregiver confirms they heard; the dashboard shows when that was last confirmed
- [ ] #3 Crashes are told apart from power loss and deliberate quits
- [ ] #4 This health record survives restarts and has a fixed maximum size on disk
- [ ] #5 Wording reports what happened and never describes inactivity or repeated taps as distress
- [ ] #6 The dashboard is admin-only
- [ ] #7 Tests cover the health record: saving, the size limit and crash counting
<!-- AC:END -->
