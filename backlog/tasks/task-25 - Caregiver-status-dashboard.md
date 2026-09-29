---
id: TASK-25
title: Caregiver status dashboard
status: To Do
assignee: []
created_date: '2026-09-29 05:55'
labels: []
milestone: m-11
dependencies:
  - TASK-22
priority: medium
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The caregiver has Reliability and Activity tabs, but no at-a-glance answer to "is it working?". The activity log is kept in memory only (the last 1000 events) and is lost on restart, so startup and crash history need a small record saved to disk. Report facts only: never present inactivity or repeated taps as distress or an emergency.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A dashboard shows whether the device is online and since when, the last successful startup, crashes or watchdog restarts in the last 7 days, whether audio output works, and failed help requests
- [ ] #2 This health record survives restarts and has a fixed maximum size on disk
- [ ] #3 Wording reports what happened and never describes inactivity or repeated taps as distress
- [ ] #4 The dashboard is admin-only
- [ ] #5 Tests cover the health record: saving, the size limit and crash counting
<!-- AC:END -->
