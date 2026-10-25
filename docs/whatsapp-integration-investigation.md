# WhatsApp calling investigation — 2026-10-25

Status: the [voice bridge, Home controls and embedded account linking](whatsapp-call-controls.md)
are implemented on `feat/whatsapp-controls`. The owner confirmed linked chats and
login persistence after restarting. Private Web module shapes and calling gates
were observed on the real linked page. The owner subsequently confirmed a successful
outgoing call with good audio after the fixes below; incoming calls and sustained
kiosk reliability remain unverified. TASK-63 tracks implementation; TASK-61 retains real-device proof.
The owner requires calls to stay inside GrammieGuide. Video is disabled.

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

## Earlier probe and live setup progress

Analysis files are outside the source repository at
`C:/Users/koreo/GrammieGuide-analysis/whatsapp-2.2640.100.0/`:
`Inspect.csproj`, `Program.cs`, `activation-il.txt`, `protocol-il.txt`, `voip-il.txt`,
and `web-probe.cjs`. REA Evidence is exported alongside that folder.

The sign-in probe hosts WhatsApp Web inside an Electron window. It denies device
capture and popups and never places a call. Its persistent session is under
`%APPDATA%/GrammieGuide/WhatsApp`; it does not reuse the desktop app login.
Its optional status output contains booleans only. Login selectors are heuristic
diagnostics, not a production readiness signal.

The environment's automatic approval rejected the initial standalone probe launch
with `blocked by policy`. That historical probe was saved and syntax-checked; it
was not run. The subsequent in-app setup is now implemented separately, and the
owner has confirmed successful linking and visible chats there. The old probe
is retained as investigation material, not the current setup entry point:

```powershell
& .\node_modules\electron\dist\electron.exe 'C:\Users\koreo\GrammieGuide-analysis\whatsapp-2.2640.100.0\web-probe.cjs'
```

The original proposal above preceded the linked-page investigation below. Real
calling reliability, two-way sound and the kiosk's microphone remain unverified.

## Linked Web investigation and original bridge

REA inspected the actual linked page passively with text, accessibility, console,
storage and WebSocket capture disabled. Evidence:

- Structural capture: `ev_c47aa8b258d60f213ba39760b961a04c93027d973651071622d333eeafc92460`.
- Public asset inventory: `ev_e45e0cb6c54ebf0fee823590e380e1389a95a9080d78176a5f825495b389d30a`.
- Public static JS sources: `ev_2e329c2572b55114441a5be85e42367b99eb65cbd9fe24abfe3c5ee2ef82fe40`.
  The producer returned a resource-constraint transport error; its completed
  evidence remained available and was exported rather than capturing again.

Evidence bundle: `C:/Users/koreo/GrammieGuide-analysis/whatsapp-web-calling-20261025-evidence.json`.
The adjacent `whatsapp-web-public-js/manifest.json` maps 35 extracted public JS
files to their URLs and SHA-256 digests, checked against the captured artifacts.
`all-modules.json` and `call-modules.json` retain offsets in hash-named originals.
Provider source is analysis material outside the repository and is not shipped.

Separate ordinary Playwright/CDP read-only probes established module availability
and public enum values; REA did not evaluate JavaScript. They returned no messages,
contact list, cookies, storage or credentials, and placed no calls. Observed:

- Real Chromium `152.0.7977.130`; calling/UI gates true, unsupported-browser false.
- Cached stack exists with `type: 'web'`; start/accept/reject/end method shapes exist.
- Direct `WAWebCallCollection` with no active/pending call; local state `None` (0).
- `CallActive` is 6; `ConnectedLonely` is 11, and is not evidence of an answered call.

Static source analysis identifies these private contracts:

| Operation | Observed contract |
| --- | --- |
| Start voice | `WAWebVoipStartCall.startWAWebVoipCall(Wid, false, 0, 0, null, {entryTrust: 'user_gesture'})` |
| Answer voice | Cached Web stack `acceptCall(true, false, null)` |
| Decline | Cached Web stack `rejectCall()` |
| End | Cached Web stack `endCall(EndCallReason.Self, true)`; Self observed as 2 |
| State | Local state store plus `activeCall.getState()`, pending outgoing and current model |
| Peer mapping | `WAWebLidMigrationUtils.toPn(peerJid)` if locally resolvable; otherwise unknown |

The original integration validates these shapes on each operation and fails closed
on changes. A true start result or undefined stack result is submission, not proof
of connection. Runtime state is validated/redacted in main. Only explicit trusted
Start/Answer grants the owned main frame audio capture; no camera/screens/popups.
End has bounded native signaling followed by local renderer destruction. No private
native DLLs, URI handoffs, guessed clicks or copied provider code are used.

The local built-app fixture exercises the bridge and UI without WhatsApp traffic.
It cannot prove the live media transport works: real outgoing/incoming voice,
busy/unanswered/offline, popup behavior and Windows device access remain TASK-61
release checks. This implementation is a development integration, not a verified
production calling replacement.

## First real-call failure investigation

The owner initiated calls to a different WhatsApp account and reported the generic
unconfirmed/unavailable message. The initial implementation also left an incorrect
instruction to press End after its local peer had been destroyed. Diagnostics now
emit fixed failure codes only, and the instruction follows the current call state.

A read-only live check found the account linked, calling gates enabled, socket
connected, VoIP initialized, and audio input/output devices present. A debugger
trace on the public module's outgoing-call stop functions captured the fixed reason
`lid_resolution_failed` from an owner-initiated attempt. Only whitelisted reason
codes were returned; no phone numbers, messages or provider credentials were read
out. A duplicate development server initially interrupted tracing; it was stopped
before collecting this result.

Static source shows that `WAWebQueryExistsJob.queryPhoneExists(E164)` performs the
interactive contact lookup and stores PN/LID mappings. The bridge now performs that
lookup on explicit Start and uses the resulting LID for the high-level call entry.
It refuses missing recipients or unresolved identities before signaling. The local
fixture now requires this lookup, uses a fake audio device with real permission
handlers, and exercises rejected-start recovery. Live success after this correction
still requires owner confirmation; the earlier attempts did not establish a call.

A subsequent attempt progressed past lookup but returned an uninspectable initial
call snapshot. The bridge had treated that first snapshot as a failed submission.
It now polls for the worker's actual call model within its existing bounded wait,
without resubmitting Start. A local regression deliberately delays model creation;
the unit test verifies one Start followed by Read. A live activation trace also
showed local state Calling (1) with an active model that did not yet expose numeric
state at activation. No peer IDs or call content were returned by this trace.

Latest checks: build/typechecks, lint and 99 focused tests pass. The call e2e passes
with real permission handling and a fake audio device. The separate existing
account-setup e2e timed out at 60 seconds twice in this run; it is not reported
green and its timeout was not increased.

After the lookup and state-wait corrections, the owner reported that the outgoing
call worked and sounded great. A subsequent read-only status check showed ready,
no active call, no pending operation and voice available again. This confirms the
owner's outgoing-call/audio check and return to idle; it does not establish live
incoming answer/decline, failure recovery under all conditions or kiosk readiness.
