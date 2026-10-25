---
id: TASK-61
title: Investigate WhatsApp Desktop live calling integration
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-25 11:13'
updated_date: '2026-10-25 23:23'
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

Diagnose the owner's first real-call error. Preserve the error and account relationship, inspect sanitized runtime stages without placing calls, fix the identified cause with a regression test, and recheck the user-initiated live attempt.

Owner now confirms incoming calls work, but reports a separate WhatsApp window during calls. Identify the owning process/window before changing behavior, resolve the duplicate presentation while preserving embedded calling and account linking, and verify with an owner-initiated incoming call.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Installed version 2.2640.100.0 identified. REA classified Root and VoIP assemblies as .NET 8 CIL; member inspection exceeded its representation budget. Additional execution-free metadata reading found newcall URI construction and internal EndCall/state callbacks, without proving a public control API. Official July 2026 WhatsApp announcement confirms Web Calling with staged rollout. Owner requires calls to stay inside GrammieGuide and reports WhatsApp is already linked; the running Windows app is observed, but a new embedded session is not verified. Saved detailed report and isolated sign-in probe outside source. Automatic approval rejected launching the probe with reason blocked by policy; no window, call or message was sent. Probe node --check and git diff --check passed. Production integration and all runtime call checks remain unfinished.

TASK-62 implements the typed control API and caregiver panel on feat/whatsapp-controls. The default adapter remains unavailable; live embedded WhatsApp integration and call verification remain open here.

Owner explicitly authorized starting the embedded connection after TASK-62. Continue on feat/whatsapp-controls. First deliver a real in-app linking surface; the standalone probe was never launched and no in-app account is yet verified.

Implemented the real caregiver-gated WhatsApp setup window and isolated persist:whatsapp session. Owner supplied walink.png showing WhatsApp rejecting Electron browser identity; removed only GrammieGuide/Electron UA product tags while retaining the actual Chromium version (runtime observed Chrome 152.0.7977.130). Owner confirmed the QR appeared and completed linking with chats visible inside GrammieGuide. Unit tests cover session isolation, deny-all setup permissions, navigation/popup/download guards, teardown, stale probes, and caregiver/lock gates. The new built-app setup test passes using a local intercepted fixture; ElectronApplication.firstWindow stalled, while obtaining the document through BrowserContext resolved the harness wait. Runtime call controls remain disabled pending inspection of the linked session. Persistence after restart is awaiting owner confirmation.

Latest verification: all 29 focused unit/static-render tests pass; the built-app WhatsApp setup e2e passes against a network-intercepted fixture; production build and typechecks, repository lint and formatting checks pass. Login persistence and actual call availability remain pending the live session check. The owner-provided walink.png is left untracked and is not included in commits.

Owner confirmed login persists after restart without another QR scan. Passive linked-page REA captures and separate read-only runtime probes found Web Calling enabled, a cached Web stack, the direct call collection and idle state. Public source evidence and SHA-256 mappings are recorded in docs/whatsapp-integration-investigation.md. TASK-63 implements the original voice bridge, hidden owned session, permission lease, audio priority and Home controls. No real calls or messages were sent. Real outgoing/incoming voice, two-way sound, provider popup behavior and Windows devices remain unverified; do not treat the fixture as production call proof.

The owner reported the first real-call failure when dialing a different WhatsApp account. Live checks found the socket connected, VoIP initialized and audio devices present. A whitelisted debugger trace of the owner's attempt captured lid_resolution_failed. Static source shows interactive queryPhoneExists stores the needed PN/LID mapping; added that lookup before Start and refuse missing/unresolved recipients. Added fixed-code diagnostics without provider messages, and corrected recovery instructions to follow current state after teardown. Build/typechecks, lint and 98 focused tests pass. Live success after the correction still needs confirmation.

After the recipient-lookup correction, the owner's next attempt reached a later uninspectable call-state snapshot. Found an independent bridge flaw: it immediately destroyed Start when the worker had not yet published a readable call model. The adapter now polls for the model within its bounded wait, without resubmitting Start. A regression fixture deliberately delays model creation; unit tests verify exactly one Start followed by Read. Latest build/typechecks, lint and 99 focused tests pass; the full call e2e passes. The separate existing account-setup e2e timed out at 60s twice; it is not reported green and limits were not raised. The corrected built app is running directly to avoid duplicate dev-server restarts. Live success is still pending owner confirmation.

Owner confirmed the corrected outgoing call worked and sounded great. A subsequent read-only app status check showed ready, no call/pending operation, and voice available again. Updated README and integration documents to distinguish this outgoing-call/audio proof from still-unverified live incoming controls and sustained kiosk reliability. TASK-61 remains In Progress for those checks.

Incoming calls and audio are now owner-confirmed. Initial read-only inspection found one visible GrammieGuide window, no embedded document-PiP window or popup target, and the separate Windows WhatsApp.Root app running with its own visible window. Duplicate-window ownership during an actual incoming call remains to be established.

Inspected owner-provided CallerWindow.png. The separate call UI matches the native Windows WhatsApp client; its verified WhatsApp.Root process was running independently of GrammieGuide. Closed only that exact package process. Follow-up process checks show it remains closed, while GrammieGuide remains ready with voice available. Added caregiver guidance to keep the desktop client fully closed to avoid duplicate incoming windows. The copy/docs-only update passes build/typechecks, targeted lint, formatting and diff checks. Awaiting the owner's incoming-call recheck after closing the native client.

Owner completed the incoming-call recheck after the native Windows WhatsApp client was closed: confirmed no extra screen. Both incoming calling and the single GrammieGuide presentation now have owner proof. The duplicate was the independently running desktop client, not an embedded popup. Guidance is saved on feat/whatsapp-controls; broad kiosk reliability checks remain open.
<!-- SECTION:NOTES:END -->
