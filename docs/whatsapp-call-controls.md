# WhatsApp call-control interface

Implemented on `feat/whatsapp-controls` for TASK-62, based on the
[REA investigation](whatsapp-integration-investigation.md).

This is the control interface and caregiver panel. It is **not a working WhatsApp
calling transport**. The production adapter reports unavailable and cannot dial,
answer, or end a real call. No Windows-app launch, private DLL loading, credential
copying, or guessed remote-page click automation is enabled.

## Application API

Both typed preloads expose:

```typescript
const state = await window.launcher.getWhatsAppState()
const stopWatching = window.launcher.onWhatsAppChanged(state => {
  // Render only the reported state and availableActions.
})
const result = await window.launcher.controlWhatsApp({
  type: 'start', contactId: 'preferred', mode: 'voice'
})
// Answer, decline and end require state.call.id, an opaque local ID.
// result.ok acknowledges the operation; it does not mean the person answered.
stopWatching()
```

The admin equivalent uses `window.admin`. The Contacts tab includes the control
panel, reads saved family names, and shows voice/video buttons disabled while
the transport is unavailable. Incoming answer/decline and active-call end controls
are driven by observed state and capabilities. No Home calling tile is enabled
while the underlying transport is unverified.

IPC channels are `whatsapp:state`, `whatsapp:command`, and `whatsapp:changed`.
Only the launcher main frame or unlocked caregiver main frame can invoke them.
Queued caregiver commands recheck authorization before executing. Locked admin
windows do not receive push updates. Remote pages cannot invoke these controls.

The API accepts a saved `preferred` or `fallback` contact ID. Main obtains the phone
number from saved contact settings; a renderer cannot send a phone, URI or provider
call ID. Responses contain display identities and opaque local call IDs only.
SMS settings and delivery/YES status remain independent.

## Adapter obligations

`WhatsAppAdapter` is an injectable main-process boundary with `read`, `execute`
and `subscribe`. `location` must be `embedded`; a native-app handoff is rejected.
There is no renderer API for installing an adapter or injecting observations.

Provider observations are validated and revisioned. Every fresh observation must
increment the revision, including command replies. `call: null` means **positively
observed idle**, not a missing selector or failed inspection. A disconnected
transport cannot clear an active call or claim it ended. Only an observed
`connected` phase can produce a connected label.

`execute` must resolve with a newer observed snapshot. A successful URI launch or
button click alone cannot satisfy it. Timeouts abort the request, leave an
uncertain active call visible, and disable further starts until a fresh observation
establishes the actual state. No command is retried automatically. Incoming callers
outside saved contacts cannot be answered through this interface; decline remains
available if supported. Removing a caller from saved contacts revokes answer access.

A future real adapter must own its embedded view/session lifecycle, media permission
policy, account linking, audio coordination, and teardown. Before enabling capabilities,
prove actual outgoing and incoming call controls, hang-up, page/window crashes,
Home recovery, device access and restart behavior. Disposal cancels observation and
pending transport work; it does not itself assert that a remote call ended.

## Verification

Controller and IPC tests use an injected adapter to verify saved destinations,
privacy, authority gates, duplicate starts, stale IDs/observations, incoming calls,
timeouts, disconnects and subscription cleanup. Static React rendering checks
disabled controls and honest labels. These are not live WhatsApp call tests.

The initial DOM-interaction test attempt could not start its jsdom worker; an
independent jsdom import also stalled. The checked-in UI tests follow the existing
repository's static-render convention and do not depend on that environment.
Real browser interaction and call verification remain TASK-61 work.

Validation on 2026-10-25: production build/typechecks and repository lint passed;
all 20 focused WhatsApp tests passed. The broader unit run passed 1,237 tests and
failed eight media-library tests on timeouts (with a cleanup error after a timeout).
Running the two affected media test files alone also failed on filesystem/hook
timeouts: 50 passed and nine failed. Those media modules were not edited here;
the full suite is not green, and the timeouts were not hidden by raising limits.
