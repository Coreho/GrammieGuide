---
id: TASK-52
title: Choose and preview the speaker used for Buddy's voice
status: To Do
assignee: []
created_date: '2026-10-14 17:17'
labels: []
milestone: m-9
dependencies: []
references:
  - TASK-32
  - src/renderer/launcher/src/buddy/speech.ts
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
priority: medium
type: enhancement
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Windows kiosk may have several audio outputs or a Bluetooth speaker, and a generated voice can play successfully where nobody hears it. SeniorsUI's output selection and preview are useful references. The caregiver needs a repeatable way to choose and verify Buddy's audible output, with an honest fallback when a device or voice path cannot use that selection. Coordinate preview confirmation with the caregiver test panel.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The unlocked caregiver can inspect available audio outputs, choose a supported output for Buddy speech and hear a preview using the selected voice/provider path.
- [ ] #2 The selection persists across restart using a stable identity; disconnected, unavailable or unsupported devices fall back to the system output with clear caregiver status.
- [ ] #3 The preview identifies the output/path being tested; a voice fallback that can only use the Windows system output is described honestly.
- [ ] #4 Preview completion and the caregiver confirming they heard it are separate outcomes; failures do not mark sound as heard.
- [ ] #5 Changing output, starting a new preview, closing the panel or locking admin stops the previous preview and prevents stale playback.
- [ ] #6 Speech routing and previews obey the configured volume ceiling and existing music/narration/listening rules; secrets and device-test audio content do not leak to logs.
- [ ] #7 Automated checks cover persistence, device disappearance, unsupported routing and stale previews; a physical multi-output/Bluetooth walkthrough is documented.
<!-- AC:END -->
