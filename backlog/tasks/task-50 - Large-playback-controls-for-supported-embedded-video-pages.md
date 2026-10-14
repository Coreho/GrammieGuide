---
id: TASK-50
title: Large playback controls for supported embedded video pages
status: To Do
assignee: []
created_date: '2026-10-14 17:17'
labels: []
milestone: m-10
dependencies: []
references:
  - TASK-29
  - TASK-32
  - src/main/services/browser/embeddedBrowser.ts
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
priority: medium
type: feature
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
YouTube's own controls are small and surrounded by distractions. SeniorsUI's large transport controls are a useful interaction reference, but its page-specific injection is fragile. GrammieGuide needs a bounded supported-video experience that keeps the familiar route Home available and handles changes to the video site honestly. The initial supported site is YouTube; this does not introduce Chromecast or a new general browser.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A supported YouTube video page offers large Play/Pause, rewind and enter/leave fullscreen controls, with keyboard access and clear accessible labels.
- [ ] #2 Home stays in its familiar reachable position, including during fullscreen; enabling controls does not move Home tiles or the reserved contact area.
- [ ] #3 Controls reflect actual playback/fullscreen state; unsupported pages, missing players and failed commands hide or disable unavailable actions without showing a false success.
- [ ] #4 Only the current allowed embedded page can receive media commands; main authorization and navigation, popup, permission, download and session restrictions remain enforced.
- [ ] #5 Home, inactivity closure and recovery end the page and its media through the existing close path; video and local music continue to obey the shared audio rules.
- [ ] #6 Controls fit the supported screen and all configured text sizes, and avoid covering important video/page controls.
- [ ] #7 Automated checks cover capability/state changes, unavailable players and Home/media shutdown using a controlled video fixture; a manual YouTube and real-device check is documented.
<!-- AC:END -->
