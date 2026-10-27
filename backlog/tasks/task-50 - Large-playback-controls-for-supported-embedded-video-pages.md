---
id: TASK-50
title: Large playback controls for supported embedded video pages
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-14 17:17'
updated_date: '2026-10-21 00:56'
labels: []
milestone: m-10
dependencies: []
references:
  - TASK-29
  - TASK-32
  - src/main/services/browser/embeddedBrowser.ts
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
documentation:
  - docs/video-reader-and-buddy-facts.md
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
- [x] #1 A supported YouTube video page offers large Play/Pause, rewind and enter/leave fullscreen controls, with keyboard access and clear accessible labels.
- [x] #2 Home stays in its familiar reachable position, including during fullscreen; enabling controls does not move Home tiles or the reserved contact area.
- [x] #3 Controls reflect actual playback/fullscreen state; unsupported pages, missing players and failed commands hide or disable unavailable actions without showing a false success.
- [x] #4 Only the current allowed embedded page can receive media commands; main authorization and navigation, popup, permission, download and session restrictions remain enforced.
- [x] #5 Home, inactivity closure and recovery end the page and its media through the existing close path; video and local music continue to obey the shared audio rules.
- [x] #6 Controls fit the supported screen and all configured text sizes, and avoid covering important video/page controls.
- [ ] #7 Automated checks cover capability/state changes, unavailable players and Home/media shutdown using a controlled video fixture; a manual YouTube and real-device check is documented.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add isolated YouTube video controls with main authorization, a separate toolbar below Home, and fixture tests for state, navigation and shutdown.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented isolated YouTube adapter, validated launcher-only fixed commands, actual player state, and separate 88px toolbar. Full screen uses a top-layer video popover inside the existing page bounds so Home remains reachable and session permissions remain deny-all. Controlled video E2E passes play/pause, expansion, missing player and Home shutdown. Live YouTube and real-device checks remain.

Final verification: controlled video fixture covers Play/Pause, rewind, expansion/restore with keyboard, fixed Home, all five text sizes, player disappearance, Home shutdown and quitting with a live view. Main-only authorization checks and the existing permission/download/navigation/session/audio/closure tests pass. Live YouTube check on the dev PC on 2026-10-20 passed actual Play/Pause states, expansion/restore, Home page closure and clean shutdown. Full suite 1132 unit tests and 162 E2E tests passed; nine browser cases pass on the final build. AC7 remains open only for the physical kiosk check documented in docs/video-reader-and-buddy-facts.md.
<!-- SECTION:NOTES:END -->
