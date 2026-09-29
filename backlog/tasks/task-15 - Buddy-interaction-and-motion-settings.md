---
id: TASK-15
title: Buddy interaction and motion settings
status: To Do
assignee: []
created_date: '2026-09-29 05:53'
labels: []
milestone: m-9
dependencies: []
priority: high
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tapping Buddy plays a reaction and offers a Let's chat button, so chatting takes two taps; for some people one tap straight to chat is simpler. He also roams the footer and fidgets. More animation is not automatically better: it can delight her or pull her away from what she was doing, so the caregiver should choose based on watching her. Roaming on/off already exists (`buddy.roaming`); the caregiver-only menu on Ctrl+Shift+B stays as is.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The caregiver chooses what her tap does: open chat directly, or play a reaction with the Let's chat button (today's behavior)
- [ ] #2 The caregiver chooses a motion mode: stays put, walks now and then (today's roaming), or reduced motion
- [ ] #3 Reduced motion keeps him in place with fewer, gentler gestures and no unprompted fidgets
- [ ] #4 Changes apply on Home immediately without a restart
- [ ] #5 A config migration maps the current roaming setting onto the new motion mode
- [ ] #6 Unit tests cover the behavior machine in each motion mode
<!-- AC:END -->
