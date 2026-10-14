---
id: TASK-49
title: 'Caregiver test panel for Buddy, microphone and browser recovery'
status: To Do
assignee: []
created_date: '2026-10-14 17:17'
labels: []
milestone: m-11
dependencies: []
references:
  - TASK-25
  - src/renderer/admin/src/components/ReliabilityTab.tsx
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
priority: high
type: feature
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The caregiver can inspect separate settings and logs but lacks a repeatable way to confirm that the experience actually works on her device. The SeniorsUI 1.0.34 investigation showed that a test label can conceal an incomplete path, so results must distinguish observed success, caregiver-confirmed sound, failure and unavailable configuration. This task adds the initial local test panel; contact delivery tests are a separate follow-up so this panel can ship before Twilio setup. Coordinate with TASK-25's dashboard and Test sound requirement rather than creating competing health records.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only an unlocked caregiver can start tests; privileged test requests are also authorized in main.
- [ ] #2 The panel offers individually initiated Buddy voice, microphone recognition, connectivity and browser recovery checks; each reports checking, passed, failed or unavailable in plain language.
- [ ] #3 Audio playback completion is distinguished from the caregiver confirming that sound was heard; a voice or microphone failure does not produce a successful result.
- [ ] #4 Microphone and audio tests can be cancelled and leave no active recording or delayed speech after cancellation, panel close or admin lock; test phrase content is not logged.
- [ ] #5 A browser recovery check verifies that the senior can return Home after a controlled page failure without navigating to an arbitrary supplied URL or leaving hidden media playing.
- [ ] #6 Any displayed result includes when it was checked and does not imply a feature is working now solely because an earlier test passed; TASK-25 reuses the relevant audio confirmation.
- [ ] #7 Targeted automated checks cover authorization, unavailable configuration, failures and cancellation; a documented real-device walkthrough covers audible voice, microphone and recovery.
<!-- AC:END -->
