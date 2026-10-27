---
id: TASK-65
title: Natural offline voice for Buddy on this computer
status: Done
assignee:
  - '@claude'
created_date: '2026-10-27 04:58'
updated_date: '2026-10-27 06:08'
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
- [x] #1 When the Edge voice is off or fails, Buddy speaks with a natural local voice before ever using the Windows voice; the Windows voice stays the last resort
- [x] #2 The local voice works with no network: the model ships with the installed app and nothing is downloaded at runtime
- [x] #3 Synthesis runs outside the main process, so a crash, hang or missing model falls back to the Windows voice and Home keeps working
- [x] #4 Long replies start speaking after the first sentence or two is ready, rather than after the whole reply is synthesized
- [x] #5 The caregiver can choose the local voice from a short curated list and hear a preview in admin; the choice persists through a schema migration
- [x] #6 The Checks tab voice check reports which path played (online, this computer, or Windows), never passing a fallback off as the chosen voice
- [x] #7 Unit tests cover path selection, fallback, chunking and the settings migration; docs describe fetching the model and packaging
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add kokoro-js (pinned) and a fetch script (scripts/fetchVoiceModel.mjs) that downloads the fp32 Kokoro-82M ONNX files at a pinned Hugging Face revision into gitignored resources/voice-model/, checking SHA-256; npm run package runs it and electron-builder ships it as extraResources. Exclude other platforms' onnxruntime binaries and unpack native ones from the asar.
2. Synthesis runs in an Electron utilityProcess (localVoiceWorker.ts, a second main entry) so a native crash or hang can't touch Home; services/speech/localVoice.ts starts it lazily, times out per request, restarts after a crash and gives up after repeated crashes until the app restarts; missing model files mean unavailable at once.
3. buddy:speak tries Edge (if on), then the local voice, then reports failure so the renderer uses the Windows voice. Results say which source played; mime may be WAV. An explicit path lets admin preview each voice on its own.
4. Renderer speech.ts splits long lines into sentence chunks (pure, shared) and fetches the next chunk while the current one plays.
5. Config buddy.localVoice (curated Kokoro voices, default am_michael) with migration 021; admin Buddy tab gets a picker and preview, and the online-voice copy changes.
6. Checks: VoicePath gains 'local', with honest messages for each path and fallback.
7. e2e keeps the Windows fallback unless GRAMMIEGUIDE_LOCAL_VOICE=1, so suites don't load a 300 MB model; one e2e enables it when the model is present. Verify a packaged build speaks with the local voice.
8. Unit tests for chunking, service fallback/crash/timeout, IPC path choice, migration and checks; docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Found while testing: kokoro-js stream() given a plain string waits forever after the last sentence, and the utility process then exits (code 143); the worker passes a closed TextSplitterStream. Packaged build checked with dist/win-unpacked/GrammieGuide.exe (GRAMMIEGUIDE_E2E=1, GRAMMIEGUIDE_LOCAL_VOICE=1): first line 5.9 s including model load, next 1.4 s. Installer grew to 482 MB (model 311 MB; transformers/onnxruntime in the asar). Full e2e: 171 passed; the only remaining failure is contact-family.spec.ts (strict-mode clash with WhatsApp status messages from the parent branch), unrelated to this work. The Edge voice itself is still broken on msedge-tts 2.0.7 (403); 2.1.1 fixes it, not done here (owner chose the local voice only).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Buddy now speaks with Kokoro-82M on the computer itself when the online voice is off or failing, before ever using the Windows voice. The model ships with the app (npm run fetch:voice, pinned and SHA-256 checked) and synthesis runs in a crash-isolated utility process; long lines are spoken in pieces; caregivers pick and preview the voice (migration 021) and the Checks voice test names the path that played. Verified by unit tests (service, chain, chunking, migration, checks), tests/e2e/local-voice.spec.ts (real model, admin preview, Home speech with the online voice off) and a packaged-app run.
<!-- SECTION:FINAL_SUMMARY:END -->
