---
id: TASK-32
title: 'Shared audio rules for music, narration and Buddy'
status: To Do
assignee: []
created_date: '2026-09-29 09:24'
updated_date: '2026-09-30 15:26'
labels: []
milestone: m-8
dependencies: []
priority: medium
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Music, photo narration, Buddy's voice, his listening, and web pages can all make sound or use the microphone. Without one shared rule they talk over each other, and the planned music Stop lives on Home, hidden while a web page is open. Decide and build the rule before the music player and narration are built on top of it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One shared rule decides what happens when sounds overlap, for example music pauses or lowers while narration or Buddy speaks and resumes afterwards
- [ ] #2 Music pauses while Buddy is listening, so the microphone does not pick it up
- [ ] #3 The rule covers sound from web pages too: when a page in the embedded browser starts playing sound, music pauses, and it resumes once the page has gone quiet or is closed. Page sound never plays over Buddy's voice or while he is listening
- [ ] #4 She can stop music from any screen, including while a web page is open
- [ ] #5 The rule is pure logic with unit tests, including a web page's sound starting and stopping
<!-- AC:END -->
