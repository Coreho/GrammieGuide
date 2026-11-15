---
id: TASK-90
title: Make WhatsApp calls use the plugged-in webcam and its microphone
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-15T16:09:00Z'
updated_date: '2026-11-15T16:13:00Z'
labels:
  - whatsapp calls
milestone: m-7
dependencies: []
references:
  - TASK-89
  - TASK-64
  - src/main/services/whatsapp/whatsAppSession.ts
documentation:
  - docs/whatsapp-call-controls.md
priority: high
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-89 restored WhatsApp calling (2026-11-15), the owner found video calls on her kiosk use the laptop's built-in camera and microphone instead of the plugged-in USB webcam (1080P Pro Stream, Logitech 046d:0894) and its microphone. Chromium's own defaults are already the webcam: it is first in the camera list, and Windows' default and communications microphone is the webcam mic (also the one Buddy listens with). So WhatsApp Web chooses the laptop devices itself (a front-facing camera request or a remembered device). Checked in a throwaway session: the built-in HP Wide Vision camera reports facingMode ["user"], the webcam reports [], and the webcam's camera and mic share a groupId. Chromium only exposes camera details to the page while the app grants camera access, which it does only for video calls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In a video call WhatsApp gets a camera that is not built into the screen when one is plugged in, whatever camera or facing mode it asked for; with none plugged in it gets what it asked for
- [ ] #2 Voice and video calls use Windows' default microphone (the one Buddy listens with) whatever microphone WhatsApp asked for
- [ ] #3 If the chosen device cannot be opened, the call falls back to WhatsApp's own request instead of failing
- [ ] #4 Camera access is still granted only for video calls, and the steering runs only in WhatsApp's own page
- [ ] #5 Unit tests cover the steering and fallbacks; existing WhatsApp call e2e tests pass; the owner confirms the webcam picture and mic in a real call
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared steerCallMedia (self-contained, serialized): wrap MediaDevices.prototype.getUserMedia; audio to 'default'; video to the first camera with no facingMode; fall back to WhatsApp's request on failure. 2. Sandboxed preload for the WhatsApp view only, installing it with contextBridge.executeInMainWorld before page scripts. 3. Unit tests for rules and fallbacks. 4. Check on real WhatsApp Web with her real devices before install. 5. Docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-15: Built on fix/whatsapp-webcam. New sandboxed preload src/preload/whatsAppMedia.ts (only on web.whatsapp.com, the WhatsApp view only) runs shared/whatsAppMedia.ts steerCallMedia through contextBridge.executeInMainWorld before WhatsApp's scripts. It wraps MediaDevices.prototype.getUserMedia: audio always deviceId exact 'default' (Windows' default mic, the one Buddy listens with); video the first videoinput whose getCapabilities().facingMode is [] (not built into the screen), facingMode/groupId dropped; nothing found or no camera details means WhatsApp's own video request; a failed steered request retries WhatsApp's own constraints. Permissions unchanged.
Verified: real WhatsApp Web (signed out, throwaway session) with the built preload on her kiosk's real devices: the marker installs before page code; {facingMode:'user'} + laptop mic exact opened "1080P Pro Stream" and "Default - Microphone (1080P Pro Stream)"; exact laptop camera opened the webcam; voice with exact laptop mic opened the webcam mic. Unit 1700 passed (6 new); deliberate breaks caught: taking the first camera regardless, leaving the mic to WhatsApp, no fallback. Lint and typecheck clean. Docs: CLAUDE.md preloads, docs/whatsapp-call-controls.md, README.
<!-- SECTION:NOTES:END -->
