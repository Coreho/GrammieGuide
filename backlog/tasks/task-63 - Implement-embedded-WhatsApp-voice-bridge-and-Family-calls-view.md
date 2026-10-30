---
id: TASK-63
title: Implement embedded WhatsApp voice bridge and Family calls view
status: Done
assignee:
  - '@codex'
created_date: '2026-10-25 20:13'
updated_date: '2026-10-25 20:23'
labels: []
dependencies: []
references:
  - docs/whatsapp-call-controls.md
type: feature
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build the in-app voice transport and simple Home controls from the linked Web session findings. Real-call verification remains in TASK-61.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Provide a Family calls built-in with saved-contact voice start, incoming answer and decline, and local termination
- [x] #2 Restrict microphone access to explicit voice commands and coordinate call audio
- [x] #3 Validate provider state, keep private identifiers in main, and fail closed
- [x] #4 Verify built-app flows against a local provider fixture and document real-device checks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement the original module bridge and hidden call session. Connect typed IPC and Home UI. Exercise lifecycle and failure paths. Document the integration.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the original embedded voice bridge and Family calls tile on feat/whatsapp-controls, with saved-contact start and incoming controls, main-only private IDs, explicit audio permissions, call audio priority, generation-safe cancellation and bounded hang-up plus local teardown. Build and typechecks, lint, 95 focused unit/static-render tests and both intercepted built-app e2e tests pass. The e2e covers connected and lonely states, incoming answer, unknown callers, hung end, Home return and fresh reconnection. Real WhatsApp calls, two-way sound and kiosk device checks remain open in TASK-61. Video remains disabled. No real calls or messages were sent.
<!-- SECTION:FINAL_SUMMARY:END -->
