---
id: TASK-89
title: Restore WhatsApp calling after WhatsApp renamed rejectCall
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-15T15:37:00Z'
updated_date: '2026-11-15T15:40:00Z'
labels:
  - whatsapp calls
milestone: m-7
dependencies: []
references:
  - TASK-64
  - src/shared/whatsAppRuntime.ts
documentation:
  - docs/whatsapp-call-controls.md
priority: high
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-15 Family calls on her kiosk said calls were unavailable and admin showed "Signed in to WhatsApp in GrammieGuide." with "Live calling is not available yet." and disabled call buttons. Nothing in GrammieGuide had changed (same WhatsApp code, Electron 44.4.5 and lockfile as the previous install); WhatsApp Web had. A read-only check inside her signed-in session over a local debugging port showed calling enabled, web calling UI enabled and the browser supported, with the voip stack loaded as type "web", but its rejectCall method is gone: WhatsApp now has rejectCallWithEndReason(reason) and rejectCallWithoutCallContext(...). The bridge (src/shared/whatsAppRuntime.ts) requires acceptCall, rejectCall and endCall before it reports anything, so the missing method switches all calling off. WhatsApp's own Decline click (module useWAWebVoipCallHandlers) calls rejectCallWithEndReason with WAWebVoipWaCallEnums.RejectEndReason.Self (2). activeCall on WAWebCallCollection is unchanged (it is set by setActiveCall when a call exists).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With WhatsApp Web's current voip stack (rejectCallWithEndReason, no rejectCall), a signed-in session reports calling ready and Family calls offers Call and Video call again
- [ ] #2 Declining an incoming call uses rejectCallWithEndReason with WhatsApp's own RejectEndReason.Self, and still uses rejectCall where an older WhatsApp Web has it
- [ ] #3 A stack with neither decline method, or no number for the reject reason, still fails closed without reaching her as an error
- [ ] #4 Unit tests cover the new and old decline methods and the missing case; the fix is checked inside her signed-in session before install
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Readiness: require acceptCall and endCall plus a decline method (rejectCallWithEndReason with a numeric RejectEndReason.Self, else rejectCall). 2. Decline calls whichever was found. 3. Unit tests for new, old and missing. 4. Check the fixed bridge's read inside her signed-in session before install. 5. Document the change and the read-only diagnosis steps.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-15: Diagnosed on her kiosk with the owner's go-ahead: Home quit, the installed exe started once with --remote-debugging-port on 127.0.0.1 (one UAC Yes), read-only CDP checks in the web.whatsapp.com target, then closed through Browser.close with the quit flag set and restarted through the GrammieGuide task; port confirmed closed. Findings: gates fine (calling enabled, web UI enabled, browser supported), stack type web with acceptCall/endCall but no rejectCall; new rejectCallWithEndReason(reason) and rejectCallWithoutCallContext(7 args). WhatsApp's own Decline click calls rejectCallWithEndReason(WAWebVoipWaCallEnums.RejectEndReason.Self) (Self = 2). activeCall unchanged (set by setActiveCall). Call states, startWAWebVoipCall (6 args), queryPhoneExists, toLid unchanged; a new CallState.Screening exists (call screening), which the bridge maps to unavailable.
Fix: the readiness check needs acceptCall, endCall and a decline method (new one with a numeric RejectEndReason.Self, else old rejectCall); decline calls whichever was found. The fixed bridge's read inside her signed-in session returned supported true, videoSupported true, idle; the installed one returned supported false. Unit 1694 passed (3 new tests); deliberate breaks caught: requiring rejectCall again, declining with the wrong reason. Lint and typecheck clean. Docs: docs/whatsapp-call-controls.md records the change and the diagnosis steps.
<!-- SECTION:NOTES:END -->
