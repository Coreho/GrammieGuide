---
id: TASK-61
title: Investigate WhatsApp Desktop live calling integration
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-25 11:13'
updated_date: '2026-10-25 20:21'
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
1. Implement a caregiver-gated embedded WhatsApp setup surface with a separate persistent session, origin/navigation restrictions, denied capture/downloads/popups and complete view teardown. 2. Add link-status observation and typed setup IPC/UI, then unit-test lifecycle and authority boundaries. 3. Build and open the actual setup window; establish the in-app account session with owner QR linking if needed. 4. Inspect the linked live calling surface, implement only controls supported by runtime evidence, and verify call outcomes, audio and kiosk recovery before enabling capabilities.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Installed version 2.2640.100.0 identified. REA classified Root and VoIP assemblies as .NET 8 CIL; member inspection exceeded its representation budget. Additional execution-free metadata reading found newcall URI construction and internal EndCall/state callbacks, without proving a public control API. Official July 2026 WhatsApp announcement confirms Web Calling with staged rollout. Owner requires calls to stay inside GrammieGuide and reports WhatsApp is already linked; the running Windows app is observed, but a new embedded session is not verified. Saved detailed report and isolated sign-in probe outside source. Automatic approval rejected launching the probe with reason blocked by policy; no window, call or message was sent. Probe node --check and git diff --check passed. Production integration and all runtime call checks remain unfinished.

TASK-62 implements the typed control API and caregiver panel on feat/whatsapp-controls. The default adapter remains unavailable; live embedded WhatsApp integration and call verification remain open here.

Owner explicitly authorized starting the embedded connection after TASK-62. Continue on feat/whatsapp-controls. First deliver a real in-app linking surface; the standalone probe was never launched and no in-app account is yet verified.

Implemented the real caregiver-gated WhatsApp setup window and isolated persist:whatsapp session. Owner supplied walink.png showing WhatsApp rejecting Electron browser identity; removed only GrammieGuide/Electron UA product tags while retaining the actual Chromium version (runtime observed Chrome 152.0.7977.130). Owner confirmed the QR appeared and completed linking with chats visible inside GrammieGuide. Unit tests cover session isolation, deny-all setup permissions, navigation/popup/download guards, teardown, stale probes, and caregiver/lock gates. The new built-app setup test passes using a local intercepted fixture; ElectronApplication.firstWindow stalled, while obtaining the document through BrowserContext resolved the harness wait. Runtime call controls remain disabled pending inspection of the linked session. Persistence after restart is awaiting owner confirmation.

Latest verification: all 29 focused unit/static-render tests pass; the built-app WhatsApp setup e2e passes against a network-intercepted fixture; production build and typechecks, repository lint and formatting checks pass. Login persistence and actual call availability remain pending the live session check. The owner-provided walink.png is left untracked and is not included in commits.

Owner confirmed login persists after restart without another QR scan. Passive linked-page REA captures and separate read-only runtime probes found Web Calling enabled, a cached Web stack, the direct call collection and idle state. Public source evidence and SHA-256 mappings are recorded in docs/whatsapp-integration-investigation.md. TASK-63 implements the original voice bridge, hidden owned session, permission lease, audio priority and Home controls. No real calls or messages were sent. Real outgoing/incoming voice, two-way sound, provider popup behavior and Windows devices remain unverified; do not treat the fixture as production call proof.
<!-- SECTION:NOTES:END -->
