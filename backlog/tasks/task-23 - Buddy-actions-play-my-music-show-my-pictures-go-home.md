---
id: TASK-23
title: 'Buddy actions: play my music, show my pictures, go home'
status: To Do
assignee: []
created_date: '2026-09-29 05:54'
labels: []
milestone: m-9
dependencies:
  - TASK-09
  - TASK-18
priority: medium
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buddy can chat but cannot do anything. A small, fixed set of explicit actions would make him more useful: "play my music", "show my pictures", "go home". Each action also needs a visible button, because speech recognition may not catch her words and she should never have to phrase a request just right. The model must not be able to invent actions or claim it did something it did not.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In chat, Buddy can play her music, show her pictures and go Home, and nothing else
- [ ] #2 Each action also appears as a large visible button in the chat panel
- [ ] #3 Spoken and typed requests both work
- [ ] #4 Actions come from a fixed list validated in main, and Buddy never says an action happened unless it did
- [ ] #5 If music or photos are not set up yet, Buddy says so kindly and does not pretend
- [ ] #6 Unit tests cover action validation, and an e2e test asks for music and sees it start
<!-- AC:END -->
