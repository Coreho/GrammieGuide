# Spec 1: Scam shield

## Goal

Stop the most common scams aimed at elderly web users before she can act on
them, inside the embedded browser she already uses: fake virus alerts with a
phone number, "your account is locked, call now" pages, unexpected payment
forms, and forced downloads. When the shield fires she is taken home calmly
and the caregiver gets the details.

Not a goal: general content filtering, a safe-browsing service, or blocking
legitimate shopping on sites the caregiver has approved.

## What she experiences

1. She taps a web tile and browses normally. Nothing changes on ordinary
   pages.
2. A page trips the shield. The page disappears (the browser closes) and a
   full-screen clay overlay appears on Home, in the same tone as the
   confusion overlay but visually distinct from Help:

   > **That page was trying to trick you.**
   > It asked for money or tried to scare you. You did nothing wrong.
   > We've left it. Sarah can take a look at it later.
   > [ Okay ]

   The caregiver's first name comes from a new `caregiverName` field
   (see Config). If unset, the line reads "Your family can take a look."
3. The overlay auto-dismisses after 12 seconds or on tap. No sound.
4. Buddy is not involved in the moment (no API call on a safety path). Later,
   Buddy's behavior machine may show a "watching over you" pose while the
   overlay is up.

She never sees a URL, a reason code, or a chance to "continue anyway".

## What the caregiver experiences

- Activity tab shows `scam-shield-blocked` events with the domain, the
  reason codes (see Signals) and the score.
- A new **Safety** admin tab holds the shield settings and an allow-list
  editor. Each blocked event has an "Allow this site" button that adds the
  domain to the allow-list in one tap.
- Downloads and permission prompts are always blocked; the caregiver cannot
  turn those off.

## Signals and scoring

Detection runs in the browser view preload (`src/preload/browserView.ts`),
which already runs in every embedded page with `contextIsolation` and
`sandbox` on. It has DOM access but the page cannot see it. The scoring
itself is pure and lives in `src/shared/scamShield/score.ts` so Vitest can
test it against text fixtures without a DOM.

The preload extracts a compact `PageFacts` object and hands it to the
scorer:

```ts
type PageFacts = {
  hostname: string
  visibleText: string           // innerText of body, capped at 20k chars
  hasCardFields: boolean        // autocomplete=cc-*, or name/id matching card|cvv|cvc|expir
  cardFieldCount: number
  telLinkCount: number
  phoneNumberCount: number      // regex on visibleText
  fullscreenRequested: boolean  // document.fullscreenElement set by page
  isModalCovering: boolean      // fixed-position element covering >80% viewport
  audioPlaying: boolean         // any <audio>/<video> playing without user gesture
  historyPushCount: number      // pushState calls in the first 5s
}
```

Scorer returns `{ score: number; reasons: ReasonCode[] }`. Reason codes and
weights (starting values, tuned during real-hardware testing):

| Code | Signal | Weight |
|------|--------|--------|
| `tech-support-phrase` | phrases such as "your computer is infected", "call microsoft", "windows defender alert", "your account has been suspended", "do not close this window" | 50 each, cap 100 |
| `urgency-phrase` | "act now", "immediately", "within 24 hours", "final notice", "you have won" | 15 each, cap 45 |
| `phone-with-urgency` | phone number present **and** any urgency or tech-support phrase | 40 |
| `tel-link-prominent` | `tel:` link inside an element whose font size ≥ 28px | 30 |
| `covering-modal` | `isModalCovering` | 25 |
| `forced-fullscreen` | `fullscreenRequested` without a user gesture | 40 |
| `autoplay-audio` | `audioPlaying` | 25 |
| `history-trap` | `historyPushCount ≥ 5` | 40 |
| `payment-form` | `hasCardFields` on a non-allow-listed domain | 60 |
| `gift-card` | "gift card", "itunes card", "google play card", "bitcoin atm" | 40 each, cap 80 |

Thresholds by sensitivity:

| Sensitivity | Block at | Notes |
|-------------|----------|-------|
| `normal` (default) | ≥ 80 | payment form alone does not block unless combined with anything else |
| `strict` | ≥ 60 | payment form alone blocks |

Phrase matching is case-insensitive, whitespace-normalized, and word-boundary
anchored. The phrase lists live in `src/shared/scamShield/phrases.ts` so they
can be extended without touching the scorer.

Allow-listed domains (and their subdomains) skip `payment-form` and
`tel-link-prominent` but never skip `tech-support-phrase`,
`forced-fullscreen`, `history-trap` or `autoplay-audio`. A compromised ad on
a trusted site should still trip.

## When detection runs

The preload evaluates:

- on `DOMContentLoaded`,
- 2 seconds after `load` (many scam pages inject the modal late),
- on a debounced `MutationObserver` (500ms) for the first 30 seconds,
- on any `submit` event in capture phase, and on `beforeinput` into a card
  field, both of which are `preventDefault()`ed while a score is pending.

Each evaluation sends `ipcRenderer.send('browserView:scamSignal', facts)`
only when the score is above `20`, to keep IPC quiet on normal pages. The
preload never decides; it reports.

## Main process behavior

New service `src/main/services/browser/scamShield.ts`:

- `handleSignal(facts)`: re-runs the scorer (the preload result is not
  trusted, the facts are), applies the allow-list and sensitivity from
  config, and if the threshold is met:
  1. `closeEmbeddedBrowser()`
  2. `logActivity('scam-shield-blocked', `${hostname} ${score} ${reasons.join(',')}`)`
  3. `logReliabilityEvent({ op: 'scam-shield', ok: true, detail: hostname })`
  4. push `browser:scamBlocked` to the launcher with `{ hostname, reasons }`
     (the renderer only uses `reasons` to pick the overlay wording).
  5. Add `hostname` to an in-memory cooldown set for 5 minutes so a tile
     pointing at the same scam page cannot reopen it silently; reopening
     during cooldown shows the overlay immediately without loading the page.
- Hardening applied when the `WebContentsView` is created in
  `embeddedBrowser.ts`, regardless of config:
  - `webPreferences.disableDialogs: true` (no `alert()`/`confirm()` loops).
  - `session.setPermissionRequestHandler` denies everything (notifications,
    camera, microphone, geolocation, midi, clipboard).
  - `session.on('will-download', e => e.preventDefault())`, logging
    `scam-shield-download-blocked`.
  - `webContents.on('will-prevent-unload', e => e.preventDefault())` so
    "are you sure you want to leave" traps cannot hold the page.
  - `tel:`, `mailto:`, `ms-*:` and other non-http navigations are already
    blocked by `urlPolicy.ts`; a blocked `tel:` now also counts as a
    `tel-link-prominent` signal.
- The browser view uses its own `session.fromPartition('persist:browser')`
  so these handlers and the ad blocker (see News spec) do not affect the
  launcher and admin renderers.

## Config

```ts
scamShield: z.object({
  enabled: z.boolean().default(true),
  sensitivity: z.enum(['normal', 'strict']).default('normal'),
  allowedDomains: z.array(z.string()).default([]),   // bare hostnames, lower-case
  caregiverName: z.string().optional()
})
```

Schema bump: `CURRENT_SCHEMA_VERSION` +1, migration
`NNN-scam-shield.ts` fills defaults. `caregiverName` is placed here for now;
if a later "caregivers" block appears (alerting, help escalation) the field
moves there in that migration.

## IPC

`IpcApi`:
- `scamShield:allowDomain: { request: { hostname: string }; response: PublicConfig }` (admin, `requireAdminUnlocked`)
- `scamShield:removeDomain: { request: { hostname: string }; response: PublicConfig }` (admin)

`IpcEvents`:
- `browser:scamBlocked: { hostname: string; reasons: ReasonCode[] }`

Renderer-to-main fire-and-forget (same pattern as `browserView:activity`):
- `browserView:scamSignal` with `PageFacts`.

## Renderer

- `src/renderer/launcher/src/components/ScamShieldOverlay.tsx` built on
  `OverlayShell`, z-layer `scamShieldOverlay`. Wording varies by dominant
  reason: money words for `payment-form`/`gift-card`, "tried to scare you"
  for `tech-support-phrase`/`forced-fullscreen`/`autoplay-audio`, generic
  otherwise.
- `App.tsx` subscribes to `browser:scamBlocked`, sets `view` to `home` and
  shows the overlay. It also clears the "Opening…" toast if present.
- Admin `SafetyTab.tsx`: enable toggle, sensitivity radio, caregiver name,
  allow-list with add/remove, and the last 20 blocked events with "Allow
  this site".

## Privacy

Only `hostname`, `score` and reason codes leave the preload's evaluation
and get logged. `visibleText` is used for scoring inside the preload and
sent to main for re-scoring, but main discards it after scoring and never
logs it. Nothing about page content is persisted.

## Tests

Unit (`tests/unit/scamShield.test.ts`):
- fixtures: a fake tech-support page, a gift-card scam, a real-looking
  checkout on an allow-listed domain, a news article with the word
  "immediately" in a headline (must not block), a bank login page (must not
  block on `normal`).
- allow-list skips payment but not tech-support signals.
- subdomain matching (`shop.example.com` allowed by `example.com`).
- cooldown set expires.

E2E (`tests/e2e/scam-shield.spec.ts`):
- start a local HTTP server serving a scam fixture page.
- add a web tile pointing at it through the admin window, tap it, assert the
  overlay text appears and the browser view is gone.
- second tap within cooldown shows the overlay without loading.

Real-hardware check: browse five ordinary sites she actually uses (from her
tile list) for ten minutes each with sensitivity `strict` and confirm zero
false blocks before shipping `normal` as the default.

## Out of scope for this spec

- Safe-browsing or reputation lookups (network dependency, privacy).
- Blocking inside Buddy chat (the Buddy prompt already refuses financial
  topics).
- Pushing the alert to the caregiver's phone. The `scam-shield-blocked`
  activity event is the hook for that future channel.
