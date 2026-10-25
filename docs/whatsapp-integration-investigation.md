# WhatsApp calling investigation — 2026-10-25

Status: investigation and sign-in probe prepared. The [call-control interface](whatsapp-call-controls.md)
is implemented in TASK-62; the real calling transport is not integrated or verified.
Tracked by TASK-61. The owner requires calls to stay inside GrammieGuide.

## Verified artifact observations

Installed package: `5319275A.WhatsAppDesktop`, version `2.2640.100.0`, x64.
Root: `C:/Program Files/WindowsApps/5319275A.WhatsAppDesktop_2.2640.100.0_x64__cv1g1gvanyjgm`.

REA inspected `WhatsApp.Root.dll` and `WhatsApp.VoIP.dll` without executing them.
Both contain managed CIL targeting .NET 8; the root references WinUI, WebView2,
and the VoIP assembly. This does not prove a public integration API exists.

| Artifact | SHA-256 | REA Evidence |
| --- | --- | --- |
| WhatsApp.Root.dll | `150a692e7498c046ebf6cef39f9994bdeec2772c53172399d0f827e420579d17` | `ev_d35c74a297b8e5baae791f45163c2ff9cb597fd8f1bce381f106b4a6e4a68bcf` |
| WhatsApp.VoIP.dll | `7f7a50a9227bc90270eb1d15797e5e0261b3a0492ae73b9fbd0289c6afaa384b` | `ev_4ed8c4649c4bb119701c2f7fe965436f67f5591174b5f1fad6d37ec1ef484bf5` |

REA member inspections exceeded its 64 MiB representation budget. Those results
have unavailable coverage, not an absence of call methods:
`ev_b23fce9747d5b6eb95fb4f867e76c802a597f158b8f7426c0e847f2275207499`
and `ev_1c9ed32b9995cb1005470c313c35a4edc1d9b9e4d171c78b5b88ced2c6a9ca84`.

## Additional static observations (ordinary .NET tools, not REA Evidence)

The shipped manifest registers `whatsapp`, `tel`, `ms-voip-call`,
`ms-voip-video`, `im`, and `ms-ipmessaging`.

A small execution-free PE metadata/CIL reader found:

- Root method `WhatsApp.SystemIntegrations.DefaultProtocols.ConvertWindowsProtocolToWhatsAppProtocol`,
  token `0x0600197e`, constructs `whatsapp://newcall` routes with `phone` or `lid`.
  `BuildUri`, token `0x0600197f`, sets `dp=1` and optionally `video=true`.
- Root async activation handler, token `0x060020bd`, forwards the activation URI
  to an internal `HandleAppActivationViaProtocol` bridge or stores it pending.
- VoIP contains `VoipCallbacks.EndCall`, token `0x0600068f`,
  `OnCallStateChanged`, token `0x06000693`, and call-state classification methods.

These observations identify entry points and internal behavior. They do not
establish successful dialing, a cross-process status subscription, a supported
hang-up API, an embeddable native call window, or access to the linked account.
The reader emits selected strings/call anchors, not a complete control-flow
reconstruction. No calls or messages were sent.

## Supported-product documentation

WhatsApp's [July 28, 2026 announcement](https://blog.whatsapp.com/introducing-web-calling-on-whatsapp-plus-more-new-updates)
states that WhatsApp Web supports audio and video calls, with gradual rollout.
Actual account availability still needs a live check.

Meta's [Business Calling API](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/business-initiated-calls)
uses a business phone number, call permission, webhooks and WebRTC signaling.
It does not establish a control API for the installed personal Windows client.
Documentation was retrieved through Context7 from the official Business Platform source.

Electron documents [persistent sessions](https://github.com/electron/electron/blob/main/docs/api/session.md)
and separate permission check/request handlers. The current GrammieGuide web-tile
session deliberately denies device permissions; using a normal web tile would not
provide the microphone/camera behavior needed here.

## Proposed in-app architecture

Investigate an isolated WhatsApp Web `WebContentsView` hosted inside the launcher.
Use a separate persistent session and caregiver-controlled linking; do not copy
Windows WhatsApp credentials or cookies. The existing Windows login is a user
report and does not prove this new session is linked.

Keep family photos and contact selection in GrammieGuide. Main derives destinations
from saved caregiver settings. Start with explicit user actions for voice/video;
never initiate a call merely by opening setup. Provide large Home/End controls
outside the remote view. Do not label a call connected from successful page load.

This is a proposed design, not a proven adapter. WhatsApp Web does not thereby
provide a stable custom call-control API. A wrapper around accessible controls
would need live verification and fail-closed behavior when those controls change.
Do not ship hidden click automation based on guessed selectors.

Required integration work after the proof:

1. Verify account linking, supported browser behavior, and call-control availability.
2. Prove outgoing voice/video, incoming answer/decline, busy/unanswered/offline,
   hang-up, popup behavior, and call termination when Home closes the view.
3. Add narrow origin/frame/device permission policy; block external navigation,
   downloads, arbitrary popups and screen capture. Preserve login without preserving
   an active call renderer after closing it.
4. Add typed IPC, main-process authority checks, caregiver setup and launcher contact UI.
5. Coordinate Buddy/music/narration audio and idle/recovery behavior during calls.
6. Verify real touch layout, sound, restart/relink behavior and provider UI changes.

The existing SMS callback feature is a distinct operation. A live-call implementation
must not silently convert delivery/YES states into connected-call states.

## Prepared proof and current blocker

Analysis files are outside the source repository at
`C:/Users/koreo/GrammieGuide-analysis/whatsapp-2.2640.100.0/`:
`Inspect.csproj`, `Program.cs`, `activation-il.txt`, `protocol-il.txt`, `voip-il.txt`,
and `web-probe.cjs`. REA Evidence is exported alongside that folder.

The sign-in probe hosts WhatsApp Web inside an Electron window. It denies device
capture and popups and never places a call. Its persistent session is under
`%APPDATA%/GrammieGuide/WhatsApp`; it does not reuse the desktop app login.
Its optional status output contains booleans only. Login selectors are heuristic
diagnostics, not a production readiness signal.

The environment's automatic approval rejected the attempted launch with
`blocked by policy`; no test window was opened and no runtime result is claimed.
The script was then saved separately and syntax-checked. To run it manually from
the repository root in PowerShell:

```powershell
& .\node_modules\electron\dist\electron.exe 'C:\Users\koreo\GrammieGuide-analysis\whatsapp-2.2640.100.0\web-probe.cjs'
```

Open questions: all runtime call behavior above, account-specific Web Calling
availability, whether simple custom controls can remain reliable, and the real
kiosk's camera/microphone configuration. The production calling feature remains
unfinished pending that evidence.
