---
id: TASK-51
title: Buddy navigation to saved Home tiles by spoken or typed name
status: To Do
assignee: []
created_date: '2026-10-14 17:17'
labels: []
milestone: m-9
dependencies:
  - TASK-23
references:
  - TASK-23
  - src/shared/buddy/actions.ts
  - src/main/services/ai/buddyChatService.ts
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
priority: medium
type: feature
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buddy already handles music, pictures and Home through TASK-23. SeniorsUI demonstrates useful spoken tile navigation, but GrammieGuide should extend the existing deliberate Talk interaction rather than require exact phrases or continuous listening. The added outcome is opening an unambiguous caregiver-saved Home tile by its current name, with equivalent typed input and ordinary touch navigation available.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With Buddy chat enabled, common spoken and typed requests open an unambiguous visible saved tile by its current caregiver-defined name, alongside the existing music, pictures and Home actions.
- [ ] #2 Explicit saved-tile requests work without an AI key or network beyond whatever the destination itself requires; removed, hidden or unavailable tiles receive calm wording.
- [ ] #3 Main validates the requested tile/action against current saved configuration; input or model output cannot supply arbitrary URLs, executable paths or unknown actions.
- [ ] #4 Ambiguous names do not silently choose a tile; she receives a simple clarification or visible choices without changing the stable Home layout.
- [ ] #5 Navigation success is acknowledged only after the requested opening succeeds; failures never produce a claim that it opened.
- [ ] #6 Recognition remains deliberately initiated through the existing Talk interaction and stops on close/cancel; disabling chat removes this entry path and no always-listening mode is introduced.
- [ ] #7 Tests cover spoken/typed wiring, renamed/removed/hidden tiles, ambiguity, failed opening and arbitrary-target rejection; the real-device recognition check is documented.
<!-- AC:END -->
