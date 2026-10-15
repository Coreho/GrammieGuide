---
id: TASK-53
title: Optional gentle idle dimming without interrupting media
status: In Progress
assignee:
  - '@agy'
  - '@claude'
created_date: '2026-10-14 17:17'
updated_date: '2026-10-15 02:34'
labels: []
milestone: m-6
dependencies: []
references:
  - TASK-13
  - TASK-32
  - src/shared/confusionDetector.ts
  - 'C:/Users/koreo/GrammieGuide-analysis/seniorsui-1.0.34/REPORT.md'
priority: low
type: enhancement
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The kiosk can remain visually bright while nobody is interacting with it. Optional gentle dimming could make it calmer, but must be assessed on her actual device and kept separate from returning Home. The caregiver controls the timeout and dim level; the screen must never become an obstacle to finding the next familiar button.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The caregiver can enable idle dimming and set a bounded inactivity time and dim level; it is off for existing installations and preserves other settings on upgrade.
- [ ] #2 Dimming is gradual and bounded so visible Home/navigation controls remain identifiable; it does not change tile positions, font size or saved theme.
- [x] #3 The first genuine tap, key or scroll restores normal brightness immediately; a wake-up tap does not accidentally activate a tile or send a contact request.
- [ ] #4 Active video, Buddy speaking/listening/chat, photo narration and a pending contact flow are not dimmed mid-use; music-only playback may continue while the screen dims and its Stop control remains visible.
- [ ] #5 Passive photo/news reading is accommodated by the configurable timeout and gentle dim level; returning Home remains a separate setting and dimming does not start that navigation.
- [ ] #6 Leaving a view, restart and recovery do not leave the screen stuck dimmed; animation respects the existing reduced-motion preference.
- [ ] #7 Automated clock/input checks cover timeout, activity exclusions, wake-up handling and recovery; legibility is checked on the actual device at every text size.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Config & Migration: add display.idleDim to src/shared/configSchema.ts with schemaVersion 13, implement migration 013-idle-dimming.ts in src/main/config/migrations/, update migrations/index.ts, and add test cases in tests/unit/migrations.test.ts (verifying configBackup and applyConfigPatch tests pass).
2. Pure logic: create src/shared/idleDim.ts to determine whether Home should dim based on settings, last activity, current time, and blockers (embedded web, buddy speaking/listening, buddy chat open, photo narration, audio coordinator holds, and contact flow placeholder). Unit-test in tests/unit/idleDim.test.ts with fake clock.
3. Audio Coordinator hold integration: ensure audio coordinator exposes hasHold in audio:changed AudioDecision and test in tests/unit/audioPolicy.test.ts.
4. Launcher dim overlay: add idleDimOverlay to src/shared/zLayers.ts; create IdleDimOverlay component and integrate into launcher App.tsx with capture-phase event swallowing, immediate wakeup, gradual CSS opacity fade (instant with reduced motion), and keeping music Stop chip visible/usable above dim layer.
5. Admin Display Tab: add idle dim toggle, timeout slider (2-60 min), and dim level slider (0.1-0.5) with caregiver copy in src/renderer/admin/src/components/DisplayTab.tsx.
6. Verification & Docs: create tests/e2e/idle-dimming.spec.ts, run typecheck, lint, vitest, and playwright tests; update CLAUDE.md and AGENTS.md; record real-device legibility checklist in task notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented schema version 13 with display.idleDim and migration 013-idle-dimming.ts; verified migrations, backup, and patch validation unit tests pass.

Implemented pure logic in src/shared/idleDim.ts and integrated hasHold reporting into audio coordinator / AudioDecision; verified tests/unit/idleDim.test.ts and tests/unit/audioPolicy.test.ts pass.

agy (Gemini 3.8 Flash High) was stopped by a low-memory reap after the schema, migration 013, the pure rule and an unwired overlay; Claude finished it. Changes after review: simplified shared/idleDim.ts (one blocker check; narration and Buddy's voice/listening are covered by the audio coordinator's new hasHold), wired useIdleDim + IdleDimOverlay into App, made the veil input-free (pointer-events none, top zLayers.idleDim) with a capture-phase wake listener that swallows the wake-up event and its click/keyup, let data-music-stop buttons pass through, added the admin Display controls, and dropped agy's test-only preload flag in favour of Playwright's clock. Verified: typecheck, lint, npm test 889 passed, build, idle-dimming.spec 5/5.

Real-device legibility check (not yet performed): enable dimming at 2 minutes and 50% (darkest), wait, and confirm every tile label, the clock and the music chip are still readable at text sizes 1-5 in both themes (tilesBold, clayCards); repeat at 30%. Confirm the first tap only brightens, music Stop works on the first tap while dimmed, and nothing dims during a web page, Buddy's chat or speech.

Verification: npm test 889 passed; full e2e suite 128 passed; idle-dimming.spec now 7/7 (dims only at the chosen time, wake-up tap opens nothing, key and scroll wake, an audio hold and the chat panel block it and restart the idle time, the admin switch reaches Home live). Left unchecked until the kiosk check: AC2 (identifiable at every text size), AC4 (music Stop pass-through and the web-page blocker are covered by code and the pure rule, not e2e), AC5, AC6 (restart/recovery start bright by design; not separately tested) and AC7 (on-device legibility).
<!-- SECTION:NOTES:END -->
