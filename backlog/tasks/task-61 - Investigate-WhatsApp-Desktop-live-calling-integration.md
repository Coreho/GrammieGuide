---
id: TASK-61
title: Investigate WhatsApp Desktop live calling integration
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-25 11:13'
updated_date: '2026-10-25 12:00'
labels: []
dependencies: []
references:
  - docs/whatsapp-integration-investigation.md
  - docs/whatsapp-call-controls.md
type: spike
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Investigate the installed WhatsApp app with REA before selecting a reliable live calling integration for the kiosk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Record artifact identity and REA evidence for calling boundaries
- [ ] #2 Assess call control, state, incoming calls and kiosk recovery
- [x] #3 Document the proposed integration and remaining proof needed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect shipped WhatsApp artifacts and retain REA evidence. 2. Respect owner requirement that calls stay inside GrammieGuide; investigate an isolated embedded WhatsApp Web session. 3. Run the saved sign-in compatibility probe, then verify real call controls and termination before production integration. 4. Implement and test typed IPC, caregiver setup, contacts, audio and kiosk recovery only after the runtime interface is established.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Installed version 2.2640.100.0 identified. REA classified Root and VoIP assemblies as .NET 8 CIL; member inspection exceeded its representation budget. Additional execution-free metadata reading found newcall URI construction and internal EndCall/state callbacks, without proving a public control API. Official July 2026 WhatsApp announcement confirms Web Calling with staged rollout. Owner requires calls to stay inside GrammieGuide and reports WhatsApp is already linked; the running Windows app is observed, but a new embedded session is not verified. Saved detailed report and isolated sign-in probe outside source. Automatic approval rejected launching the probe with reason blocked by policy; no window, call or message was sent. Probe node --check and git diff --check passed. Production integration and all runtime call checks remain unfinished.

TASK-62 implements the typed control API and caregiver panel on feat/whatsapp-controls. The default adapter remains unavailable; live embedded WhatsApp integration and call verification remain open here.
<!-- SECTION:NOTES:END -->
