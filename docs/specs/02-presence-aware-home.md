# Spec 2: Presence-aware Home

## Goal

The kiosk knows whether someone is sitting in front of it. When she arrives,
the screen brightens and Buddy greets her by name. When she leaves, the
Home screen settles into a calm dimmed state and any open web page closes.
The caregiver can see when she was last present.

Detection is simple motion differencing on the built-in webcam, entirely
inside the launcher renderer. No frames are stored, transmitted, or shown
outside the admin panel's setup preview. No face recognition.

Not a goal: identifying *who* is present, fall detection, or medical
monitoring. This is a comfort and orientation feature with a side benefit
for the caregiver.

## What she experiences

**Arriving.** The dim veil lifts over 600ms. Buddy stretches (existing
greet animation) and a speech bubble shows a time-of-day greeting from a
local list, using her name from config:

> Good morning, Margaret. It's Tuesday.

The greeting is canned and instant, never an API call. The bubble fades
after 8 seconds. At most one greeting per `greetCooldownMinutes` so a short
trip to the kitchen does not trigger a second "good morning".

**Present.** Nothing changes; the screen behaves as it does today.

**Leaving.** After `awayAfterMinutes` of no presence:
- if the embedded browser is open, it closes (same path as the inactivity
  timeout, logged as `browser-closed-away`),
- Home dims to 40% behind a soft veil (z-layer `presenceDim`), with the clock
  still readable,
- Buddy goes to a sleeping pose (behavior hook; the static M3 cat just
  lowers its head).

Tapping anywhere while dimmed also lifts the veil, so the feature can never
trap her if the camera fails.

## What the caregiver experiences

New **Presence** admin tab:
- Enable toggle (default **off**; the feature is opt-in because it turns on
  a camera in her home).
- Camera picker (list from `enumerateDevices`), with a live preview and a
  moving "motion level" bar so the caregiver can place the device and pick
  a sensitivity. The preview is the only place video is ever rendered.
- Sensitivity slider (maps to the pixel-change threshold).
- `awayAfterMinutes` (1–30, default 5), `greetCooldownMinutes` (default 30).
- Quiet hours (default 21:00–07:00): no greetings, no un-dim on motion, so a
  pet walking past at 3am does not light the room. Tapping still works.
- A status line: "Present since 9:12" / "Away since 11:40" / "Camera not
  found".

Activity tab gets `presence-arrived` and `presence-left` events. The
Reliability tab gets a `presence-camera` event when the camera fails to
open, so a disconnected USB webcam surfaces the same way as Wi-Fi trouble.

## Detection

Pure logic in `src/shared/presence/presenceDetector.ts`, unit-tested with
synthetic frames:

```ts
type Frame = Uint8ClampedArray   // 64x48 grayscale, 3072 bytes

function motionRatio(prev: Frame, next: Frame, pixelDelta: number): number
// fraction of pixels whose grayscale changed by more than pixelDelta

function createPresenceMachine(opts: {
  motionThreshold: number      // ratio above which a frame counts as motion
  presentAfterFrames: number   // consecutive motion frames to become present (default 3)
  awayAfterMs: number
})
```

The machine is an xstate v5 machine (first real use of the installed
dependency) with states `unknown → away ⇄ present`, plus a `cameraError`
state. It takes `MOTION`, `STILL`, `TICK`, `CAMERA_LOST` events and emits
`arrived` / `left` transitions. Hysteresis: three consecutive motion frames
to arrive, `awayAfterMs` of still frames to leave. A still person reading is
handled by the long away timer, not by trying to detect breathing.

Renderer side, `src/renderer/launcher/src/presence/usePresence.ts`:
- opens the camera with `getUserMedia({ video: { deviceId, width: 320, height: 240, frameRate: 5 } })`,
- every 500ms draws the frame to a 64x48 offscreen canvas, reads grayscale,
  computes `motionRatio` against the previous frame, feeds the machine,
- on transitions calls `window.launcher.reportPresence(state)`,
- releases the camera and stops the timer when `presence.enabled` turns off
  (config push via `config:changed`) or the window hides.

Work runs on the main thread of the launcher renderer at 2 fps on a 3k-byte
buffer; this is well under a millisecond per frame and does not need a
Worker.

## Main process behavior

`src/main/services/presence/presenceService.ts`:
- holds `{ state, since }`, updated by `presence:report`,
- logs `presence-arrived` / `presence-left`,
- on `left`: if the browser is open, `closeEmbeddedBrowser()` and log
  `browser-closed-away`, then push `browser:idle-timeout` so the renderer
  returns to Home exactly as it does for inactivity,
- exposes `getStatus()` for the admin tab,
- pushes `presence:changed` so the admin tab's status line is live.

Camera permission: `windowManager.ts` sets
`session.defaultSession.setPermissionRequestHandler` to grant `media`
(video only) to the launcher and admin renderers' own origins and deny
everything else. The browser view has its own partition (Scam shield spec),
so web pages can never inherit this grant.

Hook for future alerting: `presenceService` emits an internal
`notSeenSince(hours)` check every 15 minutes. It logs
`presence-not-seen` once per day when she has not been present since
`notSeenAlertHour` (default 10:00) and it is past that hour. Today that is
an activity event only; the alerting channel, when built, subscribes here.

## Config

```ts
presence: z.object({
  enabled: z.boolean().default(false),
  cameraDeviceId: z.string().optional(),
  sensitivity: z.number().min(1).max(10).default(5),
  awayAfterMinutes: z.number().min(1).max(30).default(5),
  greetCooldownMinutes: z.number().min(5).max(180).default(30),
  quietHours: z.object({ start: z.string().default('21:00'), end: z.string().default('07:00') }),
  notSeenAlertHour: z.number().min(0).max(23).default(10)
}),
person: z.object({
  firstName: z.string().optional()
})
```

`person.firstName` is introduced here because greetings need it. It is
placed in its own block so the life-book feature can grow around it later
without another move. Schema bump +1, migration `NNN-presence.ts`.

Sensitivity maps to `motionThreshold` as `0.12 - sensitivity * 0.01`
(so 5 → 7% of pixels changing counts as motion). Tune on hardware.

## IPC

`IpcApi`:
- `presence:report: { request: { state: 'present' | 'away' | 'cameraError' }; response: void }`
- `presence:getStatus: { request: void; response: { state; since: string | null } }` (admin)

`IpcEvents`:
- `presence:changed: { state; since: string | null }`

## Renderer

- `PresenceVeil.tsx`: fixed full-screen div at z-layer `presenceDim`,
  `background: rgba(20,20,18,.6)`, `pointer-events: none` (taps pass
  through to Home, which un-dims on the first pointer event), opacity
  transition 600ms.
- `GreetingBubble.tsx`: anchored above Buddy's canvas region, clay chip
  style, font-scale aware.
- Greeting list in `src/shared/presence/greetings.ts`: 4–6 lines per time
  band (morning, afternoon, evening), all with a `{name}` and `{weekday}`
  slot. Evening lines are the calmest (sundowning).
- Admin `PresenceTab.tsx` with the live preview `<video>` element, motion
  bar, and controls.

## Privacy and consent

- Off by default, with a one-line explanation in the admin tab of what the
  camera is and is not used for.
- The camera indicator LED will be on whenever presence is enabled; the
  spec accepts this rather than trying to hide it.
- Frames exist only in a canvas buffer that is overwritten every 500ms.
  No image data crosses IPC, is logged, or is written to disk.
- The only video rendered anywhere is the admin setup preview, behind the
  PIN.

## Tests

Unit (`tests/unit/presenceDetector.test.ts`):
- `motionRatio` on identical frames is 0; on inverted frames is 1.
- machine needs three motion frames to arrive, not one.
- machine leaves after `awayAfterMs` of still frames and not before.
- `CAMERA_LOST` moves to `cameraError` from any state; a new frame recovers.
- greeting selection respects quiet hours and cooldown (pure helper).

E2E: camera access cannot be assumed in CI. `tests/e2e/presence.spec.ts`
uses `__e2e__.reportPresence('present' | 'away')` to drive the main service
directly and asserts the veil, the greeting bubble and the closed browser
view. The camera path is verified with `scripts/debugPresence.ts` on the
real device, alongside the existing `debugReliability.ts`.

## Out of scope

- Face detection or recognition of any kind.
- Screen power or monitor brightness control (the in-app veil is enough for
  a kiosk that is always on; the OS power plan handles real sleep).
- Alerting the caregiver's phone. `presence-not-seen` is the hook.
