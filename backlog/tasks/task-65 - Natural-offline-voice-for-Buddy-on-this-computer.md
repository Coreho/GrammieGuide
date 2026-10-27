---
id: TASK-65
title: Natural offline voice for Buddy on this computer
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-27 04:58'
labels: []
milestone: m-9
dependencies: []
references:
  - src/main/services/speech/ttsService.ts
  - src/renderer/launcher/src/buddy/speech.ts
  - 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX'
priority: high
type: feature
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the online Edge voice is unavailable (no internet, or Microsoft changing its unofficial endpoint, which on 2026-10-27 made every Edge request fail with HTTP 403), Buddy falls back to the Windows speechSynthesis voice, which sounds robotic. The owner says he "needs a much better voice". Kokoro-82M is an Apache-2.0 open-weight speech model that runs on the computer itself; measured on the dev PC (12 threads) the fp32 model generates about 6 s of speech in 2.2 s and a short line in 0.7 s, while the q8 model was about 3x slower. It must never crash or freeze Home, and it must work with no network once installed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the Edge voice is off or fails, Buddy speaks with a natural local voice before ever using the Windows voice; the Windows voice stays the last resort
- [ ] #2 The local voice works with no network: the model ships with the installed app and nothing is downloaded at runtime
- [ ] #3 Synthesis runs outside the main process, so a crash, hang or missing model falls back to the Windows voice and Home keeps working
- [ ] #4 Long replies start speaking after the first sentence or two is ready, rather than after the whole reply is synthesized
- [ ] #5 The caregiver can choose the local voice from a short curated list and hear a preview in admin; the choice persists through a schema migration
- [ ] #6 The Checks tab voice check reports which path played (online, this computer, or Windows), never passing a fallback off as the chosen voice
- [ ] #7 Unit tests cover path selection, fallback, chunking and the settings migration; docs describe fetching the model and packaging
<!-- AC:END -->
