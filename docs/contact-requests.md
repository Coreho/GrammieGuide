# Family callback requests (TASK-22 and TASK-33)

Home offers **Ask {name} to call** in its reserved footer space when enabled.
The button shows the preferred person's library photo, with a phone icon if the
photo is missing. It opens a calm status screen with Back to Home and, while
music is playing, Stop music. Closing this screen does not cancel or resend a
request. Contact taps bypass confusion detection; an open status screen prevents
idle dimming. Both Home layouts and all five font sizes retain the same footprint.

In **admin → Contacts**, set a familiar name (up to 12 characters), international
SMS number, optional library photo, and optional distinct fallback person. Choose
the fallback wait (1–30 minutes) and request expiry (2–60 minutes, longer than
the fallback wait). Enable the Home button and save. Contact setup is off by
default; migration 018 preserves existing settings and secrets.

Under **SMS credentials**, enter a Twilio Account SID, API key SID/secret, sender
number and optional Messaging Service SID. Use a registered SMS sender that can
receive replies. Saved provider values are write-only and never read back to a
renderer. Contact numbers are returned only to the unlocked caregiver window;
public config and Home never receive them. Dedicated channels enforce both the
unlock and the caregiver main-frame identity. Saving setup or credentials sends
no text and does not verify the account or sender. Contact settings and provider
credentials cannot change until any active real/test request guard expires.

TASK-17's real delivery/YES proof remains outstanding. No live messages were
sent during this work. Run that proof with the registered sender before enabling
this for daily use; also check the photo, text, touch targets and fallback on her
actual kiosk. The request does not place a live call or guarantee someone will
call. Keep her real telephone available. TASK-25 owns the dashboard UI and
TASK-54 owns the separate caregiver test-request panel.

`startContactRequests(userData, getTwilioConfig)` creates one service, recovers
saved work and polls every ten seconds without delaying Home. Bootstrap supplies
a main-only getter for saved credentials. Like Buddy's API key, these live in
the main config file, are removed by `toPublicConfig`, and are never included in
the request journal or settings backups. There is no claim of encrypted-at-rest
credential storage. Home polls redacted status sequentially once per second.

Main-process callers use `getContactRequests().request(options)`. Options contain
the purpose (`real` or `test`), one preferred contact and an optional distinct
fallback (stable IDs and E.164 numbers), expiry of 1 minute to 24 hours, and a
fallback wait of at least one second and less than expiry. `ContactController`
derives these options only from validated saved settings. `contacts:request`
accepts no request payload and is limited to the launcher's main frame.
`contacts:home` returns only display metadata and redacted status. Names and
photo IDs are captured with each send so historical requests retain their actual
contact identity. Buddy points explicit distress statements to the configured
Home button, even without an AI key; chat has no ability to send a request.

## Status and retry rules

- Intent is flushed to an atomic disk journal **before** each external send.
  Submission returns an outbound SID, which is saved before it is considered
  trackable. A submission alone leaves status `sending`.
- `delivered` requires the provider's delivered status. Queued, accepted, sending
  and sent statuses do not establish delivery. A failed poll preserves a prior
  confirmed delivery; otherwise the fallback deadline makes a pending attempt
  `unknown`. Confirmed failed/undelivered/canceled messages become `failed`.
- `answered` requires a new, timestamped inbound `YES` (case insensitive, trimmed)
  from the attempted number to the actual outbound sender. Its provider SID is
  saved and cannot acknowledge another retained request. It does not establish
  that a callback will happen. An acknowledgement does not fabricate a delivery
  receipt when the provider has not reported one.
- The fallback is attempted once after confirmed failure or the fallback wait,
  including when delivery is unknown or delivered but unanswered. Both attempts
  keep being checked, so a preferred contact's late YES after fallback is retained.
- Every send attempt is made at most once locally. A crash or lost POST result
  before the SID is durable becomes `unknown`; it is never blindly resent or
  matched by guessing which outbound SMS was ours. Disk failures disable that
  service instance until restart. Corrupt history is preserved and fails closed.
- Expiry stops polling and automatic fallback. Replies observed during a poll
  must have provider timestamps strictly after the attempt and before expiry;
  expired requests do not resume. A recorded answer remains in history.
- Repeated taps return the current request for its entire configured lifetime,
  even if answered or failed. A new request is permitted at expiry, with a new ID.
  Real and test requests have distinct state; overlapping contacts cannot be used
  by both while either request's tap guard is active.

Plain YES has no embedded request ID: correlation uses phone numbers, provider
timestamps and consumed reply SIDs. It cannot establish which message someone
intended to answer if they delay replying until after a later request has begun.
This is a limitation of decision-02's chosen protocol, not proof of human intent.
The kiosk clock must be correct for expiry and timestamp checks.

## Storage and caregiver access

`userData/contact-requests.json` retains the latest 1,000 requests. New requests
may evict only old requests whose tap guards have expired. The file contains
contact-number/name/photo snapshots, provider IDs, statuses and timestamps, but no SMS text
or credentials. It stays outside general settings backups. Invalid or oversized
history is not reset to empty; that could produce duplicate family notifications.
Contact setup is also excluded from settings backups. Restore preserves the
device's entire existing contact setup rather than pairing an imported name
with an unrelated saved number. Configure it separately on another computer.

`contacts:list`, exposed as `window.admin.listContactRequests()`, requires the
main-process admin unlock. It returns redacted summaries with request/contact
IDs, purpose, statuses and times. It exposes no phone numbers, SMS text or
provider IDs. TASK-25 can consume this API. Startup history failures log only the
generic `contact-history-unavailable` event, once per app run.

## Verification

Unit tests exercise duplicate taps, pre-send disk failure, accepted-before-SID-save
failure, restart, uncertain POSTs, offline polling, delivery vs acknowledgement,
fallback, late replies, reply reuse, expiry boundaries, real/test isolation,
bounded history and private summaries. Disk tests use real temporary files and
verify corrupt history stays untouched. Twilio adapter tests use fake HTTP
responses; all operations have a ten-second deadline, response size limits and
bounded pagination, and POST is never retried. The adapter follows the
[Twilio Message resource](https://www.twilio.com/docs/messaging/api/message-resource).

`tests/e2e/contact-requests.spec.ts` starts the built Electron app with a journal
representing a lost submission, verifies recovery to unknown without a second
attempt, and exercises the real preload/IPC caregiver gate and private summaries.
The wrong-phone acknowledgement condition was inverted temporarily; the stale
and wrong-number reply test failed as expected, then the source was restored.
TASK-22 added settings/controller/IPC/message/Buddy unit checks and
`tests/e2e/contact-family.spec.ts`, covering real caregiver setup with fake SMS,
photo selection/removal, all font sizes/layouts, repeated taps, Home reload,
delivery vs YES, fallback, a late preferred YES, failure, expiry and a wide name.
A temporary phone-redaction mutation was caught by the privacy test and restored.

Run `npm test`, `npm run build`, `npm run lint`, and then
`npx playwright test tests/e2e/contact-family.spec.ts tests/e2e/contact-requests.spec.ts tests/e2e/home-preview.spec.ts`. These checks do not replace
TASK-17's live channel proof or TASK-54's eventual caregiver test.
