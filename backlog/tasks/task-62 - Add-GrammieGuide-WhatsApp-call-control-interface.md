---
id: TASK-62
title: Add GrammieGuide WhatsApp call control interface
status: Done
assignee:
  - '@codex'
created_date: '2026-10-25 11:32'
updated_date: '2026-10-25 12:00'
labels: []
dependencies: []
references:
  - TASK-61
  - docs/whatsapp-call-controls.md
type: feature
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner requested a GrammieGuide control interface based on TASK-61 REA findings, with calls remaining in the kiosk, on its own branch. Internal WhatsApp methods and URI activation are observed, but no callable embedded transport is verified. Expose commands and observed states without converting launch acceptance into a connected call.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Expose typed start, answer, decline, end and state interfaces with main-process authority checks
- [x] #2 Derive destinations from saved caregiver contacts and redact provider identifiers and phone numbers from Home
- [x] #3 Deduplicate commands and reject stale or unsupported actions without claiming a connected or ended call
- [x] #4 Verify control behavior with an injected adapter and document the unverified production transport explicitly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add shared command/state contract and main-process adapter boundary grounded in the observed call lifecycle. 2. Test request serialization, observed transitions, failures, stale call IDs and contact privacy. 3. Wire typed IPC/preloads and caregiver status controls; use an unavailable production adapter until an embedded transport is proven. 4. Run focused tests, typecheck/build/lint and document exactly what remains unverified.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented typed shared call commands/state, injectable embedded-only main-process adapter boundary, serial controller, sender/frame/admin gates, typed launcher/admin preload APIs, change events and Contacts caregiver controls on feat/whatsapp-controls. Verified 20 focused controller/IPC/static-render tests: private destinations/IDs remain in main; duplicate starts, stale IDs/revisions, unknown callers, removed contacts, timeout cancellation, locked admin and unconfirmed disconnect outcomes fail closed. Production adapter explicitly reports unavailable; this does not implement a real WhatsApp transport or enable Home calling. Build/typechecks, repository lint, formatting and diff checks pass. Full unit run: 1237 passed, eight media-library timeout failures; isolated media rerun: 50 passed, nine timeout/hook failures. No media code was changed and limits were not relaxed. Initial jsdom interaction test could not start; checked-in rendering checks use the existing static-render convention. Live provider integration remains TASK-61.

Final focused regression run passed all five files / 31 tests, including existing contactController and contactIpc coverage.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the call-control API, guarded main-process controller and caregiver panel; verified with 20 focused tests plus build/typechecks and lint. The real WhatsApp transport remains unavailable and no calls are enabled. Full-suite media filesystem timeouts remain a validation limitation.
<!-- SECTION:FINAL_SUMMARY:END -->
