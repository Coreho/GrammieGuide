# WhatsApp call controls

Implemented on `feat/whatsapp-controls` for TASK-62 and TASK-63, using the
[REA findings](whatsapp-integration-investigation.md). Account linking and login
persistence are confirmed by the owner. The original voice bridge and Home UI are
implemented and exercised with a local provider fixture. **The owner confirmed a
successful outgoing call with good audio after the lookup and state-wait fixes.**
The owner also confirmed incoming calls with good audio. Sustained kiosk reliability
remains unverified. This is a development integration; it is not yet ready to replace
the real kiosk's calling arrangements.
Video remains disabled. WhatsApp's private Web modules can change without notice.

## Caregiver setup and use

1. Press **Ctrl+Shift+A**, unlock the caregiver panel and open **Contacts**.
2. Use **Open WhatsApp setup** to link or inspect the account, then close setup.
   Login uses the isolated `persist:whatsapp` session, separate from Windows WhatsApp.
   The owner confirmed chats return after restarting without another QR scan.
3. Save preferred/fallback family contacts with their WhatsApp phone numbers.
   These are also the saved contacts used by the existing callback feature;
   enabling live calls does not require Twilio credentials or enable SMS requests.
4. In **Tiles**, add a **Built-in → Family calls** tile in an available Home slot.
   Its presence starts the hidden embedded connection. No calls start automatically.
5. Open **Family calls** on Home and press **Call {name}**. Incoming saved-contact
   voice calls offer **Answer** and **No, thank you**. Unknown/group/video callers
   cannot be answered through this interface. Active calls always offer **End call**.

Keep the separate **Windows WhatsApp desktop app fully closed** while using
GrammieGuide. If both clients are running on the linked account, the desktop app
can display its own incoming-call window alongside GrammieGuide's Answer screen.
The owner's `CallerWindow.png` showed this duplicate desktop-client window.
GrammieGuide uses its own saved Web session and does not need the desktop client
running. Closing the desktop client left GrammieGuide ready for calls. A new live
incoming-call check is being used to confirm that only its launcher screen appears.

For caregiver testing, **Prepare voice calls** starts the connection without a
Home tile. **End call / close connection** stops it. Account setup cannot replace
an active call. Closing or locking the admin panel closes account setup but does
not terminate a Home call. Home reload/close, app quit, call renderer failure,
removing the calling tile and explicit teardown release the embedded peer.

Calls use a sandboxed hidden `WebContentsView` owned by GrammieGuide. Grandma
sees the trusted large controls; the account's chat interface and provider call
windows are not shown. All popup windows, external navigation, downloads, camera
and screen capture are denied. Microphone permission is leased only after an
explicit Start/Answer, only for audio in the exact owned WhatsApp main frame.
Music pauses, Buddy speech/listening stops and other web-page audio is muted while
a call is pending or active. The call holds the screen awake through audio policy.

## Application API

Both typed preloads expose:

```typescript
await window.launcher.prepareWhatsApp()
const stopWatching = window.launcher.onWhatsAppChanged(state => {
  // Render reported state and availableActions, never infer answered from a click.
})
const result = await window.launcher.controlWhatsApp({
  type: 'start', contactId: 'preferred', mode: 'voice'
})
// Answer, decline and end require state.call.id, an opaque local ID.
// result.ok acknowledges the operation; it does not mean the person answered.
await window.launcher.closeWhatsAppCalls() // native hang-up plus bounded local teardown
stopWatching()
```

The admin equivalent uses `window.admin`. Main-frame launcher or unlocked caregiver
only; queued commands recheck authorization. Remote pages cannot invoke the API.
Renderers supply saved contact IDs, never numbers, URLs, provider call IDs or code.
Only display identities and local opaque call IDs leave main. No chat content,
credentials or call content is logged. SMS delivery/YES states remain separate.

Setup API: `getWhatsAppSetup`, `openWhatsAppSetup`, `closeWhatsAppSetup`,
`onWhatsAppSetupChanged`; caregiver only. The browser identity removes Electron
and GrammieGuide product tags while retaining the actual bundled Chromium version.
This resolved the unsupported-browser page in the owner's `walink.png`. Setup
markers report a link phase only and never establish calling readiness.

## Runtime and failure contract

`whatsAppRuntime.ts` is original integration code serialized into the exact
WhatsApp origin. It uses the observed high-level voice-start method and cached Web
stack for answer/decline/end. It never loads native WhatsApp DLLs or launches a URI.
Before Start it uses WhatsApp's interactive `queryPhoneExists` lookup and resolves
the returned identity to a LID. A phone-only Wid plus device-list sync did not
resolve the owner's saved recipient: real user-initiated attempts stopped with
`lid_resolution_failed`. Missing lookup results/mappings now fail before signaling;
the bridge does not create a chat, send a message, or retry Start automatically.
Every read checks calling gates, the Web stack, required methods, local call state
and active model. Only the provider's `CallActive` state produces **Talking with**;
`ConnectedLonely` remains connecting. A successful start without an observed model
is unconfirmed, never an answered call. No command is automatically retried.

`WhatsAppAdapter` validates and revisions every observation. `call: null` while
ready means positively idle; unavailable/disconnected cannot establish hang-up.
Only main-process proof that the local renderer was destroyed can clear an
uncertain call without provider idle. Incoming caller numbers are resolved locally
from the current peer only; unresolved LIDs and non-saved contacts cannot answer.
Video answer is denied. Controller operations are serialized and bounded to 10s.

End attempts the native decline/hang-up and, after at most 1.5s, closes the local
renderer. This path remains available during unknown state or a hung command.
Timeout/cancellation destroys the remote renderer so late provider promises cannot
leave a hidden microphone/call. Local teardown proves this computer disconnected;
it does not claim the other device received a particular signaling event.

## Verification and remaining release checks

Unit tests cover runtime contracts, controller privacy/authority, duplicate and
stale commands, cancellation, malformed observations, device permission policy,
session lifecycle, and call priority in audio policy. Built-app tests intercept all
WhatsApp requests in a fresh temporary profile: linking/isolation, outgoing and
connected states, lonely/connecting state, incoming answer, unknown-caller refusal,
native end and hung-end teardown. They do not contact WhatsApp or anyone's phone.
The call fixture also requires recipient lookup before Start and uses Chromium's
fake audio device through the actual session permission handlers. Rejected starts
verify that the screen stops recommending End after local teardown removed it.

Before real kiosk use (TASK-61): repeat incoming/outgoing and two-way
sound checks on the kiosk, busy/unanswered/offline behavior, actual
microphone permissions on Windows, reconnect/restart after calls, provider popup
behavior, crashes and the real touchscreen at each text size. Video needs a
separate in-app rendering design and verification. The old full-unit run also had
unrelated filesystem/hook timeouts in media-library tests; limits were not raised.
