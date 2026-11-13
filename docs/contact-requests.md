# Family callback requests (TASK-22, TASK-33 and TASK-54)

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
no text and does not verify the account or sender; the test below does. Contact
settings and provider credentials cannot change while her real request's guard is
active. A caregiver test does not hold them: it keeps its own copy of the person
it texted.

## Twilio setup

1. In the Twilio Console, buy or choose a phone number that can send and receive
   SMS. This is the **sender number**, written like `+15551234567`.
2. For texts to US phones from an ordinary 10-digit number, complete **A2P 10DLC**
   registration (a brand, a campaign, and the number added to that campaign's
   Messaging Service). Carriers block texts from unregistered numbers, whatever
   the volume. A toll-free number goes through toll-free verification instead.
   Approval can take days; until then a test shows "Sent" but not "Delivered".
3. Under **Settings > Account settings > API keys & auth tokens**, create a
   **Standard** API key. Copy the key SID (`SK...`) and its secret; the secret
   is shown once. The Account SID (`AC...`) is on the Console's account page.
   The app never uses the account's main Auth Token.
4. In **admin > Contacts > SMS credentials**, enter the Account SID, API key SID,
   API key secret and sender number, and the Messaging Service SID (`MG...`) if
   you send through one. Enter them only there, never in a chat or a file.
5. Run the test below.

## Caregiver test text (TASK-54)

**admin > Contacts > Test a callback text** sends one real text, worded as a
test ("TEST from GrammieGuide. This is a caregiver check, not a request for
help. Reply YES..."), to the first or second saved person, through the same
saved request lifecycle as her own requests. The panel shows three separate
lines, each needing its own evidence:

- **Sent**: Twilio accepted the text. A refusal (any 4xx reply: wrong key,
  secret, sender or number) is a definite failure, shown as such, and another
  test can be sent at once after fixing the settings. A lost or unreadable
  answer is uncertain: it is shown as such and never sent again.
- **Delivered**: only Twilio's `delivered` status. Queued and sent are not delivery.
- **Seen**: a new `YES` from that phone, sent after the test began.

A test lasts five minutes; delivery not confirmed within two reads as
unconfirmed and keeps being checked until the test ends. While a test is open no
second test can start, whichever person is chosen, and reading or reopening the
panel never sends. Tests never appear on her Home. A test is refused while her
own request is open, and an open test never blocks her request: if both are open
for the same person, a YES counts for her request first. The panel supplies only
a saved person's ID; `contacts:testState` and `contacts:startTest` require the
unlocked caregiver window's main frame. The activity log gets content-free
events (`contact-test-started`, `contact-test-refused-<reason>`,
`contact-test-<status>`), never a name, number or message. `contacts:list`
summaries carry `purpose`, so TASK-25's dashboard can tell tests from her
requests.

TASK-17's real delivery/YES proof remains outstanding: no live message has been
sent by this app yet. Run the caregiver test below with the registered sender
before enabling this for daily use; also check the photo, text, touch targets and
fallback on her actual kiosk. The request does not place a live call or guarantee
someone will call. Keep her real telephone available. TASK-25 owns the dashboard
UI.

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
- A provider refusal of the send itself (a 4xx reply) is `failed`, not `unknown`:
  no message was created, so the fallback is tried at the next poll.
- Repeated taps return the current request for its entire configured lifetime,
  even if answered or failed. A new request is permitted at expiry, with a new ID.
  Real and test requests have distinct state. A test with a definite result
  (answered or failed) releases its guard early; an uncertain one keeps it. A
  test cannot start for a person with anything still open, but a test never
  refuses her real request.

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
`npx playwright test tests/e2e/contact-family.spec.ts tests/e2e/contact-requests.spec.ts tests/e2e/contact-test.spec.ts tests/e2e/home-preview.spec.ts`.
`tests/unit/contactTest.test.ts` and `tests/e2e/contact-test.spec.ts` cover the
caregiver test with a fake channel: one text per test, separate sent, delivered
and YES results, refusal, uncertain submission across a restart, expiry, and
isolation from her own request in both directions. These checks do not replace
a real test text through the registered sender.
